/** @file Verify scoped consumer translation keeps every effective configuration separate. */
import { describe, expect, it } from 'vitest';

import {
    assignScopes,
    completeOverrides,
    inScope,
    lastScope,
    translateConsumer,
} from '../scripts/consumer-translate';

import type { SourceFile, TranslationScope } from '../scripts/consumer-translate';

const SCOPES: TranslationScope[] = [
    { files: ['**/*.js'] },
    { files: ['**/*.ts'] },
    { files: ['src/**/*.ts'] },
];

describe('consumer translation scopes', () => {
    it('matches dot directories and honours exclusions', () => {
        expect(inScope('.config/tool.js', ['**/*.js'])).toBe(true);
        expect(inScope('src/a.test.ts', ['**/*.ts'], ['**/*.test.ts'])).toBe(false);
        expect(inScope('src/a.ts', ['**/*.ts'], ['**/*.test.ts'])).toBe(true);
    });

    it('lets the last matching scope win', () => {
        expect(lastScope('tasks/a.ts', SCOPES)).toBe(1);
        expect(lastScope('src/a.ts', SCOPES)).toBe(2);
        expect(lastScope('src/a.js', SCOPES)).toBe(0);
        expect(lastScope('README.md', SCOPES)).toBe(-1);
    });

    it('rejects unmatched files, empty scopes and mixed configurations', () => {
        expect(() => assignScopes([{ path: 'a.md', key: 'x' }], SCOPES)).toThrow(/a\.md matches no scope/u);
        expect(() => assignScopes([{ path: 'a.js', key: 'x' }], SCOPES)).toThrow(/Scope 1 .* owns no linted file/u);
        expect(() => assignScopes([
            { path: 'a.js', key: 'x' },
            { path: 'b.js', key: 'y' },
            { path: 'a.ts', key: 'z' },
            { path: 'src/a.ts', key: 'w' },
        ], SCOPES)).toThrow(/Scope 0 .* mixes 2 configurations/u);
        expect(assignScopes([
            { path: 'a.js', key: 'x' },
            { path: 'a.ts', key: 'y' },
            { path: 'src/a.ts', key: 'z' },
        ], SCOPES)).toEqual(['x', 'y', 'z']);
    });

    it('turns off rules an override does not set', () => {
        expect(completeOverrides([
            { files: ['a'], rules: { b: 'error' } },
            { files: ['c'], rules: { a: 'warn' } },
        ])).toEqual([
            { files: ['a'], rules: { a: 'off', b: 'error' } },
            { files: ['c'], rules: { a: 'warn', b: 'off' } },
        ]);
    });
});

describe('translateConsumer', () => {
    const files: SourceFile[] = [
        { path: 'tasks/a.js', language: 'javascript', config: { rules: { 'no-console': ['error'] } } },
        { path: 'tasks/a.ts', language: 'typescript', config: { rules: { 'no-console': ['error'] } } },
        {
            path: 'src/a.ts',
            language: 'typescript',
            config: { rules: { 'no-console': ['error'], 'no-debugger': ['error'] } },
        },
    ];

    it('emits one complete override per scope', () => {
        const { config, scopes } = translateConsumer(files, { scopes: SCOPES, ignorePatterns: ['build'] });
        expect(config.ignorePatterns).toEqual(['build']);
        expect(config.overrides?.map((override) => override.files)).toEqual(SCOPES.map((scope) => scope.files));
        expect(scopes.map((scope) => [scope.count, scope.language])).toEqual([
            [1, 'javascript'],
            [1, 'typescript'],
            [1, 'typescript'],
        ]);
        const keys = config.overrides!.map((override) => Object.keys(override.rules ?? {}));
        expect(new Set(keys.map((list) => list.join()))).toHaveProperty('size', 1);
        const active = config.overrides!.map((override) => Object.entries(override.rules ?? {})
            .filter(([, setting]) => setting !== 'off').map(([target]) => target));
        expect(active[0]).toEqual(active[1]);
        expect(active[2]!.length).toBe(active[1]!.length + 1);
        for (const provider of config.jsPlugins ?? []) {
            const specifier = typeof provider === 'string' ? provider : provider.specifier;
            expect(specifier).toMatch(/^@agcodeguidelines\//u);
        }
    });

    it('states environments per override when scopes differ', () => {
        const { config } = translateConsumer([
            { ...files[0]!, config: { ...files[0]!.config, env: { node: true } } },
            { ...files[1]!, config: { ...files[1]!.config, env: { node: true } } },
            { ...files[2]!, config: { ...files[2]!.config, env: { browser: true }, globals: { adguard: false } } },
        ], { scopes: SCOPES });
        expect(config.env).toEqual({});
        expect(config.overrides!.map((override) => override.env)).toEqual([
            { node: true, browser: false },
            { node: true, browser: false },
            { node: false, browser: true },
        ]);
        expect(config.overrides!.map((override) => override.globals)).toEqual([
            { adguard: 'off' },
            { adguard: 'off' },
            { adguard: 'readonly' },
        ]);
    });
});
