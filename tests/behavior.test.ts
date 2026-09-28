/**
 * @file Verify compiler policy, interacting helper rules, and safe fix convergence.
 */
import { execFileSync } from 'node:child_process';
import {
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createConfig } from '../packages/oxlint-config/src/index';
import { lintBatch, runOxlint } from './cli';

const REQUIRE = createRequire(import.meta.url);
const TSC = join(dirname(REQUIRE.resolve('typescript/package.json')), 'bin/tsc');
const COMPILER_CASES = [
    ['implicit any', 'function identity(value) { return value; }', '7006'],
    ['nullable value', 'const value: string = null;', '2322'],
    ['unchecked array index', 'const values = [1]; const value: number = values[0];', '2322'],
    ['unchecked record key', 'const values: Record<string, number> = {}; const value: number = values.key;', '2322'],
    ['unknown catch', 'try {} catch (error) { error.message; }', '18046'],
    [
        'narrowed array index',
        'const values = [1]; const value = values[0]; if (value !== undefined) { value.toFixed(); }',
        null,
    ],
    ['narrowed catch', 'try {} catch (error) { if (error instanceof Error) { error.message; } }', null],
    ['bounded tuple', 'const values: [number] = [1]; const value: number = values[0];', null],
] as const;

// The rule emits unindented members, as upstream does; the indent rule owns their indentation.
const TYPE_IMPORT_FIXES: Record<string, { source: string; fixed: string }> = {
    'type-only.ts': {
        source: "import type { Alpha, Beta, Gamma, Delta } from './types';\n",
        fixed: "import type {\nAlpha,\nBeta,\nGamma,\nDelta\n} from './types';\n",
    },
    'type-only-alias.ts': {
        source: "import type { Alpha as A, Beta, Gamma, Delta as D } from './types';\n",
        fixed: "import type {\nAlpha as A,\nBeta,\nGamma,\nDelta as D\n} from './types';\n",
    },
    'type-only-joined.ts': {
        source: "import type {\n    Alpha,\n    Beta,\n} from './types';\n",
        fixed: "import type { Alpha, Beta } from './types';\n",
    },
    'inline.ts': {
        source: "import { type Alpha, Beta, Gamma, Delta } from './types';\n",
        fixed: "import {\ntype Alpha,\nBeta,\nGamma,\nDelta\n} from './types';\n",
    },
    'inline-alias.ts': {
        source: "import { type Alpha as A, Beta, type Gamma, Delta } from './types';\n",
        fixed: "import {\ntype Alpha as A,\nBeta,\ntype Gamma,\nDelta\n} from './types';\n",
    },
    'inline-joined.ts': {
        source: "import {\n    type Alpha,\n    Beta as B,\n} from './types';\n",
        fixed: "import { type Alpha, Beta as B } from './types';\n",
    },
    'default-inline.ts': {
        source: "import Main, { type Alpha, Beta, Gamma, Delta } from './types';\n",
        fixed: "import Main, {\ntype Alpha,\nBeta,\nGamma,\nDelta\n} from './types';\n",
    },
    'export-from.ts': {
        source: "export type { Alpha, Beta, Gamma, Delta } from './types';\n",
        fixed: "export type { Alpha, Beta, Gamma, Delta } from './types';\n",
    },
    'export-local.ts': {
        source: 'type Alpha = 1;\ntype Beta = 2;\ntype Gamma = 3;\ntype Delta = 4;\nexport type { Alpha, Beta, Gamma, Delta };\n',
        fixed: 'type Alpha = 1;\ntype Beta = 2;\ntype Gamma = 3;\ntype Delta = 4;\nexport type { Alpha, Beta, Gamma, Delta };\n',
    },
};

describe('TypeScript 7 compiler contract', () => {
    it.each(COMPILER_CASES)('%s', async (_name, code, diagnostic) => {
        const directory = await mkdtemp(join(tmpdir(), 'ag-compiler-'));
        try {
            await writeFile(join(directory, 'main.ts'), code);
            await writeFile(
                join(directory, 'tsconfig.json'),
                JSON.stringify({
                    extends: resolve('packages/oxlint-config/tsconfig.base.json'),
                    compilerOptions: { noEmit: true, types: [] },
                    files: ['main.ts'],
                }),
            );
            let output = '';
            let status = 0;
            try {
                output = execFileSync(process.execPath, [TSC, '-p', 'tsconfig.json'], {
                    cwd: directory,
                    encoding: 'utf8',
                });
            } catch (error: unknown) {
                const failure = error as { stdout: string; status: number };
                output = failure.stdout;
                status = failure.status;
            }
            expect(status === 0, output).toBe(diagnostic === null);
            if (diagnostic !== null) {
                expect(output).toContain(`TS${diagnostic}`);
            }
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});

it.each(['jsx-uses-react', 'jsx-uses-vars'])('%s cooperates with unused binding analysis', async (helper) => {
    const config = {
        categories: { correctness: 'off' },
        plugins: ['eslint'],
        jsPlugins: [
            { name: 'ag-react', specifier: REQUIRE.resolve('@agcodeguidelines/oxlint-plugin/react') },
            { name: 'ag-compat', specifier: REQUIRE.resolve('@agcodeguidelines/oxlint-plugin/compat') },
        ],
        settings: { agReact: { version: '19.0', pragma: 'React' } },
        rules: { [`ag-react/${helper}`]: 'error', 'ag-compat/no-unused-vars': 'error' },
    };
    const code = helper === 'jsx-uses-react' ? 'const React = {}; <div />;' : 'const Component = () => null; <Component />;';
    const enabled = await lintBatch(config, { 'main.jsx': code });
    const disabled = await lintBatch(
        { ...config, rules: { ...config.rules, [`ag-react/${helper}`]: 'off' } },
        {
            'main.jsx': code,
        },
    );
    expect(enabled.get('main.jsx')).toEqual([]);
    expect(disabled.get('main.jsx')).toHaveLength(1);
});

it('safe formatting fixes preserve comments and converge after repeated CLI passes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ag-fixes-'));
    try {
        const filename = join(directory, 'main.js');
        await writeFile(filename, '// retained comment\nconst value = "text"\n');
        await writeFile(
            join(directory, '.oxlintrc.json'),
            JSON.stringify({
                categories: { correctness: 'off' },
                jsPlugins: [
                    { name: 'ag-style', specifier: REQUIRE.resolve('@agcodeguidelines/oxlint-plugin/stylistic') },
                ],
                rules: { 'ag-style/quotes': ['error', 'single'], 'ag-style/semi': ['error', 'always'] },
            }),
        );
        for (let pass = 0; pass < 5; pass += 1) {
            const result = await runOxlint(['--fix', 'main.js'], directory);
            if (result.status === 0) {
                break;
            }
        }
        const first = await readFile(filename, 'utf8');
        expect(first).toBe("// retained comment\nconst value = 'text';\n");
        const result = await runOxlint(['--fix', 'main.js'], directory);
        expect(result.status).toBe(0);
        expect(result.diagnostics).toEqual([]);
        expect(await readFile(filename, 'utf8')).toBe(first);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

it('import-newlines fixes keep type-only and inline type modifiers valid', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ag-newlines-'));
    try {
        await writeFile(
            join(directory, '.oxlintrc.json'),
            JSON.stringify({
                categories: { correctness: 'off' },
                jsPlugins: [
                    { name: 'ag-newlines', specifier: REQUIRE.resolve('@agcodeguidelines/oxlint-plugin/newlines') },
                ],
                rules: { 'ag-newlines/enforce': ['error', { items: 3, 'max-len': 120 }] },
            }),
        );
        const files = Object.entries(TYPE_IMPORT_FIXES);
        await Promise.all(files.map(([name, { source }]) => writeFile(join(directory, name), source)));
        await runOxlint(['--fix', ...Object.keys(TYPE_IMPORT_FIXES)], directory);
        const fixed = Object.fromEntries(await Promise.all(
            files.map(async ([name]) => [name, await readFile(join(directory, name), 'utf8')]),
        ));
        expect(fixed).toEqual(Object.fromEntries(files.map(([name, expected]) => [name, expected.fixed])));
        // Oxc reports misplaced type modifiers (TS1363, TS2206) as parser diagnostics.
        const result = await runOxlint(Object.keys(TYPE_IMPORT_FIXES), directory);
        expect(result.diagnostics).toEqual([]);
        expect(result.status).toBe(0);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

it('uses the compiler for type safety without requiring a typed lint service', () => {
    const config = createConfig('typescript');
    expect(config.options?.typeAware).not.toBe(true);
    expect(JSON.stringify(config)).not.toContain('strict-boolean-expressions');
    expect(config.overrides![0]!.rules!['typescript/consistent-type-exports']).toBeUndefined();
});

it('opts into the typed lint service without enabling compiler diagnostics', () => {
    const config = createConfig({ language: 'typescript', typeAware: true, profile: 'adguard-projects' });
    expect(config.options).toEqual({ typeAware: true });
    expect(config.overrides![0]!.rules!['typescript/consistent-type-exports']).toBe('error');
    expect(config.rules!['typescript/consistent-type-exports']).toBeUndefined();
    expect(createConfig({ language: 'typescript', typeAware: false }).options).toBeUndefined();
    expect(createConfig('typescript').options).toBeUndefined();
});

it('rejects type-aware linting outside the TypeScript preset', () => {
    expect(() => createConfig({ typeAware: true })).toThrow(/TypeScript preset/u);
    expect(() => createConfig({ language: 'javascript', typeAware: true })).toThrow(/TypeScript preset/u);
    expect(() => createConfig({ language: 'typescript', typeAware: 'true' as unknown as boolean }))
        .toThrow(/boolean/u);
});

it('runs type-dependent export diagnostics in an isolated consumer project', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ag-typed-lint-'));
    try {
        const preset = createConfig({ language: 'typescript', typeAware: true, profile: 'adguard-projects' });
        await writeFile(join(directory, '.oxlintrc.json'), JSON.stringify({
            categories: preset.categories,
            plugins: ['typescript'],
            options: preset.options,
            rules: {
                'typescript/consistent-type-exports': preset.overrides![0]!.rules!['typescript/consistent-type-exports'],
            },
        }));
        await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({
            compilerOptions: {
                strict: true, module: 'ESNext', moduleResolution: 'Bundler', types: [], noEmit: true,
            },
            include: ['*.ts'],
        }));
        await writeFile(join(directory, 'dependency.ts'), 'export interface Value { text: string }');
        await writeFile(join(directory, 'main.ts'), 'export { Value } from "./dependency";');
        const invalid = await runOxlint(['--config', '.oxlintrc.json', 'main.ts'], directory);
        expect(invalid.status).toBe(1);
        expect(invalid.diagnostics).toHaveLength(1);
        expect(invalid.diagnostics[0]!.code).toContain('consistent-type-exports');
        await writeFile(join(directory, 'main.ts'), 'export type { Value } from "./dependency";');
        const valid = await runOxlint(['--config', '.oxlintrc.json', 'main.ts'], directory);
        expect(valid.status).toBe(0);
        expect(valid.diagnostics).toEqual([]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
