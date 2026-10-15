/** @file Verify repeatable command measurement without claiming consumer performance. */
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
