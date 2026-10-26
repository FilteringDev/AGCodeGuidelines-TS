/** @file Verify byte-bounded file batching without changing lint scope or filenames. */
import { describe, expect, it } from 'vitest';

import { batchLintFiles } from '../packages/oxlint-config/src/lint-batch';

describe('literal argv file batches', () => {
    it('preserves filenames and order without a fixed hundred-file split', () => {
        const files = Array.from({ length: 1000 }, (_unused, index) => `/src/file-${index}.ts`);
        const batches = batchLintFiles(files, { environment: {}, platform: 'linux' });
        expect(batches).toHaveLength(1);
        expect(batches.flat()).toEqual(files);
        expect(batchLintFiles([], { platform: 'linux' })).toEqual([]);
    });

    it('accounts for fixed args, inherited environment and non-ASCII byte lengths', () => {
        const files = ["file with 'quotes'.ts", '\uD55C\uAE00.ts', '--literal.ts'];
        const options = {
            maxBytes: 64,
            environment: { ENV: 'value' },
            fixedArgs: ['node', '--config', 'lint.json'],
            platform: 'linux',
        };
        const batches = batchLintFiles(files, options);
        expect(batches.length).toBeGreaterThan(1);
        expect(batches.flat()).toEqual(files);
        expect(() => batchLintFiles(['file.ts'], { ...options, environment: { ENV: 'x'.repeat(64) } }))
            .toThrow('argv byte ceiling');
    });

    it('uses conservative Windows quoting space and rejects unrepresentable arguments', () => {
        expect(batchLintFiles(['alpha.ts', 'beta.ts'], { platform: 'win32', environment: {}, maxBytes: 40 }))
            .toEqual([['alpha.ts'], ['beta.ts']]);
        expect(() => batchLintFiles(['bad\0file.ts'], { environment: {} })).toThrow('NUL');
        expect(() => batchLintFiles(['file.ts'], { maxBytes: 0 })).toThrow('positive integer');
    });
});
