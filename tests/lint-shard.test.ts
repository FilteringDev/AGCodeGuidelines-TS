/** @file Verify that sharded Oxlint runs reproduce one process's report and exit status. */
import { execFile } from 'node:child_process';
import {
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { runLintCli } from '../packages/oxlint-config/src/lint-cli';
import { assignShards, planSharding, renderShards } from '../packages/oxlint-config/src/lint-shard';
import { OXLINT } from './cli';

import type { ShardOutput } from '../packages/oxlint-config/src/lint-shard';

const EXEC_FILE = promisify(execFile);
const CONFIG = {
    categories: { correctness: 'off' },
    rules: { 'no-debugger': 'error', 'no-var': 'warn' },
};

/**
 * Run Oxlint directly, keeping the report of a lint failure.
 * @param args - Oxlint arguments.
 * @param cwd - Project directory.
 * @returns Standard output and exit status.
 */
async function oxlint(args: string[], cwd: string): Promise<{ stdout: string; status: number }> {
    try {
        return { stdout: (await EXEC_FILE(process.execPath, [OXLINT, ...args], { cwd })).stdout, status: 0 };
    } catch (error: unknown) {
        const failure = error as { stdout: string; code: number };
        return { stdout: failure.stdout, status: failure.code };
    }
}

describe('shard planning', () => {
    it('separates shared options, report options and targets', () => {
        expect(planSharding(['-c', 'a.json', '--ignore-path=.ignore', '--format', 'unix', '--quiet',
            '--max-warnings', '0', '--threads=4', 'src', '--', '-odd.js'])).toEqual({
            format: 'unix',
            quiet: true,
            silent: false,
            denyWarnings: false,
            maxWarnings: 0,
            options: ['-c', 'a.json', '--ignore-path', '.ignore'],
            targets: ['src', '-odd.js'],
        });
    });

    it.each([
        [['src']],
        [['--format', 'stylish', 'src']],
        [['--format=json', '--fix', 'src']],
        [['--format=json', '--type-aware', 'src']],
        [['--format=json', '--unknown-option', 'src']],
        [['--format=json', '--max-warnings=-1', 'src']],
    ])('keeps %j in one process', (args) => {
        expect(planSharding(args)).toBeUndefined();
    });

    it('balances bytes while preserving discovery order inside each shard', () => {
        expect(assignShards(['a', 'b', 'c', 'd'], [10, 40, 30, 20], 2)).toEqual([['a', 'b'], ['c', 'd']]);
        expect(assignShards(['a'], [1], 3)).toEqual([['a']]);
    });

    it('rejects sharding when a valued option has no value', () => {
        expect(planSharding(['--format=json', '--threads'])).toBeUndefined();
        expect(planSharding(['--format=json', '--config'])).toBeUndefined();
    });
});

describe('shard reports', () => {
    it.each(['json', 'unix'] as const)('render %s exactly like Oxlint', async (format) => {
        const directory = await mkdtemp(join(tmpdir(), 'ag-shard-'));
        try {
            await writeFile(join(directory, '.oxlintrc.json'), JSON.stringify(CONFIG));
            await writeFile(join(directory, 'main.js'), 'debugger;\n');
            const report = await oxlint(['--threads=1', '--format=json', 'main.js'], directory);
            const parsed = JSON.parse(report.stdout) as ShardOutput & { start_time: number };
            const expected = format === 'json' ? report : await oxlint(['--format=unix', 'main.js'], directory);
            const rendered = renderShards(planSharding([`--format=${format}`])!, [parsed], parsed.start_time);
            expect(rendered).toEqual({ text: expected.stdout, status: expected.status });
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it('applies quiet, deny-warnings and maximum-warning policies to all shards', () => {
        const warning = {
            filename: 'a.js',
            severity: 'warning',
            message: 'w',
            labels: [],
        };
        const outputs = [{ diagnostics: [warning], number_of_files: 1, number_of_rules: 1 }];
        expect(renderShards(planSharding(['--format=unix', '--quiet'])!, outputs, 0)).toEqual({ text: '', status: 0 });
        expect(renderShards(planSharding(['--format=unix', '--deny-warnings'])!, outputs, 0).status).toBe(1);
        expect(renderShards(planSharding(['--format=unix', '--max-warnings=1'])!, outputs, 0).status).toBe(0);
        expect(renderShards(planSharding(['--format=unix', '--max-warnings=0'])!, outputs, 0).status).toBe(1);
        expect(renderShards(planSharding(['--format=unix', '--silent'])!, outputs, 0).text).toBe('');
    });

    it('splits a large file set across processes with the same diagnostics', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'ag-shard-'));
        const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        try {
            await writeFile(join(directory, '.oxlintrc.json'), JSON.stringify(CONFIG));
            await Promise.all(Array.from({ length: 260 }, (_, index) => writeFile(
                join(directory, `file-${index}.js`),
                index % 3 === 0 ? 'debugger;\n' : `var value${index} = ${index};\nexport { value${index} };\n`,
            )));
            const status = await runLintCli(['--profile', 'profile.json', '--format', 'unix', '.'], { cwd: directory });
            const sharded = output.mock.calls.map(([text]) => String(text)).join('');
            output.mockRestore();
            const profile = JSON.parse(await readFile(join(directory, 'profile.json'), 'utf8')) as {
                shards?: { count: number; files: number };
            };
            const direct = await oxlint(['--format=unix', '.'], directory);
            const lines = (text: string) => text.split('\n').filter(Boolean).sort();
            expect(profile.shards?.count).toBeGreaterThanOrEqual(2);
            expect(profile.shards?.files).toBe(260);
            expect(lines(sharded)).toEqual(lines(direct.stdout));
            expect(status).toBe(direct.status);
        } finally {
            output.mockRestore();
            await rm(directory, { recursive: true, force: true });
        }
    });

    it('reuses cached diagnostics until file content, configuration or tools change', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'ag-cache-'));
        const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        const run = async () => {
            output.mockClear();
            const status = await runLintCli(
                ['--cache', '--cache-location', 'cache.json', '--profile', 'profile.json', '--format', 'unix', '.'],
                { cwd: directory },
            );
            const profile = JSON.parse(await readFile(join(directory, 'profile.json'), 'utf8')) as {
                cache: { files: number; linted: number };
            };
            const text = output.mock.calls.map(([chunk]) => String(chunk)).join('');
            return { status, linted: profile.cache.linted, lines: text.split('\n').filter(Boolean).sort() };
        };
        try {
            await writeFile(join(directory, '.oxlintrc.json'), JSON.stringify(CONFIG));
            await writeFile(join(directory, 'a.js'), 'debugger;\n');
            await writeFile(join(directory, 'b.js'), 'var value = 1;\nexport { value };\n');
            const cold = await run();
            expect(cold.linted).toBe(2);
            expect(cold.status).toBe(1);
            expect(await run()).toEqual({ ...cold, linted: 0 });
            await writeFile(join(directory, 'a.js'), 'export const value = 1;\n');
            const edited = await run();
            expect(edited).toMatchObject({ linted: 1, status: 0 });
            expect(edited.lines.some((line) => line.startsWith('b.js:1:1:'))).toBe(true);
            expect(edited.lines.some((line) => line.startsWith('a.js'))).toBe(false);
            await writeFile(join(directory, '.oxlintrc.json'), JSON.stringify({ ...CONFIG, rules: { 'no-var': 'off' } }));
            expect(await run()).toMatchObject({ linted: 2, status: 0, lines: [] });
        } finally {
            output.mockRestore();
            await rm(directory, { recursive: true, force: true });
        }
    });
});
