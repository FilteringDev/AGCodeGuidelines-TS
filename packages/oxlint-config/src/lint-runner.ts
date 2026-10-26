/** @file Execute bounded lint tasks with one command-scoped memory and CPU pool. */
import { spawn } from 'node:child_process';
import {
    closeSync,
    openSync,
    readdirSync,
    readFileSync,
} from 'node:fs';
import { constants } from 'node:os';
import { parseLintArguments } from './lint-arguments.js';
import { batchLintFiles } from './lint-batch.js';
import { acquireLintLease, readLintSession, startLintSession } from './lint-session.js';
import {
    memoryBytes,
    MIB,
    parseMaxMemory,
    probeMemory,
    resolveMemoryBudget,
} from './memory-budget.js';

import type {
    MemoryBudget,
    MemoryConstraint,
    MemoryProbeOptions,
    MemorySnapshot,
} from './memory-budget.js';

export {
    acquireLintLease, batchLintFiles, memoryBytes, MIB, parseLintArguments, parseMaxMemory, probeMemory,
    readLintSession, resolveMemoryBudget, startLintSession,
};
export type {
    MemoryBudget, MemoryConstraint, MemoryProbeOptions, MemorySnapshot,
};

export interface LintTask {
    command: string;
    args: string[];
    cwd?: string;
    env?: Record<string, string | undefined>;
    memoryMiB: number;
    threads?: number;
    /** File receiving the task's standard output instead of the inherited stream. */
    stdout?: string;
    /** Exit statuses that complete this task without stopping its siblings. */
    tolerated?: number[];
}

export interface LintTaskResult {
    /** Position of the task in the submitted list. */
    index: number;
    status: number;
    signal: string | null;
    durationMs: number;
}

export interface LintExecutionReport {
    budget: MemoryBudget;
    enforcement: 'monitored-process-tree' | 'admission-only';
    peakTreeMiB: number;
    started: number;
    completed: number;
    status: number;
    warnings: string[];
    tasks: LintTaskResult[];
}

export interface LintRunnerOptions {
    budget: MemoryBudget;
    signal?: AbortSignal;
    probe?: () => MemorySnapshot;
    usage?: () => number;
    intervalMs?: number;
    admissionTimeoutMs?: number;
    stdio?: 'inherit' | 'ignore';
    /** Platform identifier for descendant tracking; defaults to the current process platform. */
    platform?: string;
    /** Process-table reader for descendant discovery; defaults to the Linux process table. */
    reader?: ProcessObservationReader;
}

/** Process-table reads used for descendant discovery; injectable for testing on any platform. */
export interface ProcessObservationReader {
    /** Process-table status entry, or throws when the process no longer exists. */
    status: (identifier: number) => string;
    /** Process-table stat entry, or throws when the process no longer exists. */
    stat: (identifier: number) => string;
    /** Thread names owning child lists, or throws when the process no longer exists. */
    tasks: (identifier: number) => string[];
    /** Child identifiers of one thread, or throws when the thread no longer exists. */
    children: (identifier: number, thread: string) => number[];
}

/** Default reader backed by the Linux process table. */
const linuxProcessReader: ProcessObservationReader = {
    status: (identifier) => readFileSync(`/proc/${identifier}/status`, 'utf8'),
    stat: (identifier) => readFileSync(`/proc/${identifier}/stat`, 'utf8'),
    tasks: (identifier) => readdirSync(`/proc/${identifier}/task`),
    children: (identifier, thread) => readFileSync(`/proc/${identifier}/task/${thread}/children`, 'utf8')
        .trim()
        .split(/\s+/u)
        .filter(Boolean)
        .map(Number),
};

/**
 * Identify descendants across Linux worker threads without trusting reused PIDs.
 * @param root - Owned root process identifier.
 * @param read - Process-table reader; defaults to the Linux process table.
 * @returns Observable process identities and current resident bytes.
 */
export function observeProcesses(
    root: number,
    read: ProcessObservationReader = linuxProcessReader,
): { identifier: number; started: string; bytes: number }[] {
    const pending = [root];
    const visited = new Set<number>();
    const result: { identifier: number; started: string; bytes: number }[] = [];
    while (pending.length) {
        const identifier = pending.pop()!;
        if (visited.has(identifier)) {
            continue;
        }
        visited.add(identifier);
        try {
            const status = read.status(identifier);
            const stat = read.stat(identifier);
            const started = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]!;
            result.push({ identifier, started, bytes: Number(status.match(/^VmRSS:\s+(\d+) kB$/mu)?.[1] ?? 0) * 1024 });
            for (const thread of read.tasks(identifier)) {
                try {
                    pending.push(...read.children(identifier, thread));
                } catch {
                    continue;
                }
            }
        } catch {
            continue;
        }
    }
    return result;
}

/**
 * Observe owned Linux processes without summing independent historical RSS maxima.
 * @param root - Root process identifier for this invocation.
 * @param read - Process-table reader; defaults to the Linux process table.
 * @returns Current tree RSS in MiB; shared pages may be counted more than once.
 */
export function processTreeMiB(root = process.pid, read?: ProcessObservationReader): number {
    if (process.platform !== 'linux') {
        return process.memoryUsage().rss / MIB;
    }
    const observations = observeProcesses(root, read);
    return observations.length ? observations.reduce((sum, process) => sum + process.bytes, 0) / MIB
        : process.memoryUsage().rss / MIB;
}

/**
 * Run commands under a shared admission budget, preserving complete inherited output.
 * @param tasks - Commands and conservative per-task memory/CPU reservations.
 * @param options - Aggregate budget, pressure observations and cancellation policy.
 * @returns Complete task outcomes, resource failures and observable memory provenance.
 */
export async function runLintTasks(
    tasks: readonly LintTask[],
    options: LintRunnerOptions,
): Promise<LintExecutionReport> {
    const {
        budget, signal, stdio = 'inherit', intervalMs = 100, admissionTimeoutMs = 30000,
    } = options;
    const platform = options.platform ?? process.platform;
    const read = options.reader;
    if (
        !Number.isFinite(intervalMs)
        || intervalMs < 1
        || !Number.isFinite(admissionTimeoutMs)
        || admissionTimeoutMs < 1
    ) {
        throw new TypeError('Resource observation intervals and admission timeout must be positive.');
    }
    if (
        tasks.some(
            (task) => !Number.isSafeInteger(task.memoryMiB)
                || task.memoryMiB < 1
                || !Number.isSafeInteger(task.threads ?? 1)
                || (task.threads ?? 1) < 1,
        )
    ) {
        throw new TypeError('Task reservations require positive integer MiB and thread counts.');
    }
    const observe = options.usage ?? (() => processTreeMiB());
    const probe = options.probe ?? (() => probeMemory());
    const initialUsage = observe();
    const processLimits = budget.snapshot.perProcessLimits ?? [];
    const processLimitMiB = Math.min(...processLimits.map((limit) => limit.limitBytes / MIB));
    const impossible = tasks.some((task) => {
        const memoryExceeded = task.memoryMiB + initialUsage > budget.maxMiB;
        const cpuExceeded = (task.threads ?? 1) > budget.snapshot.parallelism;
        return memoryExceeded || cpuExceeded || task.memoryMiB > processLimitMiB;
    });
    if (impossible) {
        throw new RangeError('A lint task exceeds the available aggregate memory or CPU reservation.');
    }
    const report: LintExecutionReport = {
        budget: structuredClone(budget),
        enforcement: platform === 'linux' ? 'monitored-process-tree' : 'admission-only',
        peakTreeMiB: initialUsage,
        started: 0,
        completed: 0,
        status: 0,
        warnings: ['RSS sampling is best-effort, may overshoot transiently, and may double-count shared pages.'],
        tasks: [],
    };
    if (platform !== 'linux') {
        report.warnings.push('Descendant RSS is not observable on this platform; only admission is controlled.');
    }
    if (!tasks.length) {
        return report;
    }
    return new Promise((resolve, reject) => {
        const active = new Map<ReturnType<typeof spawn>, { memory: number; threads: number }>();
        const timers = new Set<ReturnType<typeof setTimeout>>();
        const descendants = new Map<number, string>();
        const track = () => {
            if (platform === 'linux') {
                for (const child of active.keys()) {
                    if (child.pid) {
                        for (const observation of observeProcesses(child.pid, read)) {
                            descendants.set(observation.identifier, observation.started);
                        }
                    }
                }
            }
        };
        const cleanupDescendants = (termination: NodeJS.Signals) => {
            for (const [identifier, started] of descendants) {
                try {
                    const stat = (read ?? linuxProcessReader).stat(identifier);
                    if (stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] === started) {
                        process.kill(identifier, termination);
                    }
                } catch {
                    continue;
                }
            }
        };
        let next = 0;
        const state = { reservedMiB: 0, reservedThreads: 0, stopping: false };
        let blockedAt: number | undefined;
        let abort: () => void;
        let observationError: Error | undefined;
        let timer: ReturnType<typeof setInterval> | undefined;

        const finish = () => {
            if (active.size || (!state.stopping && next < tasks.length)) {
                return;
            }
            clearInterval(timer);
            timers.forEach(clearTimeout);
            cleanupDescendants('SIGKILL');
            signal?.removeEventListener('abort', abort);
            if (observationError) {
                reject(observationError);
            } else {
                resolve(report);
            }
        };
        const stop = (status: number) => {
            if (state.stopping) {
                return;
            }
            state.stopping = true;
            report.status = status;
            track();
            for (const child of active.keys()) {
                const terminate = (termination: NodeJS.Signals) => {
                    try {
                        if (process.platform !== 'win32' && child.pid) {
                            process.kill(-child.pid, termination);
                        } else {
                            child.kill(termination);
                        }
                    } catch (error: unknown) {
                        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
                            report.warnings.push(`Cannot terminate child: ${(error as Error).message}`);
                        }
                    }
                };
                terminate('SIGTERM');
                const escalation = setTimeout(() => terminate('SIGKILL'), 1000);
                timers.add(escalation);
            }
            cleanupDescendants('SIGTERM');
            finish();
        };
        abort = () => stop(signal?.reason === 'SIGTERM' ? 143 : 130);
        const admit = () => {
            if (state.stopping) {
                return;
            }
            try {
                track();
                const usage = observe();
                report.peakTreeMiB = Math.max(report.peakTreeMiB, usage);
                if (!Number.isFinite(usage) || usage < 0) {
                    throw new Error('Owned process-tree memory could not be observed.');
                }
                if (usage > budget.maxMiB) {
                    report.warnings.push('Aggregate process-tree memory exceeded the requested budget.');
                    stop(3);
                    return;
                }
                const snapshot = probe();
                const pressureBytes = Math.max(
                    0,
                    Math.min(
                        snapshot.availableBytes,
                        ...snapshot.constraints.map(({ limitBytes, usedBytes }) => Math.max(0, limitBytes - usedBytes)),
                    ),
                );
                const headroom = pressureBytes / MIB;
                while (next < tasks.length) {
                    const task = tasks[next]!;
                    const threads = task.threads ?? 1;
                    const unrealized = Math.max(0, state.reservedMiB - Math.max(0, usage - initialUsage));
                    if (
                        initialUsage + state.reservedMiB + task.memoryMiB > budget.maxMiB
                        || usage + task.memoryMiB > budget.maxMiB
                        || state.reservedThreads + threads > snapshot.parallelism
                        || task.memoryMiB + unrealized > headroom
                    ) {
                        blockedAt = active.size ? undefined : blockedAt ?? performance.now();
                        if (blockedAt !== undefined && performance.now() - blockedAt >= admissionTimeoutMs) {
                            report.warnings.push('Lint admission timed out under resource pressure.');
                            stop(3);
                        }
                        break;
                    }
                    blockedAt = undefined;
                    const index = next;
                    next += 1;
                    const startedAt = performance.now();
                    const output = task.stdout === undefined ? undefined : openSync(task.stdout, 'w');
                    let child: ReturnType<typeof spawn>;
                    try {
                        child = spawn(task.command, task.args, {
                            cwd: task.cwd,
                            env: task.env ?? process.env,
                            stdio: output === undefined ? stdio : [stdio, output, stdio],
                            detached: process.platform !== 'win32',
                            windowsHide: true,
                        });
                    } finally {
                        if (output !== undefined) {
                            closeSync(output);
                        }
                    }
                    active.set(child, { memory: task.memoryMiB, threads });
                    state.reservedMiB += task.memoryMiB;
                    state.reservedThreads += threads;
                    report.started += 1;
                    let spawnError: Error | undefined;
                    child.once('error', (error) => {
                        spawnError = error;
                        report.warnings.push(error.message);
                    });
                    child.once('close', (code, termination) => {
                        const reservation = active.get(child)!;
                        active.delete(child);
                        state.reservedMiB -= reservation.memory;
                        state.reservedThreads -= reservation.threads;
                        const matchedSignal = Object.entries(constants.signals).find(([name]) => name === termination);
                        const signalNumber = matchedSignal?.[1] ?? 15;
                        const status = spawnError ? 2 : code ?? (128 + signalNumber);
                        report.tasks.push({
                            index, status, signal: termination, durationMs: performance.now() - startedAt,
                        });
                        report.completed += 1;
                        if (status !== 0 && !task.tolerated?.includes(status) && !state.stopping) {
                            stop(status);
                        }
                        admit();
                        finish();
                    });
                }
                finish();
            } catch (error: unknown) {
                observationError = error instanceof Error ? error : new Error(String(error));
                stop(3);
            }
        };
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) {
            abort();
            return;
        }
        timer = setInterval(admit, intervalMs);
        admit();
    });
}
