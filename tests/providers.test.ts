/** @file Verify opt-in provider selection through the pinned Oxlint runtime. */
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createCompatibilityConfig, createConfig, finalizeProviders } from '../packages/oxlint-config/src/index';
import { lintBatch } from './cli';

const COMPAT = fileURLToPath(import.meta.resolve('@agcodeguidelines/oxlint-plugin/compat'));
const STYLE = fileURLToPath(import.meta.resolve('@agcodeguidelines/oxlint-plugin/stylistic'));

describe('effective compatibility configuration', () => {
    it('preserves source environments and boolean global semantics', async () => {
        const result = createCompatibilityConfig({
            rules: { 'no-undef': 'error' },
            context: { env: { browser: true }, globals: { customReadonly: false, customWritable: true } },
        });
        expect(result.fallback).toEqual([]);
        expect(result.config.env).toEqual({ browser: true });
        expect(result.config.globals).toEqual({ customReadonly: 'readonly', customWritable: 'writable' });
        result.config.jsPlugins = [{ name: 'ag-compat', specifier: COMPAT }];
        const diagnostics = await lintBatch(result.config, {
            'globals.js': 'window; customReadonly; customWritable; missingGlobal;',
        });
        expect(diagnostics.get('globals.js')).toMatchObject([{ message: "'missingGlobal' is not defined." }]);
    });

    it('enables only requested rules in the exact language and file scope', async () => {
        const options = {
            language: 'typescript' as const,
            rules: { 'no-debugger': 'warn', 'no-sparse-arrays': 'off', 'unknown/rule': 'error' },
            acceptNativeDifferences: true,
            context: { files: ['src/**'], excludedFiles: ['src/generated/**'], globals: { custom: 'readonly' as const } },
            ignorePatterns: ['private/**'],
        };
        const result = createCompatibilityConfig(options);
        expect(result.config.jsPlugins).toBeUndefined();
        expect(result.ownership).toHaveLength(3);
        expect(result.fallback).toMatchObject([{ source: 'unknown/rule', disposition: 'unsupported' }]);
        expect(result.config.rules).toEqual({});
        expect(result.config.ignorePatterns).toEqual(['private/**']);
        const diagnostics = await lintBatch(result.config, {
            'src/main.ts': 'debugger;',
            'src/main.js': 'debugger;',
            'tests/main.ts': 'debugger;',
            'src/generated/main.ts': 'debugger;',
            'src/sparse.ts': 'const values = [,];',
        });
        expect(diagnostics.get('src/main.ts')).toMatchObject([{ severity: 'warning' }]);
        for (const filename of ['src/main.js', 'tests/main.ts', 'src/generated/main.ts', 'src/sparse.ts']) {
            expect(diagnostics.get(filename)).toEqual([]);
        }
        result.ownership[0]!.context.files!.push('changed/**');
        expect(options.context.files).toEqual(['src/**']);
    });

    it('keeps unverified parser options, settings and typed rules under the existing owner', () => {
        const rules = { '@typescript-eslint/return-await': ['warn', 'in-try-catch'] };
        expect(createCompatibilityConfig({ rules }).fallback).toMatchObject([{ disposition: 'unsupported' }]);
        expect(createCompatibilityConfig({ rules, language: 'typescript', typeAware: true }).ownership)
            .toMatchObject([{ disposition: 'type-aware' }]);
        for (const context of [{ parserOptions: { ecmaVersion: 2020 } }, { sourceType: 'script' as const }]) {
            expect(createCompatibilityConfig({ rules: { 'no-debugger': 'error' }, context }).fallback).toHaveLength(1);
        }
        expect(createCompatibilityConfig({
            rules: { quotes: ['warn', 'single', { avoidEscape: true }] }, context: { settings: { custom: true } },
        }).fallback).toHaveLength(1);
        expect(() => createCompatibilityConfig({ rules: {}, typeAware: 'yes' as unknown as boolean }))
            .toThrow('typeAware');
    });

    it('runs a JavaScript alias without changing options or loading other providers', async () => {
        const result = createCompatibilityConfig({
            rules: { '@typescript-eslint/quotes': ['warn', 'single', { avoidEscape: true }] }, language: 'typescript',
        });
        expect(result.config.jsPlugins).toEqual([{ name: 'ag-style', specifier: '@agcodeguidelines/oxlint-plugin/stylistic' }]);
        result.config.jsPlugins = [{ name: 'ag-style', specifier: STYLE }];
        const diagnostics = await lintBatch(result.config, { 'valid.ts': "type Mode = 'light';", 'invalid.ts': 'type Mode = "light";' });
        expect(diagnostics.get('valid.ts')).toEqual([]);
        expect(diagnostics.get('invalid.ts')).toMatchObject([{ severity: 'warning' }]);
    });

    it('keeps empty configurations empty and detects conflicting aliases', () => {
        expect(createCompatibilityConfig({ rules: {} }).ownership).toEqual([]);
        expect(() => createCompatibilityConfig({
            language: 'typescript',
            rules: { 'member-delimiter-style': 'error', '@typescript-eslint/member-delimiter-style': 'warn' },
        })).toThrow('Conflicting ownership');
    });
});

describe('explicit provider finalization', () => {
    it('keeps the existing mutable factory contract', () => {
        const original = createConfig();
        const next = createConfig();
        expect(original.jsPlugins).toHaveLength(12);
        original.rules = {};
        original.overrides = [];
        expect(finalizeProviders(original).jsPlugins).toBeUndefined();
        expect(original.jsPlugins).toHaveLength(12);
        expect(next.rules).not.toEqual({});
    });

    it('runs native and disabled custom rules without loading unused modules', async () => {
        const config = finalizeProviders({
            categories: { correctness: 'off' },
            plugins: ['eslint'],
            jsPlugins: [{ name: 'ag-compat', specifier: '/unused-provider-must-not-load.js' }],
            rules: { 'eslint/no-debugger': 'warn', 'ag-compat/no-sparse-arrays': 'off' },
        });
        expect(config.jsPlugins).toBeUndefined();
        const result = await lintBatch(config, { 'example.ts': 'debugger; const values = [,];' });
        expect(result.get('example.ts')).toMatchObject([{ code: 'eslint(no-debugger)', severity: 'warning' }]);
    });

    it('retains override-only providers and restores providers after mutation', async () => {
        const config = finalizeProviders({
            categories: { correctness: 'off' },
            rules: { 'ag-compat/no-debugger': 'off' },
            overrides: [{ files: ['**/*.ts'], rules: { 'ag-compat/no-debugger': 'error' } }],
        });
        expect(config.jsPlugins).toEqual([
            { name: 'ag-compat', specifier: '@agcodeguidelines/oxlint-plugin/compat' },
        ]);
        config.jsPlugins = [{ name: 'ag-compat', specifier: COMPAT }];
        const result = await lintBatch(config, { 'example.ts': 'debugger;', 'example.js': 'debugger;' });
        expect(result.get('example.ts')).toHaveLength(1);
        expect(result.get('example.js')).toEqual([]);
        const empty = finalizeProviders({ ...config, rules: {}, overrides: [] });
        expect(empty.jsPlugins).toBeUndefined();
        empty.rules = { 'ag-compat/no-debugger': 'error' };
        expect(finalizeProviders(empty).jsPlugins).toHaveLength(1);
    });

    it('preserves opaque providers and rejects unresolved inheritance', () => {
        expect(finalizeProviders({ jsPlugins: ['opaque-plugin'], rules: {} }).jsPlugins).toEqual(['opaque-plugin']);
        expect(() => finalizeProviders({ extends: [{}] })).toThrow('Resolve inherited');
        expect(finalizeProviders({ rules: {} }).jsPlugins).toBeUndefined();
        expect(() => finalizeProviders({ rules: { 'ag-compat/no-debugger': 'invalid' as 'error' } }))
            .toThrow('Invalid Oxlint severity');
    });
});
