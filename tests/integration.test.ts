/**
 * @file Verify rule settings, override precedence, and file handling through Oxlint.
 */
import { createRequire } from 'node:module';

import {
    beforeAll, describe, expect, it,
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

    it('selects syntax-only linting for both consumer languages', () => {
        expect(createConfig('javascript').options?.typeAware).not.toBe(true);
        expect(createConfig('typescript').options?.typeAware).not.toBe(true);
        expect(node.env).toEqual({ browser: false, node: true });
    });

    it('preserves explicit disabled settings and inherited options', () => {
        expect(catalog.baseline['no-await-in-loop']).toBe('off');
        expect(catalog.baseline['jsdoc/require-file-overview']).toBe('off');
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
