#!/usr/bin/env node
/** @file Start a lint command after validating one process-tree memory budget. */
import { existsSync, realpathSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLintArguments } from './lint-arguments.js';
import { MIB, probeMemory, resolveMemoryBudget } from './memory-budget.js';
import { processTreeMiB, runLintTasks } from './lint-runner.js';
import { acquireLintLease, readLintSession, startLintSession } from './lint-session.js';

const THREAD_MEMORY_MIB = 1024;
const COMMAND_MEMORY_MIB = 512;
const MINIMUM_WORKER_MIB = 128;
const RESERVATION_MARGIN_MIB = 32;

export const lintUsage = `Usage: ag-lint [--max-mem MiB] [--profile report.json] [Oxlint arguments]
       ag-lint [--max-mem MiB] --command executable [command arguments]

Default: eighty percent of observable available memory for the entire command.
Explicit budgets replace that policy but cannot exceed an observable hard limit.
Limits are monitored process-tree RSS, not a portable kernel-enforced hard cap.
Host limits outside the visible namespace cannot be inferred.
`;

/**
 * Run the selected engine without forwarding wrapper flags to it.
 * @param args - Wrapper and engine arguments.
 * @param options - Consumer working directory, output and cancellation settings.
 * @param options.cwd Consumer working directory.
 * @param options.print Help output callback.
 * @param options.signal Command cancellation signal.
 * @param options.stdio Child output handling.
 * @returns The engine exit code or a distinct resource-failure status.
 */
export async function runLintCli(
    args: readonly string[],
    options: {
        cwd?: string;
        print?: (text: string) => void;
        signal?: AbortSignal;
        stdio?: 'inherit' | 'ignore';
    } = {},
): Promise<number> {
    const startedAt = performance.now();
    const parsed = parseLintArguments(args);
    if (parsed.help) {
        (options.print ?? ((text) => process.stdout.write(text)))(lintUsage);
        return 0;
    }
    const hostLimit = process.env.AG_LINT_HOST_LIMIT_MIB;
    const hostAvailable = process.env.AG_LINT_HOST_AVAILABLE_MIB;
    const snapshot = probeMemory({
        ...(hostLimit ? { hostLimitMiB: Number(hostLimit) } : {}),
        ...(hostAvailable ? { hostAvailableMiB: Number(hostAvailable) } : {}),
    });
    const inherited = readLintSession();
    if (inherited && parsed.maxMemMiB !== undefined && parsed.maxMemMiB > inherited.maxMiB) {
        throw new RangeError('A child lint invocation cannot increase its parent memory budget.');
    }
    const budget = resolveMemoryBudget(snapshot, parsed.maxMemMiB ?? inherited?.maxMiB);
    const observedAt = performance.now();
    const cwd = resolve(options.cwd ?? process.cwd());
    const processLimits = snapshot.perProcessLimits ?? [];
    const processLimitMiB = Math.min(...processLimits.map((limit) => limit.limitBytes / MIB));
    const available = Math.min(budget.maxMiB, budget.availableMiB, processLimitMiB) - Math.ceil(processTreeMiB());
    const capacity = Math.max(1, Math.floor(available / THREAD_MEMORY_MIB));
    if (available < MINIMUM_WORKER_MIB + RESERVATION_MARGIN_MIB) {
        throw new RangeError('Insufficient memory headroom for one lint worker; no process was started.');
    }
    const requestedThreads = parsed.command ? undefined
        : parsed.args.find((value) => value.startsWith('--threads='))?.slice('--threads='.length)
            ?? (parsed.args.includes('--threads') ? parsed.args[parsed.args.indexOf('--threads') + 1] : undefined);
    const automaticThreads = Math.max(1, Math.min(inherited ? 1 : snapshot.parallelism, capacity));
    const threads = requestedThreads === undefined ? automaticThreads : Number(requestedThreads);
    if (!Number.isSafeInteger(threads) || threads < 1 || threads > automaticThreads) {
        throw new RangeError(`Thread request exceeds the resource-aware limit of ${automaticThreads}.`);
    }
    const command = parsed.command ?? process.execPath;
    const engineArgs = parsed.command
        ? parsed.args
        : [
            join(dirname(fileURLToPath(import.meta.resolve('oxlint/package.json'))), 'bin/oxlint'),
            ...(requestedThreads === undefined ? [`--threads=${threads}`] : []),
            ...parsed.args,
        ];
    const resolvedAt = performance.now();
    const session = inherited ? undefined : await startLintSession(budget, { usage: () => processTreeMiB() });
    const descriptor = inherited ?? session!.descriptor;
    const desiredReservation = parsed.command ? COMMAND_MEMORY_MIB : threads * THREAD_MEMORY_MIB;
    const reservation = Math.min(desiredReservation, Math.floor(available - RESERVATION_MARGIN_MIB));
    const parentLease = Number(process.env.AG_LINT_LEASE_MIB ?? 0);
    if (inherited && parentLease > 0 && reservation > parentLease) {
        throw new RangeError('Nested lint reservation exceeds its parent lease.');
    }
    const connection = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, connection.signal]) : connection.signal;
    let release: (() => void) | undefined;
    let report: Awaited<ReturnType<typeof runLintTasks>>;
    let coordination: ReturnType<NonNullable<typeof session>['metrics']> | undefined;
    try {
        if (inherited && parentLease === 0) {
            release = await acquireLintLease(
                inherited,
                reservation,
                parsed.command ? 1 : threads,
                signal,
                () => connection.abort(),
            );
        }
        report = await runLintTasks([{
            command,
            args: engineArgs,
            cwd,
            env: {
                ...process.env,
                AG_LINT_SESSION: JSON.stringify(descriptor),
                AG_LINT_LEASE_MIB: String(inherited ? parentLease || reservation : 0),
                AG_LINT_LEASE_THREADS: String(inherited ? 1 : snapshot.parallelism),
            },
            memoryMiB: reservation,
            threads: parsed.command ? 1 : threads,
        }], { budget, signal, stdio: options.stdio });
        coordination = session?.metrics();
    } finally {
        release?.();
        await session?.close();
    }
    if (report.status === 3) {
        process.stderr.write(
            `ag-lint: resource budget ${budget.maxMiB} MiB could not complete the command (observed peak ${Math.ceil(report.peakTreeMiB)} MiB).\n`,
        );
    }
    if (parsed.profile) {
        await writeFile(
            resolve(cwd, parsed.profile),
            `${JSON.stringify(
                {
                    ...report,
                    inheritedSession: Boolean(inherited),
                    coordination,
                    phases: {
                        argumentsAndBudgetMs: observedAt - startedAt,
                        engineResolutionMs: resolvedAt - observedAt,
                        executionMs: performance.now() - resolvedAt,
                        totalAfterModuleLoadMs: performance.now() - startedAt,
                    },
                    command,
                    engineArgs,
                },
                null,
                2,
            )}\n`,
        );
    }
    return report.status;
}

if (process.argv[1] && existsSync(process.argv[1])
    && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
    const controller = new AbortController();
    const interrupt = () => controller.abort('SIGINT');
    const terminate = () => controller.abort('SIGTERM');
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    try {
        process.exitCode = await runLintCli(process.argv.slice(2), { signal: controller.signal });
    } catch (error: unknown) {
        process.stderr.write(`ag-lint: ${(error as Error).message}\n`);
        process.exitCode = error instanceof RangeError ? 3 : 2;
    } finally {
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', terminate);
    }
}
