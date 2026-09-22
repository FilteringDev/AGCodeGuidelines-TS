/**
 * @file Execute project-dependent and supplementary policy cases through the CLI.
 */
import { createRequire } from 'node:module';

import {
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';

import { createConfig } from '../packages/oxlint-config/src/index';
import { catalog } from '../packages/rule-catalog/src/index';
import { lintBatch } from './cli';
import { gapCases } from './gap-cases';

import type { Diagnostic } from './cli';

const REQUIRE = createRequire(import.meta.url);
const outcomes = new Map<string, Diagnostic[]>();

beforeAll(async () => {
    for (const example of gapCases) {
        const mapping = catalog.mappings.find((entry) => entry.source === example.rule)!;
        const target = mapping.target!;
        for (const kind of ['valid', 'invalid'] as const) {
            const base = createConfig();
            const providers = base.jsPlugins as { name: string; specifier: string }[];
            const config = {
                ...base,
                jsPlugins: providers
                    .filter((provider) => target.startsWith(`${provider.name}/`))
                    .map((provider) => ({ ...provider, specifier: REQUIRE.resolve(provider.specifier) })),
                rules: { [target]: mapping.setting },
                ...(example.language === 'typescript'
                    ? {
                        settings: {
                            ...(base.settings as Record<string, unknown>),
                            'import/resolver': {
                                typescript: true,
                                node: { extensions: ['.js', '.mjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'] },
                            },
                        },
                    }
                    : {}),
            };
            const filename = `main.${example.extension ?? 'js'}`;
            try {
                const result = await lintBatch(config, {
                    'package.json': '{"name":"consumer","type":"module","dependencies":{}}',
                    'dependency.js': 'export const named = 1; export default {};',
                    ...example.files,
                    ...(kind === 'valid' ? example.validFiles : example.invalidFiles),
                    [filename]: example[kind],
                });
                const extra = kind === 'valid' ? example.validFiles : example.invalidFiles;
                const names = extra ? Object.keys(extra) : [filename];
                outcomes.set(
                    `${example.rule}/${kind}`,
                    names.flatMap((name) => result.get(name) ?? []),
                );
            } catch (error: unknown) {
                outcomes.set(`${example.rule}/${kind}`, [{ severity: 'error', message: String(error) }]);
            }
        }
    }
});

describe('supplementary rule and multi-file coverage', () => {
    gapCases.forEach((example) => {
        ['valid', 'invalid'].forEach((kind) => {
            it(`${example.rule}/${kind}`, () => {
                const diagnostics = outcomes.get(`${example.rule}/${kind}`);
                expect(diagnostics).toBeDefined();
                if (kind === 'valid') {
                    expect(diagnostics).toEqual([]);
                } else {
                    expect(diagnostics?.length).toBeGreaterThan(0);
                    const { target } = catalog.mappings.find((entry) => entry.source === example.rule)!;
                    if (example.rule === 'import/export') {
                        expect(diagnostics?.[0]?.message).toContain('Duplicated export');
                        return;
                    }
                    expect(
                        diagnostics?.some(
                            (diagnostic) => diagnostic.code?.replace(/^([^()]+)\(([^)]+)\)$/u, '$1/$2') === target,
                        ),
                        JSON.stringify(diagnostics),
                    ).toBe(true);
                }
            });
        });
    });
});
