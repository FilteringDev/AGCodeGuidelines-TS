/** @file Compare native candidates with the pinned ESLint fixture contract through real CLI processes. */
import { readFileSync } from 'node:fs';
import {
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { lintBatch, runOxlint } from './cli';

import type { Fixture } from './harness';

const COMPAT = fileURLToPath(import.meta.resolve('@agcodeguidelines/oxlint-plugin/compat'));
const RULES = ['no-debugger', 'no-duplicate-case', 'no-sparse-arrays'];
const FIXTURES = JSON.parse(readFileSync('tests/fixtures/upstream.json', 'utf8')) as Fixture[];

describe('Oxlint 1.82.0 native candidate parity', () => {
    it.each(RULES)('%s records exact differences across the upstream corpus', async (source) => {
        const fixtures = FIXTURES.filter((fixture) => fixture.sourceRule === source);
        expect(fixtures.length).toBeGreaterThan(0);
        const files = Object.fromEntries(fixtures.map((fixture, index) => [`case-${index}.${fixture.lang}`, fixture.code]));
        const native = await lintBatch({
            categories: { correctness: 'off' }, plugins: ['eslint'], rules: { [`eslint/${source}`]: 'error' },
        }, files);
        const compat = await lintBatch({
            categories: { correctness: 'off' },
            jsPlugins: [{ name: 'ag-compat', specifier: COMPAT }],
            rules: { [`ag-compat/${source}`]: 'error' },
        }, files);
        const differences: object[] = [];
        fixtures.forEach((fixture, index) => {
            const filename = `case-${index}.${fixture.lang}`;
            const expected = compat.get(filename)!;
            const actual = native.get(filename)!;
            expect(expected, fixture.id).toHaveLength(fixture.errors.length);
            expect(actual, fixture.id).toHaveLength(expected.length);
            const summarize = (diagnostics: typeof actual) => diagnostics.map(({ message, severity, labels }) => ({
                message, severity, spans: labels?.map((label) => label.span),
            }));
            if (JSON.stringify(summarize(actual)) !== JSON.stringify(summarize(expected))) {
                differences.push({
                    id: fixture.id,
                    code: fixture.code,
                    native: summarize(actual),
                    compat: summarize(expected),
                });
            }
        });
        expect(differences.length).toBeGreaterThan(0);
        expect(differences).toMatchSnapshot();
    });

    it.each(RULES)('%s preserves warning, disabled and suppression behavior in JS, TS and TSX', async (source) => {
        const invalid = {
            'no-debugger': 'debugger;',
            'no-duplicate-case': 'switch (value) { case 1: break; case 1: break; }',
            'no-sparse-arrays': 'const values = [,];',
        }[source]!;
        for (const provider of ['eslint', 'ag-compat']) {
            const target = `${provider}/${source}`;
            const config = {
                categories: { correctness: 'off' },
                plugins: ['eslint'],
                ...(provider === 'ag-compat' ? {
                    jsPlugins: [{ name: provider, specifier: COMPAT }],
                } : {}),
                rules: { [target]: 'warn' },
            };
            const files = Object.fromEntries(['js', 'ts', 'tsx'].flatMap((extension) => [
                [`invalid.${extension}`, invalid],
                [`suppressed.${extension}`, `// eslint-disable-next-line ${target}\n${invalid}`],
                [`inline.${extension}`, `${invalid} // eslint-disable-line ${target}`],
                [`oxlint.${extension}`, `/* oxlint-disable ${target} */\n${invalid}`],
            ]));
            const results = await lintBatch(config, files);
            for (const extension of ['js', 'ts', 'tsx']) {
                expect(results.get(`invalid.${extension}`)).toMatchObject([{ severity: 'warning' }]);
                expect(results.get(`suppressed.${extension}`)).toEqual([]);
                expect(results.get(`inline.${extension}`)).toEqual([]);
                expect(results.get(`oxlint.${extension}`)).toEqual([]);
            }
            const disabled = await lintBatch({ ...config, rules: { [target]: 'off' } }, { 'invalid.ts': invalid });
            expect(disabled.get('invalid.ts')).toEqual([]);
        }
    });

    it.each(RULES)('%s does not introduce a safe autofix absent from the source contract', async (source) => {
        const { code } = FIXTURES.find((fixture) => fixture.sourceRule === source && fixture.errors.length > 0)!;
        const directory = await mkdtemp(join(tmpdir(), 'ag-native-fixes-'));
        try {
            for (const provider of ['eslint', 'ag-compat']) {
                await writeFile(join(directory, 'example.js'), code);
                await writeFile(join(directory, '.oxlintrc.json'), JSON.stringify({
                    categories: { correctness: 'off' },
                    plugins: ['eslint'],
                    ...(provider === 'ag-compat' ? { jsPlugins: [{ name: provider, specifier: COMPAT }] } : {}),
                    rules: { [`${provider}/${source}`]: 'error' },
                }));
                const result = await runOxlint(['--fix', '--config', '.oxlintrc.json', 'example.js'], directory);
                expect(result.diagnostics.length).toBeGreaterThan(0);
                expect(await readFile(join(directory, 'example.js'), 'utf8')).toBe(code);
            }
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
