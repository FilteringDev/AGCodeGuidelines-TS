/** @file Verify repeatable command measurement without claiming consumer performance. */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { benchmark, summarize } from '../scripts/benchmark';

import type { BenchmarkManifest } from '../scripts/benchmark';

const VARIANT = {
    cold: [process.execPath, '-e', 'process.stdout.write("ok")'],
    warm: [process.execPath, '-e', 'process.stdout.write("ok")'],
    coverage: 'Synthetic harness validation only',
};
const MANIFEST: BenchmarkManifest = {
    cwd: process.cwd(),
    coldDefinition: 'Fresh process; no lint result cache; host page cache uncontrolled',
    warmDefinition: 'Three priming runs; host page cache uncontrolled',
    variants: { eslint: VARIANT, native: VARIANT, hybrid: VARIANT },
};

describe('benchmark protocol', () => {
    it('isolates variant environment controls without mutating the parent', () => {
        const before = process.env.AG_BENCHMARK_CASE;
        const command = [process.execPath, '-e', 'process.stdout.write(process.env.AG_BENCHMARK_CASE ?? "unset")'];
        const report = benchmark({
            ...MANIFEST,
            variants: {
                controlled: {
                    ...VARIANT, cold: command, warm: command, env: { AG_BENCHMARK_CASE: 'four' },
                },
                cleared: {
                    ...VARIANT, cold: command, warm: command, env: { AG_BENCHMARK_CASE: null },
                },
            },
        });
        expect(report.samples.filter((sample) => sample.variant === 'controlled')
            .every((sample) => sample.stdout === 'four')).toBe(true);
        expect(report.samples.filter((sample) => sample.variant === 'cleared')
            .every((sample) => sample.stdout === 'unset')).toBe(true);
        expect(process.env.AG_BENCHMARK_CASE).toBe(before);
        const invalidEnvironments: Record<string, string | null>[] = [
            { 'bad=name': 'value' }, { '': 'value' }, { key: '\0' },
        ];
        for (const env of invalidEnvironments) {
            expect(() => benchmark({ ...MANIFEST, variants: { ...MANIFEST.variants, invalid: { ...VARIANT, env } } }))
                .toThrow('Variant environment');
        }
    });

    it('streams complete outputs and accepts separate current/optimized startup controls', () => {
        const directory = mkdtempSync(join(tmpdir(), 'ag-benchmark-artifacts-'));
        try {
            const report = benchmark({
                ...MANIFEST,
                artifactsDirectory: directory,
                variants: { current: VARIANT, optimized: VARIANT },
            });
            expect(report.samples).toHaveLength(40);
            const sample = report.samples[0]!;
            expect(sample.stdout).toBe('');
            expect(readFileSync(sample.stdoutFile!, 'utf8')).toBe('ok');
            expect(report.summary.cold!.optimized!.median).toBeGreaterThan(0);
            expect(() => benchmark({ ...MANIFEST, variants: { '../escape': VARIANT, valid: VARIANT } }))
                .toThrow('safely named');
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('summarizes median and spread without mutating samples', () => {
        const samples = [4, 1, 3, 2];
        expect(summarize(samples)).toEqual({
            median: 2.5,
            p25: 1.75,
            p75: 3.25,
            min: 1,
            max: 4,
        });
        expect(samples).toEqual([4, 1, 3, 2]);
        expect(() => summarize([])).toThrow('nonempty');
        expect(() => summarize([Number.NaN])).toThrow('finite');
    });

    it('retains all process costs, outputs and separate cold/warm samples', () => {
        const report = benchmark(MANIFEST);
        expect(report.samples).toHaveLength(60);
        expect(report.samples.every((sample) => sample.stdout === 'ok' && sample.status === 0)).toBe(true);
        expect(report.summary.cold!.eslint!.median).toBeGreaterThan(0);
        expect(report.summary.warm!.hybrid!.p75).toBeGreaterThan(0);
        expect(report.manifestSha256).toHaveLength(64);
    });

    it('rejects under-sampling and ambiguous variants before executing commands', () => {
        expect(() => benchmark({ ...MANIFEST, iterations: 1 })).toThrow('10 measured');
        expect(() => benchmark({ ...MANIFEST, warmups: 0 })).toThrow('3 warmups');
        expect(() => benchmark({ ...MANIFEST, coldDefinition: '' })).toThrow('cache semantics');
        expect(() => benchmark({ ...MANIFEST, variants: { ...MANIFEST.variants, native: { ...VARIANT, cold: [] } } }))
            .toThrow('command arrays');
    });
});
