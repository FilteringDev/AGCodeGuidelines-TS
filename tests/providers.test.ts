/** @file Verify opt-in provider selection through the pinned Oxlint runtime. */
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    createCompatibilityConfig,
    createCompatibilityConfigGroups,
    createConfig,
    finalizeProviders,
} from '../packages/oxlint-config/src/index';
import typescriptStylistic from '../packages/oxlint-plugin/src/typescript-stylistic';
import { lintBatch } from './cli';

const COMPAT = fileURLToPath(import.meta.resolve('@agcodeguidelines/oxlint-plugin/compat'));
const NOTICE = fileURLToPath(import.meta.resolve('@agcodeguidelines/oxlint-plugin/notice'));
const STYLE = fileURLToPath(import.meta.resolve('@agcodeguidelines/oxlint-plugin/stylistic'));
const TS_STYLE = fileURLToPath(import.meta.resolve('@agcodeguidelines/oxlint-plugin/typescript-stylistic'));

describe('effective compatibility configuration', () => {
    it('exports the TypeScript style rules under their separate provider identity', () => {
        expect(typescriptStylistic.meta?.name).toBe('ag-ts-style');
        expect(typescriptStylistic.rules['brace-style']).toBeDefined();
        expect('quotes' in typescriptStylistic.rules).toBe(true);
    });

    it('keeps file selection and root settings isolated across effective contexts', async () => {
        const groups = createCompatibilityConfigGroups([
            {
                id: 'application',
                rules: { 'no-debugger': 'warn' },
                context: {
                    files: ['src/**'],
                    env: { browser: true },
                    globals: { applicationGlobal: 'readonly' },
                    settings: { react: { version: '18.2.0' } },
                },
            },
            {
                id: 'tooling',
                rules: { 'no-sparse-arrays': 'error' },
                context: {
                    files: ['tools/**'],
                    env: { node: true },
                    globals: { toolingGlobal: 'writable' },
                    settings: { resolver: { mode: 'tooling' } },
                },
                ignorePatterns: ['private/**'],
            },
        ]);
        expect(groups.map(({ id }) => id)).toEqual(['application', 'tooling']);
        expect(groups[0]!.config.env).toEqual({ browser: true });
        expect(groups[0]!.config.globals).toEqual({ applicationGlobal: 'readonly' });
        expect(groups[0]!.config.settings).toEqual({
            react: { version: '18.2.0' },
            agReact: { version: '18.2.0' },
        });
        expect(groups[1]!.config.env).toEqual({ node: true });
        expect(groups[1]!.config.globals).toEqual({ toolingGlobal: 'writable' });
        expect(groups[1]!.config.settings).toEqual({ resolver: { mode: 'tooling' } });

        const application = await lintBatch(groups[0]!.config, {
            'src/main.js': 'debugger;',
            'tools/main.js': 'debugger;',
        });
        expect(application.get('src/main.js')).toMatchObject([{ code: 'ag-compat(no-debugger)', severity: 'warning' }]);
        expect(application.get('tools/main.js')).toEqual([]);
        const tooling = await lintBatch(groups[1]!.config, {
            'src/main.js': 'const values = [,];',
            'tools/main.js': 'const values = [,];',
        });
        expect(tooling.get('tools/main.js')).toMatchObject([{ code: 'ag-compat(no-sparse-arrays)', severity: 'error' }]);
        expect(tooling.get('src/main.js')).toEqual([]);
    });

    it('rejects ambiguous group identities and implicit file scopes', () => {
        expect(() => createCompatibilityConfigGroups([
            { id: 'same', rules: {}, context: { files: ['src/**'] } },
            { id: 'same', rules: {}, context: { files: ['tools/**'] } },
        ])).toThrow('unique and nonempty');
        expect(() => createCompatibilityConfigGroups([
            { id: 'implicit', rules: {} },
        ])).toThrow('explicit file scopes');
    });

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
        for (const context of [
            { parserOptions: { ecmaVersion: 5 } },
            { parserOptions: { lib: ['es2020'] } },
            { parserOptions: { ecmaFeatures: { unknownFeature: true } } },
            { sourceType: 'commonjs' as const },
        ]) {
            expect(createCompatibilityConfig({ rules: { 'no-debugger': 'error' }, context }).fallback).toHaveLength(1);
        }
        expect(createCompatibilityConfig({
            rules: { quotes: ['warn', 'single', { avoidEscape: true }] }, context: { settings: { custom: true } },
        }).fallback).toHaveLength(1);
        expect(createCompatibilityConfig({
            rules: { 'import/no-unresolved': 'error' }, context: { settings: { 'import/resolver': { webpack: {} } } },
        }).fallback).toMatchObject([{ reason: expect.stringContaining('import/resolver') }]);
        expect(() => createCompatibilityConfig({ rules: {}, typeAware: 'yes' as unknown as boolean }))
            .toThrow('typeAware');
    });

    it('translates verified consumer parser options and settings', () => {
        const result = createCompatibilityConfig({
            rules: { 'no-debugger': 'error', 'import/no-unresolved': 'error' },
            context: {
                parserOptions: {
                    project: ['tsconfig.eslint.json'],
                    ecmaFeatures: { jsx: true, generators: false, objectLiteralDuplicateProperties: false },
                    ecmaVersion: 2018,
                    sourceType: 'module',
                },
                settings: {
                    react: { pragma: 'React', version: 'detect' },
                    'import/resolver': { typescript: { alwaysTryTypes: true, project: 'tsconfig.json' }, node: { extensions: ['.ts'] } },
                    'import/parsers': { '@typescript-eslint/parser': ['.ts'] },
                    'import/extensions': ['.ts'],
                    propWrapperFunctions: ['exact'],
                },
            },
        });
        expect(result.fallback).toEqual([]);
        expect(result.config.settings).toEqual({
            agReact: { pragma: 'React', version: 'detect' },
            'import/resolver': { typescript: { alwaysTryTypes: true, project: 'tsconfig.json' }, node: { extensions: ['.ts'] } },
            'import/extensions': ['.ts'],
            propWrapperFunctions: ['exact'],
            agSourceType: 'module',
            agRuleEcmaVersion: 2018,
        });
    });

    it.each([[2015, 0], [2018, 1]])('reports the translated ecmaVersion %i to rules', async (ecmaVersion, count) => {
        const result = createCompatibilityConfig({
            rules: { 'comma-dangle': ['error', 'always-multiline'] },
            context: { parserOptions: { ecmaVersion } },
        });
        expect(result.fallback).toEqual([]);
        result.config.jsPlugins = [{ name: 'ag-compat', specifier: COMPAT }];
        const diagnostics = await lintBatch(result.config, { 'main.js': 'call(\n    1\n);\n' });
        expect(diagnostics.get('main.js')).toHaveLength(count);
    });

    it('keeps the enabled owner when a disabled alias shares its target', () => {
        const rules = { 'default-param-last': 'off', '@typescript-eslint/default-param-last': 'error' };
        const reversed = { '@typescript-eslint/default-param-last': 'error', 'default-param-last': 'off' };
        const [first, second] = [rules, reversed].map((source) => createCompatibilityConfig({
            rules: source, language: 'typescript',
        }).config.overrides![0]!.rules);
        expect(first).toEqual(second);
        expect(Object.values(first!)).toEqual(['error']);
    });

    it('drops stale options of disabled rules that Oxlint would still validate', async () => {
        const result = createCompatibilityConfig({
            rules: {
                'dot-notation': ['off', { allowKeywords: true, allowPrivateClassPropertyAccess: false }],
                'no-undef': 'error',
            },
        });
        expect(result.config.overrides![0]!.rules).toEqual({
            'ag-compat/dot-notation': 'off',
            'ag-compat/no-undef': 'error',
        });
        result.config.jsPlugins = [{ name: 'ag-compat', specifier: COMPAT }];
        const diagnostics = await lintBatch(result.config, { 'main.js': 'const value = {}; value["key"] = 1;' });
        expect(diagnostics.get('main.js')).toEqual([]);
    });

    it('runs a JavaScript alias without changing options or loading other providers', async () => {
        const result = createCompatibilityConfig({
            rules: { '@typescript-eslint/quotes': ['warn', 'single', { avoidEscape: true }] }, language: 'typescript',
        });
        expect(result.config.jsPlugins).toEqual([{ name: 'ag-ts-style', specifier: '@agcodeguidelines/oxlint-plugin/typescript-stylistic' }]);
        result.config.jsPlugins = [{ name: 'ag-ts-style', specifier: TS_STYLE }];
        const diagnostics = await lintBatch(result.config, { 'valid.ts': "type Mode = 'light';", 'invalid.ts': 'type Mode = "light";' });
        expect(diagnostics.get('valid.ts')).toEqual([]);
        expect(diagnostics.get('invalid.ts')).toMatchObject([{ severity: 'warning' }]);
    });

    it('reuses the pinned stylistic provider for its matching source namespace and validates options', async () => {
        const result = createCompatibilityConfig({
            rules: { '@stylistic/quotes': ['warn', 'single'] },
        });
        expect(result.fallback).toEqual([]);
        expect(result.ownership).toMatchObject([{
            source: '@stylistic/quotes', target: 'ag-style/quotes', disposition: 'javascript',
        }]);
        result.config.jsPlugins = [{ name: 'ag-style', specifier: STYLE }];
        const diagnostics = await lintBatch(result.config, {
            'single.js': "const value = 'single';",
            'double.js': 'const value = "double";',
        });
        expect(diagnostics.get('single.js')).toEqual([]);
        expect(diagnostics.get('double.js')).toMatchObject([{ code: 'ag-style(quotes)', severity: 'warning' }]);
        expect(createCompatibilityConfig({
            rules: { '@stylistic/quotes': ['error', 'single', { unsupportedOption: true }] },
        }).fallback).toMatchObject([{ disposition: 'unsupported' }]);
    });

    it('reuses the stylistic extension implementation for TypeScript ESLint source rules in both languages', async () => {
        const setting = ['error', '1tbs', { allowSingleLine: true }] as const;
        const typescript = createCompatibilityConfig({
            language: 'typescript', rules: { '@typescript-eslint/brace-style': setting },
        });
        const javascript = createCompatibilityConfig({
            language: 'javascript', rules: { '@typescript-eslint/brace-style': setting },
        });
        expect(typescript.fallback).toEqual([]);
        expect(javascript.fallback).toEqual([]);
        expect(typescript.ownership).toMatchObject([{ target: 'ag-ts-style/brace-style', disposition: 'javascript' }]);
        typescript.config.jsPlugins = [{ name: 'ag-ts-style', specifier: TS_STYLE }];
        const diagnostics = await lintBatch(typescript.config, {
            'src/value.ts': 'function getValue()\n{\n    return 1;\n}',
        });
        expect(diagnostics.get('src/value.ts')).toMatchObject([{ code: 'ag-ts-style(brace-style)', severity: 'error' }]);

        const parallel = createCompatibilityConfig({
            language: 'typescript',
            rules: {
                'brace-style': ['error', 'stroustrup', { allowSingleLine: false }],
                '@typescript-eslint/brace-style': ['warn', '1tbs', { allowSingleLine: true }],
            },
        });
        expect(parallel.fallback).toEqual([]);
        parallel.config.jsPlugins = [
            { name: 'ag-style', specifier: STYLE },
            { name: 'ag-ts-style', specifier: TS_STYLE },
        ];
        const contextual = await lintBatch(parallel.config, {
            'src/parallel.ts': 'if (ready) {\n    work();\n}\nelse {\n    wait();\n}',
        });
        expect(contextual.get('src/parallel.ts')).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'ag-ts-style(brace-style)', severity: 'warning' }),
        ]));
    });

    it('reuses the frozen core rule implementation with its original option schema', async () => {
        const result = createCompatibilityConfig({
            rules: {
                'no-restricted-syntax': ['error', {
                    selector: 'ExportAllDeclaration', message: 'Avoid wildcard exports.',
                }],
            },
        });
        expect(result.fallback).toEqual([]);
        expect(result.ownership).toMatchObject([{
            source: 'no-restricted-syntax', target: 'ag-compat/no-restricted-syntax', disposition: 'javascript',
        }]);
        result.config.jsPlugins = [{ name: 'ag-compat', specifier: COMPAT }];
        const diagnostics = await lintBatch(result.config, {
            'wildcard.js': "export * from './module.js';",
            'named.js': "export { value } from './module.js';",
        });
        expect(diagnostics.get('wildcard.js')).toMatchObject([{
            code: 'ag-compat(no-restricted-syntax)', message: 'Avoid wildcard exports.',
        }]);
        expect(diagnostics.get('named.js')).toEqual([]);
        expect(createCompatibilityConfig({
            rules: { 'no-restricted-syntax': ['error', { selector: 'ExportAllDeclaration', unknown: true }] },
        }).fallback).toMatchObject([{ disposition: 'unsupported' }]);
    });

    it('passes schema-disabled notice templates and messages to the existing provider', async () => {
        const result = createCompatibilityConfig({
            rules: {
                'notice/notice': ['error', {
                    mustMatch: '^COPYRIGHT',
                    onNonMatchingHeader: 'replace',
                    messages: { whenFailedToMatch: 'Header must be restored.' },
                    template: '/* COPYRIGHT 2015-<%= YEAR %> */\n',
                }],
            },
        });
        expect(result.fallback).toEqual([]);
        expect(result.ownership).toMatchObject([{
            source: 'notice/notice', target: 'ag-notice/notice', disposition: 'javascript',
        }]);
        result.config.jsPlugins = [{ name: 'ag-notice', specifier: NOTICE }];
        const diagnostics = await lintBatch(result.config, { 'missing.js': 'const value = 1;' });
        expect(diagnostics.get('missing.js')).toMatchObject([{
            code: 'ag-notice(notice)', message: 'Header must be restored.', severity: 'error',
        }]);
    });

    it('validates the VPN import-extension tuple while preserving its TS effective setting', () => {
        const sourceSetting = ['error', 'ignorePackages', {
            js: 'never', jsx: 'never', ts: 'never', tsx: 'never',
        }] as const;
        const result = createCompatibilityConfig({
            language: 'typescript',
            rules: { 'import/extensions': sourceSetting },
        });
        expect(result.fallback).toEqual([]);
        expect(result.ownership).toMatchObject([{
            source: 'import/extensions',
            target: 'ag-import/extensions',
            setting: sourceSetting,
            disposition: 'javascript',
        }]);
    });

    it('keeps empty configurations empty and isolates parallel core and TypeScript source rules', () => {
        expect(createCompatibilityConfig({ rules: {} }).ownership).toEqual([]);
        const result = createCompatibilityConfig({
            language: 'typescript',
            rules: { 'member-delimiter-style': 'error', '@typescript-eslint/member-delimiter-style': 'warn' },
        });
        expect(result.fallback).toEqual([]);
        expect(result.ownership).toMatchObject([
            { source: 'member-delimiter-style', target: 'ag-style/member-delimiter-style', setting: 'error' },
            { source: '@typescript-eslint/member-delimiter-style', target: 'ag-ts-style/member-delimiter-style', setting: 'warn' },
        ]);
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
