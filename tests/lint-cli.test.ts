/** @file Verify the resource-aware execution CLI against the pinned native engine. */
import {
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { lintUsage, runLintCli } from '../packages/oxlint-config/src/lint-cli';

describe('memory-aware lint CLI', () => {
    it('uses standard output for help when no custom printer is supplied', async () => {
        const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        try {
            expect(await runLintCli(['--help'])).toBe(0);
            expect(output).toHaveBeenCalledWith(lintUsage);
        } finally {
            output.mockRestore();
        }
    });

    it('finishes nested CLI invocations using one inherited package permit', async () => {
        const { startLintSession } = await import('../packages/oxlint-config/src/lint-session');
        const { probeMemory, resolveMemoryBudget } = await import('../packages/oxlint-config/src/memory-budget');
        const session = await startLintSession(resolveMemoryBudget(probeMemory(), 1024), { usage: () => 16 });
        const previous = process.env.AG_LINT_SESSION;
        process.env.AG_LINT_SESSION = JSON.stringify(session.descriptor);
        try {
            const cli = resolve('packages/oxlint-config/dist/lint-cli.js');
            const script = [
                "const { spawnSync } = require('node:child_process');",
                `const result = spawnSync(process.execPath, [${JSON.stringify(cli)},`,
                "    '--max-mem', '1024', '--command', process.execPath, '-e', 'process.exit(0)'],",
                "    { stdio: 'inherit' });",
                'process.exit(result.status ?? 1);',
            ].join('\n');
            expect(await runLintCli(['--max-mem', '1024', '--command', process.execPath, '-e', script], {
                stdio: 'ignore',
            })).toBe(0);
            expect(session.metrics().acquired).toBe(1);
        } finally {
            if (previous === undefined) {
                delete process.env.AG_LINT_SESSION;
            } else {
                process.env.AG_LINT_SESSION = previous;
            }
            await session.close();
        }
    });

    it('rejects a child budget increase before launching any engine', async () => {
        const { startLintSession } = await import('../packages/oxlint-config/src/lint-session');
        const { probeMemory, resolveMemoryBudget } = await import('../packages/oxlint-config/src/memory-budget');
        const session = await startLintSession(resolveMemoryBudget(probeMemory(), 512), { usage: () => 16 });
        const previous = process.env.AG_LINT_SESSION;
        process.env.AG_LINT_SESSION = JSON.stringify(session.descriptor);
        try {
            await expect(runLintCli(['--max-mem', '1024'])).rejects.toThrow('cannot increase');
        } finally {
            if (previous === undefined) {
                delete process.env.AG_LINT_SESSION;
            } else {
                process.env.AG_LINT_SESSION = previous;
            }
            await session.close();
        }
    });

    it('rejects a nested reservation that exceeds its parent lease', async () => {
        const { startLintSession } = await import('../packages/oxlint-config/src/lint-session');
        const { probeMemory, resolveMemoryBudget } = await import('../packages/oxlint-config/src/memory-budget');
        const session = await startLintSession(resolveMemoryBudget(probeMemory(), 1024), { usage: () => 16 });
        const previous = process.env.AG_LINT_SESSION;
        const previousLease = process.env.AG_LINT_LEASE_MIB;
        process.env.AG_LINT_SESSION = JSON.stringify(session.descriptor);
        process.env.AG_LINT_LEASE_MIB = '1';
        try {
            await expect(runLintCli(['--max-mem', '512', '--command', process.execPath, '-e', 'process.exit(0)'], {
                stdio: 'ignore',
            })).rejects.toThrow('parent lease');
        } finally {
            if (previous === undefined) {
                delete process.env.AG_LINT_SESSION;
            } else {
                process.env.AG_LINT_SESSION = previous;
            }
            if (previousLease === undefined) {
                delete process.env.AG_LINT_LEASE_MIB;
            } else {
                process.env.AG_LINT_LEASE_MIB = previousLease;
            }
            await session.close();
        }
    });

    it('shares one package permit across nested invocations without a parent lease', async () => {
        const { startLintSession } = await import('../packages/oxlint-config/src/lint-session');
        const { probeMemory, resolveMemoryBudget } = await import('../packages/oxlint-config/src/memory-budget');
        const session = await startLintSession(resolveMemoryBudget(probeMemory(), 1024), { usage: () => 16 });
        const previous = process.env.AG_LINT_SESSION;
        const previousLease = process.env.AG_LINT_LEASE_MIB;
        process.env.AG_LINT_SESSION = JSON.stringify(session.descriptor);
        delete process.env.AG_LINT_LEASE_MIB;
        try {
            expect(await runLintCli(['--max-mem', '256', '--command', process.execPath, '-e', 'process.exit(0)'], {
                stdio: 'ignore',
            })).toBe(0);
            expect(session.metrics().acquired).toBe(1);
        } finally {
            if (previous === undefined) {
                delete process.env.AG_LINT_SESSION;
            } else {
                process.env.AG_LINT_SESSION = previous;
            }
            if (previousLease === undefined) {
                delete process.env.AG_LINT_LEASE_MIB;
            } else {
                process.env.AG_LINT_LEASE_MIB = previousLease;
            }
            await session.close();
        }
    });

    it('prints its memory contract without loading engines', async () => {
        const output: string[] = [];
        expect(await runLintCli(['--help'], { print: (text) => output.push(text) })).toBe(0);
        expect(output).toEqual([lintUsage]);
    });

    it('executes literal native argv and records measured budget provenance', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'ag-lint-cli-'));
        try {
            await writeFile(
                join(directory, 'config.json'),
                JSON.stringify({
                    categories: { correctness: 'off' },
                    plugins: ['eslint'],
                    rules: { 'eslint/no-debugger': 'error' },
                }),
            );
            await writeFile(join(directory, "file with 'quotes'.ts"), 'debugger;');
            const status = await runLintCli(
                ['--max-mem', '1024', '--profile', 'profile.json', '--config', 'config.json', "file with 'quotes'.ts"],
                { cwd: directory, stdio: 'ignore' },
            );
            expect(status).toBe(1);
            const profile = JSON.parse(await readFile(join(directory, 'profile.json'), 'utf8'));
            expect(profile).toMatchObject({
                budget: { maxMiB: 1024, mode: 'explicit' },
                enforcement: process.platform === 'linux' ? 'monitored-process-tree' : 'admission-only',
                completed: 1,
                status: 1,
            });
            expect(profile.engineArgs).not.toContain('--max-mem');
            expect(profile.phases.engineResolutionMs).toBeGreaterThanOrEqual(0);
            await expect(runLintCli(['--max-mem', '1'], { cwd: directory })).rejects.toThrow('headroom');
            const cacheError = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
            try {
                const cacheOnly = await runLintCli(
                    ['--max-mem', '1024', '--cache', '--command', process.execPath, '-e', 'process.exit(0)'],
                    { cwd: directory, stdio: 'ignore' },
                );
                expect(cacheOnly).toBe(0);
                expect(cacheError.mock.calls.map(([text]) => String(text)).join('')).toContain('--cache requires');
            } finally {
                cacheError.mockRestore();
            }
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it('supervises a command without forwarding execution-only flags', async () => {
        expect(
            await runLintCli(['--max-mem=1024', '--command', process.execPath, '-e', 'process.exit(0)'], {
                stdio: 'ignore',
            }),
        ).toBe(0);
        await expect(runLintCli(['--max-mem=1024', '--threads=9999'])).rejects.toThrow('Thread request');
    });
});
