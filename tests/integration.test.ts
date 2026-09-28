/**
 * @file Verify rule settings, override precedence, and file handling through Oxlint.
 */
import { createRequire } from 'node:module';

import {
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';

import { createConfig, node } from '../packages/oxlint-config/src/index';
import { catalog, severity } from '../packages/rule-catalog/src/index';
import { lintBatch } from './cli';

import type { Diagnostic } from './cli';

const REQUIRE = createRequire(import.meta.url);
const languages = ['js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx'];
const examples = [
    { rule: 'no-console', valid: 'logger.log("value");', invalid: 'console.log("value");' },
    { rule: 'curly', valid: 'if (ready) {\n    work();\n}', invalid: 'if (ready) work();' },
    { rule: 'no-var', valid: 'let value = 1;', invalid: 'var value = 1;' },
    { rule: 'eqeqeq', valid: 'value === other;', invalid: 'value == other;' },
    { rule: 'no-plusplus', valid: 'value += 1;', invalid: 'value++;' },
    { rule: 'quotes', valid: "const value = 'text';", invalid: 'const value = "text";' },
    { rule: 'semi', valid: 'work();\n', invalid: 'work()\n' },
    { rule: 'brace-style', valid: 'if (ready) {\n    work();\n}', invalid: 'if (ready) { work(); }' },
    {
        rule: 'ag/no-accessors',
        valid: 'const object = { getValue() { return stored; } };',
        invalid: 'const object = { get value() { return stored; } };',
    },
    { rule: 'ag/no-prototype-mutation', valid: 'Widget.value = 1;', invalid: 'Widget.prototype.value = 1;' },
];
const modes = ['baseline', 'warning', 'disabled'] as const;
const outcomes = new Map<string, Diagnostic[]>();

beforeAll(async () => {
    for (const example of examples) {
        const mapping = catalog.mappings.find((entry) => entry.source === example.rule)!;
        const target = mapping.target!;
        for (const mode of modes) {
            const base = createConfig('javascript');
            const providers = base.jsPlugins as { name: string; specifier: string }[];
            const config = {
                ...base,
                options: { typeAware: false },
                plugins: ['eslint', 'import', 'unicorn'],
                jsPlugins: providers
                    .filter((provider) => target.startsWith(`${provider.name}/`))
                    .map((provider) => ({ ...provider, specifier: REQUIRE.resolve(provider.specifier) })),
                rules: { [target]: mapping.setting },
                overrides:
                    mode === 'baseline'
                        ? []
                        : [
                            {
                                files: ['**/*'],
                                rules: {
                                    [target]:
                                          mode === 'warning'
                                              ? [
                                                  'warn',
                                                  ...(Array.isArray(mapping.setting) ? mapping.setting.slice(1) : []),
                                              ]
                                              : 'off',
                                },
                            },
                        ],
            };
            const files = Object.fromEntries(
                languages.flatMap((extension) => [
                    [`valid.${extension}`, example.valid],
                    [`invalid.${extension}`, example.invalid],
                ]),
            );
            const results = await lintBatch(config, files);
            results.forEach((diagnostics, filename) => outcomes.set(`${example.rule}/${mode}/${filename}`, diagnostics));
        }
    }
});

describe('configuration behavior across JavaScript and TypeScript extensions', () => {
    examples.forEach((example) => {
        modes.forEach((mode) => {
            languages.forEach((extension) => {
                ['valid', 'invalid'].forEach((kind) => {
                    const id = `${example.rule}/${mode}/${kind}.${extension}`;
                    it(id, () => {
                        const diagnostics = outcomes.get(id);
                        const expectedCount = mode !== 'disabled' && kind === 'invalid' ? (example.rule === 'brace-style' ? 2 : 1) : 0;
                        expect(diagnostics).toBeDefined();
                        expect(diagnostics).toHaveLength(expectedCount);
                        if (expectedCount) {
                            expect(diagnostics?.[0]?.severity).toBe(mode === 'warning' ? 'warning' : 'error');
                            expect(diagnostics?.[0]?.labels?.[0]?.span.line).toBeGreaterThan(0);
                        }
                    });
                });
            });
        });
    });
});

describe('public configuration API', () => {
    it('returns independently mutable preset values', () => {
        const first = createConfig();
        first.rules!['ag-compat/no-console'] = 'off';
        expect(createConfig().rules!['ag-compat/no-console']).toBe('error');
    });

    it('keeps compatibility defaults and isolates the guideline profile', () => {
        const compatibility = createConfig();
        const guideline = createConfig({ policy: 'guideline' });
        expect(compatibility.settings!.agPolicy).toBe('compatibility');
        expect(compatibility.rules!['ag-import/prefer-default-export']).toBe('error');
        expect(guideline.settings!.agPolicy).toBe('guideline');
        expect(guideline.rules!['ag-import/prefer-default-export']).toBe('off');
        expect(() => createConfig({ policy: 'strict' as 'compatibility' })).toThrow(/policy/u);
        expect(createConfig().rules!['ag-import/prefer-default-export']).toBe('error');
    });

    it('layers the guideline policy over the sample configuration', () => {
        const compatibility = createConfig();
        const guideline = createConfig({ policy: 'guideline' });
        expect(guideline.rules!['ag-import/order']).toEqual(catalog.policies.guideline.importGroups.example);
        expect(createConfig({ policy: 'guideline', importGroups: 'prose' }).rules!['ag-import/order'])
            .toEqual(catalog.policies.guideline.importGroups.prose);
        expect(compatibility.rules!['ag-import/order']).toEqual(catalog.rules['ag-import/order']);
        ['import/no-commonjs', 'import/no-namespace', 'import/no-default-export', 'ag/constant-name'].forEach((rule) => {
            expect(compatibility.rules![rule as keyof typeof compatibility.rules]).toBeUndefined();
            expect(guideline.rules![rule as keyof typeof guideline.rules]).toBe('error');
        });
        expect(guideline.plugins).toContain('import');
        expect(guideline.overrides).toEqual([
            { files: ['**/*.{cjs,cts}', '**/.eslintrc.js'], rules: { 'import/no-commonjs': 'off' } },
        ]);
        const script = createConfig({ policy: 'guideline', sourceType: 'commonjs' });
        expect(script.rules!['import/no-commonjs']).toBe('off');
        expect(script.overrides).toEqual([]);
        expect(() => createConfig({ importGroups: 'prose' })).toThrow(/guideline policy/u);
        expect(() => createConfig({ policy: 'guideline', importGroups: 'sorted' as 'prose' })).toThrow(/importGroups/u);
    });

    it('applies TypeScript equivalents after the guideline overlay', () => {
        const guideline = createConfig({ language: 'typescript', policy: 'guideline' });
        const typescript = guideline.overrides![0]!;
        expect(typescript.files).toEqual(['**/*.{ts,tsx,mts,cts}']);
        expect(typescript.rules!['ag-compat/lines-around-comment']).toBe('off');
        expect(typescript.rules!['ag-style/lines-around-comment']).toMatchObject(['error', { allowInterfaceStart: true }]);
        expect(typescript.rules!['ag-ts/no-redeclare']).toBe('error');
        expect(guideline.overrides![1]!.files).toEqual(['**/*.{cjs,cts}', '**/.eslintrc.js']);
        expect(typescript.rules!['typescript/no-require-imports']).toBe('error');
        expect(typescript.rules!['eslint/class-methods-use-this']).toMatchObject(['error', { ignoreOverrideMethods: true }]);
    });

    it('keeps AdGuard project conventions in an opt-in profile', () => {
        const guide = createConfig({ language: 'typescript' });
        const project = createConfig({ language: 'typescript', profile: 'adguard-projects' });
        expect(guide.settings!.agProfile).toBe('guide');
        expect(project.settings!.agProfile).toBe('adguard-projects');
        expect(guide.settings!['boundaries/elements']).toBeUndefined();
        expect(project.settings!['boundaries/elements']).toEqual(
            catalog.profiles['adguard-projects'].settings['boundaries/elements'],
        );
        expect(guide.rules!['ag-compat/no-restricted-imports']).toBeUndefined();
        expect(project.rules!['ag-compat/no-restricted-imports']).toBeDefined();
        expect(guide.overrides![0]!.rules!['typescript/no-explicit-any']).toBeUndefined();
        expect(project.overrides![0]!.rules!['typescript/no-explicit-any']).toBe('error');
        expect(project.overrides![0]!.rules!['typescript/consistent-type-exports']).toBeUndefined();
        expect(() => createConfig({ profile: 'custom' as 'guide' })).toThrow(/profile/u);
        catalog.mappings.filter((mapping) => mapping.scope === 'adguard-projects').forEach((mapping) => {
            expect(mapping.origin).toBe('adguard-projects');
        });
    });

    it('selects syntax-only linting for both consumer languages', () => {
        expect(createConfig('javascript').options?.typeAware).not.toBe(true);
        expect(createConfig('typescript').options?.typeAware).not.toBe(true);
        expect(node.env).toEqual({ browser: false, node: true });
    });

    it('preserves explicit disabled settings and inherited options', () => {
        expect(catalog.baseline['no-await-in-loop']).toBe('off');
        expect(catalog.baseline['jsdoc/require-file-overview']).toBeUndefined();
        expect(catalog.rules['ag-jsdoc/require-file-overview']).toBe('error');
        // Stricter JSDoc rules are AdGuard project conventions, not guide requirements.
        const project = catalog.profiles['adguard-projects'].rules;
        expect(catalog.rules['ag-jsdoc/require-description']).toBeUndefined();
        expect(project['ag-jsdoc/require-description']).toBe('error');
        expect(project['ag-jsdoc/require-description-complete-sentence']).toBe('error');
        expect(project['ag-jsdoc/require-hyphen-before-param-description']).toEqual(['error', 'never']);
        expect(project['ag-jsdoc/require-throws']).toBe('error');
        expect(project['ag-jsdoc/sort-tags']).toBe('error');
        expect(catalog.baseline['brace-style']).toEqual(['error', '1tbs', { allowSingleLine: false }]);
        expect(catalog.baseline.indent).toEqual(['error', 4, { SwitchCase: 1 }]);
        expect(catalog.baseline['react/jsx-indent']).toEqual(['error', 2]);
    });

    it.each([
        ['off', 0],
        ['warn', 1],
        ['error', 2],
        [0, 0],
        [1, 1],
        [2, 2],
        [['error', {}], 2],
        [['warn', 'always'], 1],
        [['off', 4], 0],
    ])('normalizes severity %j to %i', (setting, expected) => {
        expect(severity(setting as string | number | unknown[])).toBe(expected);
    });
});
