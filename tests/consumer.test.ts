/**
 * @file Install packed public packages outside the workspace and exercise their APIs.
 */
import { execFileSync } from 'node:child_process';
import {
    mkdtemp,
    readdir,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';

import { execPnpm } from '../scripts/process';

let directory: string;
let oxlint: string;
let tsc: string;
let tsx: string;

/**
 * Execute an installed command and retain its observable exit status.
 * @param executable - Node command entry point.
 * @param args - Literal command arguments.
 * @returns Command output and status.
 */
function run(executable: string, args: string[]): { output: string; status: number } {
    try {
        return {
            output: execFileSync(process.execPath, [executable, ...args], {
                cwd: directory,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
            }),
            status: 0,
        };
    } catch (error: unknown) {
        const failure = error as { stdout?: string; stderr?: string; status?: number };
        if (failure.status === undefined) {
            throw error;
        }
        return { output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`, status: failure.status };
    }
}

beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ag-packed-consumer-'));
    for (const name of ['oxlint-plugin', 'oxlint-config', 'rule-catalog']) {
        execPnpm(['pack', '--pack-destination', directory], {
            cwd: resolve(`packages/${name}`),
            encoding: 'utf8',
        });
    }
    const archives = await readdir(directory);
    const archive = (name: string) => `file:${join(
        directory,
        archives.find((file) => file.includes(name))!,
    )}`;
    await writeFile(
        join(directory, 'package.json'),
        JSON.stringify({
            name: 'isolated-consumer',
            private: true,
            type: 'module',
            packageManager: 'pnpm@12.3.4',
            dependencies: {
                '@agcodeguidelines/oxlint-config': archive('oxlint-config'),
                '@agcodeguidelines/oxlint-plugin': archive('oxlint-plugin'),
                '@agcodeguidelines/rule-catalog': archive('rule-catalog'),
                oxlint: '1.82.0',
                typescript: '7.0.2',
                tsx: '4.23.13',
            },
        }),
    );
    await writeFile(
        join(directory, 'pnpm-workspace.yaml'),
        JSON.stringify({
            autoInstallPeers: false,
            strictPeerDependencies: false,
            minimumReleaseAge: 0,
            allowBuilds: { esbuild: false },
            overrides: { '@agcodeguidelines/oxlint-plugin': archive('oxlint-plugin') },
        }),
    );
    execPnpm(['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'], {
        cwd: directory,
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
    });
    const requireConsumer = createRequire(join(directory, 'package.json'));
    oxlint = join(dirname(requireConsumer.resolve('oxlint/package.json')), 'bin/oxlint');
    tsc = join(dirname(requireConsumer.resolve('typescript/package.json')), 'bin/tsc');
    tsx = requireConsumer.resolve('tsx/cli');
    await writeFile(
        join(directory, 'configure.ts'),
        [
            "import { writeFileSync } from 'node:fs';",
            "import { createConfig } from '@agcodeguidelines/oxlint-config';",
            "import plugin from '@agcodeguidelines/oxlint-plugin';",
            "for (const language of ['javascript', 'typescript'] as const) {",
            "    const config = createConfig({ language, environment: 'node' });",
            "    writeFileSync(language + '.json', JSON.stringify(config));",
            '}',
            "if (plugin.meta?.name !== 'ag') throw new Error('Missing plugin export');",
        ].join('\n'),
    );
    const configuration = run(tsx, ['configure.ts']);
    expect(configuration.status, configuration.output).toBe(0);
    await writeFile(
        join(directory, 'api.ts'),
        [
            "import { createConfig } from '@agcodeguidelines/oxlint-config';",
            "import plugin from '@agcodeguidelines/oxlint-plugin';",
            "import { catalog } from '@agcodeguidelines/rule-catalog';",
            "const config = createConfig({ language: 'typescript', environment: 'both' });",
            "if (!config.rules || !plugin.rules || !catalog.clauses.length) throw new Error('Broken public API');",
            '// @ts-expect-error Unsupported language must remain a compile-time error.',
            "createConfig({ language: 'flow' });",
        ].join('\n'),
    );
    await writeFile(
        join(directory, 'tsconfig.json'),
        JSON.stringify({
            extends: '@agcodeguidelines/oxlint-config/tsconfig',
            compilerOptions: { noEmit: true, types: [] },
            files: ['main.ts', 'api.ts'],
        }),
    );
});

afterAll(async () => {
    if (directory !== undefined) {
        await rm(directory, { recursive: true, force: true });
    }
});

describe('installed package contract', () => {
    it('installs without an ESLint engine', async () => {
        const installed = await readdir(join(directory, 'node_modules/.pnpm'));
        expect(installed.filter((name) => /^eslint@/u.test(name))).toEqual([]);
    });

    it('executes the published configuration CLI and surfaces argument errors', () => {
        const cli = join(directory, 'node_modules/@agcodeguidelines/oxlint-config/dist/cli.js');
        const valid = run(cli, ['--language', 'typescript', '--environment', 'node', '--output', '-']);
        expect(valid.status, valid.output).toBe(0);
        expect(JSON.parse(valid.output).settings.agTypeScript).toBe(true);
        const invalid = run(cli, ['--invalid']);
        expect(invalid.status).toBe(1);
        expect(invalid.output).toContain('Unknown option: --invalid');
    });
    it.each(['javascript', 'typescript'])('%s preset loads and reports violations', async (language) => {
        const extension = language === 'typescript' ? 'ts' : 'js';
        const filename = `main.${extension}`;
        await writeFile(
            join(directory, filename),
            '/**\n * @file Consumer fixture.\n */\n\nconst VALUE = 1;\n\nexport default VALUE;\n',
        );
        const valid = run(oxlint, ['--config', `${language}.json`, filename, '--format', 'json']);
        expect(valid.status, valid.output).toBe(0);
        await writeFile(join(directory, filename), 'var value = 1;\nconsole.log(value);\n');
        const invalid = run(oxlint, ['--config', `${language}.json`, filename, '--format', 'json']);
        expect(invalid.status, invalid.output).toBe(1);
        expect(invalid.output).toContain('ag-compat(no-var)');
        expect(invalid.output).toContain('ag-compat(no-console)');
    });

    it('ships strict compiler settings and usable public declarations', async () => {
        await writeFile(join(directory, 'main.ts'), 'const values = [1]; const value: number = values[0];');
        const invalid = run(tsc, ['-p', 'tsconfig.json']);
        expect(invalid.status).not.toBe(0);
        expect(invalid.output).toContain('TS2322');
        await writeFile(join(directory, 'main.ts'), 'const values: [number] = [1]; const value: number = values[0];');
        const valid = run(tsc, ['-p', 'tsconfig.json']);
        expect(valid.status, valid.output).toBe(0);
        const modules = await readdir(join(directory, 'node_modules/@agcodeguidelines'));
        expect(modules.sort()).toEqual(['oxlint-config', 'oxlint-plugin', 'rule-catalog']);
    });

    it('ships JSON presets, declarations, and documentation and attribution in every archive', async () => {
        for (const name of ['oxlint-config', 'oxlint-plugin', 'rule-catalog']) {
            const root = join(directory, `node_modules/@agcodeguidelines/${name}`);
            expect((await readFile(join(root, 'dist/index.d.ts'), 'utf8')).length).toBeGreaterThan(0);
            expect((await readFile(join(root, 'README.md'), 'utf8')).length).toBeGreaterThan(0);
            expect((await readFile(join(root, 'LICENSE'), 'utf8')).length).toBeGreaterThan(0);
            expect(await readFile(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8')).toContain('Third-party notices');
        }
        const json = JSON.parse(
            await readFile(
                join(directory, 'node_modules/@agcodeguidelines/oxlint-config/dist/javascript.json'),
                'utf8',
            ),
        );
        expect(json.rules['ag-compat/no-console']).toBe('error');
    });
});
