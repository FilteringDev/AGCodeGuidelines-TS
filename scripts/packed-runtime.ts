/** @file Check staged tarballs with the actual consumer Node and pnpm runtime. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
    mkdtemp,
    readdir,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'ag-minimum-runtime-'));
const archiveDirectory = resolve(process.argv[2] ?? '.cache/runtime-packages');
const names = ['oxlint-plugin', 'rule-catalog', 'oxlint-config'];
const pnpmArgs = process.env.AG_PNPM_CLI ? [process.env.AG_PNPM_CLI] : [];

/**
 * Execute the consumer package manager without changing the source workspace.
 * @param args - Literal pnpm arguments.
 * @returns Captured package manager output.
 */
function pnpm(args: string[]): string {
    return execFileSync(pnpmArgs.length ? process.execPath : 'pnpm', [...pnpmArgs, ...args], {
        cwd: directory,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
    });
}

try {
    const archives = await readdir(archiveDirectory);
    const dependencies = Object.fromEntries(names.map((name) => {
        const archive = archives.filter((file) => file.includes(name) && file.endsWith('.tgz'));
        assert.equal(archive.length, 1, `Expected one staged tarball for ${name}`);
        return [`@agcodeguidelines/${name}`, `file:${join(archiveDirectory, archive[0]!)}`];
    }));
    await writeFile(join(directory, 'package.json'), JSON.stringify({
        name: 'minimum-runtime-consumer',
        private: true,
        type: 'module',
        packageManager: 'pnpm@10.33.4',
        dependencies: { ...dependencies, oxlint: '1.82.0', typescript: '5.9.3' },
    }));
    await writeFile(join(directory, 'pnpm-workspace.yaml'), JSON.stringify({
        autoInstallPeers: false,
        strictPeerDependencies: true,
        engineStrict: true,
        overrides: dependencies,
    }));
    const version = pnpm(['--version']).trim();
    assert.equal(version, '10.33.4', 'Use the pinned Node22-compatible consumer package manager.');
    pnpm(['install', '--ignore-scripts', '--no-frozen-lockfile']);
    await writeFile(join(directory, 'check.mjs'), [
        "import assert from 'node:assert/strict';",
        "import { writeFileSync } from 'node:fs';",
        "import { dirname, join } from 'node:path';",
        "import { fileURLToPath } from 'node:url';",
        "import { createConfig, createCompatibilityConfig } from '@agcodeguidelines/oxlint-config';",
        "import { parseLintArguments, batchLintFiles } from '@agcodeguidelines/oxlint-config/runner';",
        "import { catalog, resolveRuleDetailed } from '@agcodeguidelines/rule-catalog';",
        'assert.equal(createConfig().jsPlugins.length, 12);',
        'assert.ok(catalog.inventory.length > 0);',
        "assert.equal(parseLintArguments(['--', '--max-mem', '512']).maxMemMiB, 512);",
        "assert.deepEqual(batchLintFiles(['file.ts'], { environment: {} }), [['file.ts']]);",
        "assert.equal(resolveRuleDetailed('no-debugger').disposition, 'javascript');",
        'const { config, ownership, fallback } = createCompatibilityConfig({',
        "    language: 'typescript', acceptNativeDifferences: true, rules: { 'no-debugger': 'warn' },",
        '});',
        'assert.equal(config.jsPlugins, undefined);',
        'assert.equal(fallback.length, 0);',
        "assert.equal(ownership[0].disposition, 'native');",
        "writeFileSync('native.json', JSON.stringify(config));",
        "for (const name of ['typescript', 'compat', 'stylistic', 'jsdoc', 'react', 'jsx-a11y',",
        "    'import', 'newlines', 'boundaries', 'notice', 'logger']) {",
        "    assert.ok((await import('@agcodeguidelines/oxlint-plugin/' + name)).default.rules);",
        '}',
        "writeFileSync('tools.json', JSON.stringify({",
        "    oxlint: join(dirname(fileURLToPath(import.meta.resolve('oxlint/package.json'))), 'bin/oxlint'),",
        "    tsc: join(dirname(fileURLToPath(import.meta.resolve('typescript/package.json'))), 'bin/tsc'),",
        "    runner: join(dirname(fileURLToPath(import.meta.resolve('@agcodeguidelines/oxlint-config/runner'))), 'lint-cli.js'),",
        '}));',
    ].join('\n'));
    execFileSync(process.execPath, ['check.mjs'], { cwd: directory, stdio: 'inherit' });
    const tools = JSON.parse(await readFile(join(directory, 'tools.json'), 'utf8')) as {
        oxlint: string; tsc: string; runner: string;
    };
    await writeFile(join(directory, 'example.ts'), 'debugger;');
    const output = execFileSync(process.execPath, [
        tools.oxlint,
        '--config', 'native.json', 'example.ts', '--format', 'json',
    ], { cwd: directory, encoding: 'utf8' });
    const { diagnostics } = JSON.parse(output);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].severity, 'warning');
    execFileSync(process.execPath, [tools.runner, '--max-mem', '512', '--profile', 'memory-report.json',
        '--config', 'native.json', 'example.ts'], { cwd: directory, stdio: 'inherit' });
    const memoryReport = JSON.parse(await readFile(join(directory, 'memory-report.json'), 'utf8'));
    assert.equal(memoryReport.status, 0);
    assert.equal(memoryReport.budget.maxMiB, 512);
    await writeFile(join(directory, 'api.ts'), [
        "import { createCompatibilityConfig } from '@agcodeguidelines/oxlint-config';",
        "import { resolveRuleDetailed } from '@agcodeguidelines/rule-catalog';",
        "import { parseLintArguments, batchLintFiles } from '@agcodeguidelines/oxlint-config/runner';",
        "parseLintArguments(['--max-mem=512']); batchLintFiles(['file.ts']);",
        "createCompatibilityConfig({ rules: { 'no-debugger': 'warn' } });",
        "resolveRuleDetailed('no-debugger');",
    ].join('\n'));
    execFileSync(process.execPath, [
        tools.tsc,
        '--noEmit', '--strict', '--target', 'es2023', '--module', 'nodenext', 'api.ts',
    ], { cwd: directory, stdio: 'inherit' });
    const installed = await readdir(join(directory, 'node_modules/.pnpm'));
    assert.ok(!installed.some((name) => /^(?:eslint|oxlint-tsgolint)@/u.test(name)));
    for (const name of names) {
        const manifest = JSON.parse(await readFile(join(directory, 'node_modules/@agcodeguidelines', name, 'package.json'), 'utf8'));
        assert.equal(manifest.engines.node, '>=22.12.0');
    }
    process.stdout.write(`Packed runtime passed: Node ${process.version}, pnpm ${version}, TypeScript 5.9.3.\n`);
} finally {
    await rm(directory, { recursive: true, force: true });
}
