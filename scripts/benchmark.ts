/** @file Measure complete lint commands with explicit cache and coverage boundaries. */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
    closeSync,
    fstatSync,
    mkdirSync,
    openSync,
    readFileSync,
    readSync,
} from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { SpawnSyncReturns } from 'node:child_process';

export interface BenchmarkVariant {
    cold: string[];
    warm: string[];
    coverage: string;
    expectedExitCodes?: number[];
    resourceProfile?: string;
}

export interface BenchmarkManifest {
    cwd: string;
    coldDefinition: string;
    warmDefinition: string;
    iterations?: number;
    warmups?: number;
    variants: Record<string, BenchmarkVariant>;
    artifactsDirectory?: string;
}

/**
 * Read a bounded diagnostic tail without loading arbitrarily large engine output.
 * @param filename - A completed command's output artifact.
 * @returns At most two KiB of diagnostic text.
 */
function diagnosticTail(filename: string): string {
    const descriptor = openSync(filename, 'r');
    try {
        const { size } = fstatSync(descriptor);
        const buffer = Buffer.alloc(Math.min(size, 2048));
        readSync(descriptor, buffer, 0, buffer.length, Math.max(0, size - buffer.length));
        return buffer.toString('utf8');
    } finally {
        closeSync(descriptor);
    }
}

/**
 * Summarize samples with linear-interpolated percentiles and retained extrema.
 * @param samples - Measured durations in milliseconds.
 * @returns Median, interquartile range and minimum/maximum.
 */
export function summarize(samples: number[]): Record<string, number> {
    if (!samples.length || samples.some((value) => !Number.isFinite(value) || value < 0)) {
        throw new TypeError('Expected nonempty finite, nonnegative samples.');
    }
    const ordered = [...samples].sort((left, right) => left - right);
    const percentile = (fraction: number): number => {
        const position = (ordered.length - 1) * fraction;
        const lower = Math.floor(position);
        return ordered[lower]! + (ordered[Math.ceil(position)]! - ordered[lower]!) * (position - lower);
    };
    return {
        median: percentile(0.5),
        p25: percentile(0.25),
        p75: percentile(0.75),
        min: ordered[0]!,
        max: ordered.at(-1)!,
    };
}

/**
 * Measure trusted command arrays without a shell or hidden setup outside the timed process.
 * @param manifest - Exactly three coverage-labelled variants and explicit cache definitions.
 * @returns Raw outputs, timings, summaries and execution environment.
 */
export function benchmark(manifest: BenchmarkManifest) {
    const { iterations = 10, warmups = 3 } = manifest;
    if (!Number.isInteger(iterations) || iterations < 10 || !Number.isInteger(warmups) || warmups < 3) {
        throw new TypeError('Use at least 10 measured repetitions and 3 warmups.');
    }
    if (!manifest.coldDefinition || !manifest.warmDefinition || Object.keys(manifest.variants).length < 2
        || Object.keys(manifest.variants).some((name) => !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(name))) {
        throw new TypeError('Define cold/warm cache semantics and at least two safely named variants.');
    }
    const variants = Object.entries(manifest.variants);
    for (const [, variant] of variants) {
        if (!variant.coverage || [variant.cold, variant.warm].some((command) => !Array.isArray(command)
            || command.length === 0 || command.some((argument) => typeof argument !== 'string'))) {
            throw new TypeError('Each variant needs literal command arrays and an honest coverage description.');
        }
    }
    const cwd = resolve(manifest.cwd);
    const artifacts = manifest.artifactsDirectory ? resolve(manifest.artifactsDirectory) : undefined;
    if (artifacts) {
        mkdirSync(artifacts, { recursive: true });
    }
    const samples: {
        phase: 'cold' | 'warm'; variant: string; iteration: number; durationMs: number;
        status: number; stdout: string; stderr: string;
        stdoutFile?: string; stderrFile?: string; resourceProfile?: unknown;
    }[] = [];
    for (const phase of ['cold', 'warm'] as const) {
        const start = phase === 'warm' ? -warmups : 0;
        for (let iteration = start; iteration < iterations; iteration += 1) {
            const offset = ((iteration % variants.length) + variants.length) % variants.length;
            for (const [name, variant] of [...variants.slice(offset), ...variants.slice(0, offset)]) {
                const [command, ...args] = variant[phase];
                const stdoutFile = artifacts ? join(artifacts, `${phase}-${name}-${iteration}.stdout`) : undefined;
                const stderrFile = artifacts ? join(artifacts, `${phase}-${name}-${iteration}.stderr`) : undefined;
                const descriptors = stdoutFile && stderrFile
                    ? [openSync(stdoutFile, 'w'), openSync(stderrFile, 'w')] : undefined;
                const before = performance.now();
                let result: SpawnSyncReturns<string>;
                try {
                    result = spawnSync(command!, args, {
                        cwd,
                        encoding: 'utf8',
                        maxBuffer: 64 * 1024 * 1024,
                        ...(descriptors ? { stdio: ['ignore', descriptors[0]!, descriptors[1]!] } : {}),
                    });
                } finally {
                    descriptors?.forEach((descriptor) => closeSync(descriptor));
                }
                const durationMs = performance.now() - before;
                if (result.error) {
                    throw result.error;
                }
                if (result.status === null || !(variant.expectedExitCodes ?? [0]).includes(result.status)) {
                    const diagnostic = stderrFile ? diagnosticTail(stderrFile) || diagnosticTail(stdoutFile!)
                        : result.stderr || result.stdout;
                    throw new Error(`${name} ${phase} failed (${result.status}): ${diagnostic}`);
                }
                if (iteration >= 0) {
                    samples.push({
                        phase,
                        variant: name,
                        iteration,
                        durationMs,
                        status: result.status,
                        stdout: result.stdout ?? '',
                        stderr: result.stderr ?? '',
                        ...(stdoutFile ? { stdoutFile, stderrFile } : {}),
                        ...(variant.resourceProfile ? {
                            resourceProfile: JSON.parse(readFileSync(resolve(cwd, variant.resourceProfile), 'utf8')) as unknown,
                        } : {}),
                    });
                }
            }
        }
    }
    return {
        recordedAt: new Date().toISOString(),
        manifest: structuredClone(manifest),
        manifestSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
        environment: {
            node: process.version,
            platform: platform(),
            release: release(),
            cpu: cpus()[0]?.model,
        },
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(),
        summary: Object.fromEntries(['cold', 'warm'].map((phase) => [phase,
            Object.fromEntries(variants.map(([name]) => [name, summarize(samples
                .filter((sample) => sample.phase === phase && sample.variant === name)
                .map((sample) => sample.durationMs))])),
        ])),
        samples,
        acceptance: 'Requires equivalent-coverage review; native-only is not a full-lint speedup.',
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    if (process.argv.length !== 4) {
        throw new Error('Usage: pnpm exec tsx scripts/benchmark.ts <manifest.json> <results.json>');
    }
    const manifest = JSON.parse(await readFile(process.argv[2]!, 'utf8')) as BenchmarkManifest;
    await writeFile(process.argv[3]!, `${JSON.stringify(benchmark(manifest), null, 2)}\n`);
}
