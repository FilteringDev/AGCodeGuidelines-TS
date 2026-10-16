/** @file Verify pnpm forwarding and memory options independently of lint engines. */
import { describe, expect, it } from 'vitest';

import { parseLintArguments } from '../packages/oxlint-config/src/lint-arguments';

describe('lint invocation arguments', () => {
    it('consumes forwarded memory options without changing backend flags', () => {
        expect(parseLintArguments(['--config', 'lint.json', '--', '--max-mem', '8192', '--max-warnings=0'])).toEqual({
            args: ['--config', 'lint.json', '--max-warnings=0'],
            help: false,
            cache: false,
            maxMemMiB: 8192,
        });
        expect(parseLintArguments(['--max-mem=512', '--profile', 'trace.json', '.'])).toEqual({
            args: ['.'],
            help: false,
            cache: false,
            maxMemMiB: 512,
            profile: 'trace.json',
        });
        expect(parseLintArguments(['--cache', '--cache-location=.cache/lint.json', '--format=unix'])).toEqual({
            args: ['--format=unix'],
            help: false,
            cache: true,
            cacheLocation: '.cache/lint.json',
        });
    });

    it('handles root orchestration and a literal filename separator', () => {
        expect(
            parseLintArguments(['--command', 'pnpm', 'exec', 'lerna', 'run', 'lint', '--', '--max-mem=2048']),
        ).toEqual({
            command: 'pnpm',
            args: ['exec', 'lerna', 'run', 'lint'],
            maxMemMiB: 2048,
            help: false,
            cache: false,
        });
        expect(parseLintArguments(['--', '--max-mem', '1024', '--', '--max-mem', "file with 'quotes'.ts"])).toEqual({
            maxMemMiB: 1024,
            args: ['--', '--max-mem', "file with 'quotes'.ts"],
            help: false,
            cache: false,
        });
        expect(parseLintArguments(['--', 'literal.ts']).args).toEqual(['--', 'literal.ts']);
        expect(parseLintArguments(['--max-mem=1024', '--', '--max-mem']).args).toEqual(['--', '--max-mem']);
    });

    it.each([
        ['--max-mem'],
        ['--max-mem=0'],
        ['--max-mem', '-1'],
        ['--max-mem', '1.5'],
        ['--max-mem', 'NaN'],
        ['--max-mem=1024', '--max-mem', '2048'],
        ['--profile', '--max-mem=1'],
        ['--command='],
        ['--help=yes'],
        ['--help', '--help'],
        ['--cache=yes'],
        ['--cache', '--cache'],
        ['--cache-location'],
    ])('rejects invalid or duplicate execution settings %j', (...args) => {
        expect(() => parseLintArguments(args)).toThrow(TypeError);
    });

    it('does not resolve or enable any lint rule while parsing', () => {
        expect(parseLintArguments([])).toEqual({ args: [], help: false, cache: false });
        expect(parseLintArguments(['--help'])).toEqual({ args: [], help: true, cache: false });
        expect(parseLintArguments(['--unknown-backend-option']).args).toEqual(['--unknown-backend-option']);
    });
});
