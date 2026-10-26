/** @file Check forward progress, aggregate admission and child cleanup with deterministic workloads. */
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MIB, resolveMemoryBudget } from '../packages/oxlint-config/src/memory-budget';
import { processTreeMiB, runLintTasks } from '../packages/oxlint-config/src/lint-runner';

import type { LintTask } from '../packages/oxlint-config/src/lint-runner';

const SNAPSHOT = {
    totalBytes: 1024 * MIB,
    availableBytes: 1024 * MIB,
    parallelism: 2,
    constraints: [],
    warnings: [],
};
const BUDGET = resolveMemoryBudget(SNAPSHOT, 256);
const OPTIONS = {
    budget: BUDGET,
    probe: () => SNAPSHOT,
    usage: () => 16,
    stdio: 'ignore' as const,
    intervalMs: 5,
    admissionTimeoutMs: 1000,
};
const task = (code = ''): LintTask => ({ command: process.execPath, args: ['-e', code], memoryMiB: 128 });

describe('bounded lint forward progress', () => {
    it.skipIf(process.platform === 'win32')('escalates when an active worker ignores SIGTERM', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'ag-lint-escalation-'));
        const ready = join(directory, 'ready');
        const controller = new AbortController();
        const code = `process.on('SIGTERM', () => {});
            require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready');
            setInterval(() => {}, 1000);`;
        const deadline = setTimeout(() => controller.abort(), 2000);
        const watch = setInterval(() => {
            if (existsSync(ready)) {
                controller.abort();
            }
        }, 5);
        try {
            const report = await runLintTasks([task(code)], { ...OPTIONS, signal: controller.signal });
            expect(report).toMatchObject({ status: 130, completed: 1, tasks: [{ signal: 'SIGKILL' }] });
        } finally {
            clearTimeout(deadline);
            clearInterval(watch);
            controller.abort();
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it.skipIf(process.platform !== 'linux')('cleans up detached descendants that ignore graceful termination', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'ag-lint-descendant-'));
        const ready = join(directory, 'ready');
        const controller = new AbortController();
        const descendant = `process.on('SIGTERM', () => {});
            require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid));
            setInterval(() => {}, 1000);`;
        const parent = `require('node:child_process').spawn(process.execPath,
            ['-e', ${JSON.stringify(descendant)}], { detached: true, stdio: 'ignore' });
            setInterval(() => {}, 1000);`;
        const deadline = setTimeout(() => controller.abort(), 2000);
        const watch = setInterval(() => {
            if (existsSync(ready) && Number(readFileSync(ready, 'utf8')) > 1) {
                controller.abort();
            }
        }, 5);
        try {
            const report = await runLintTasks([task(parent)], { ...OPTIONS, signal: controller.signal });
            expect(report.status).toBe(130);
            expect(existsSync(ready)).toBe(true);
            const identifier = Number(readFileSync(ready, 'utf8'));
            expect(identifier).toBeGreaterThan(1);
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 25);
            });
            const status = `/proc/${identifier}/stat`;
            if (existsSync(status)) {
                const value = readFileSync(status, 'utf8');
                expect(value.slice(value.lastIndexOf(')') + 2).split(' ')[0]).toBe('Z');
            }
        } finally {
            clearTimeout(deadline);
            clearInterval(watch);
            controller.abort();
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('finishes empty queues and serializes work that cannot fit simultaneously', async () => {
        expect(await runLintTasks([], OPTIONS)).toMatchObject({ status: 0, started: 0, completed: 0 });
        const report = await runLintTasks([task(), task(), task()], OPTIONS);
        expect(report).toMatchObject({
            status: 0,
            started: 3,
            completed: 3,
            enforcement: process.platform === 'linux' ? 'monitored-process-tree' : 'admission-only',
        });
        expect(report.tasks.every((result) => result.status === 0)).toBe(true);
    });

    it('rejects impossible tasks rather than leaving them in an endless queue', async () => {
        await expect(runLintTasks([{ ...task(), memoryMiB: 256 }], OPTIONS)).rejects.toThrow('reservation');
        await expect(runLintTasks([{ ...task(), threads: 3 }], OPTIONS)).rejects.toThrow('CPU');
        await expect(runLintTasks([{ ...task(), memoryMiB: 0 }], OPTIONS)).rejects.toThrow('positive integer');
    });

    it('waits for active work instead of treating its reservation as stalled pressure', async () => {
        const report = await runLintTasks([task('setTimeout(() => {}, 60)'), task()], {
            ...OPTIONS, admissionTimeoutMs: 15,
        });
        expect(report).toMatchObject({ status: 0, completed: 2 });
    });

    it('reports resource pressure and can make progress when pressure clears', async () => {
        let checks = 0;
        const report = await runLintTasks([task()], {
            ...OPTIONS,
            probe: () => {
                checks += 1;
                return { ...SNAPSHOT, availableBytes: checks > 2 ? 1024 * MIB : 0 };
            },
        });
        expect(report.status).toBe(0);
        const blocked = await runLintTasks([task()], {
            ...OPTIONS,
            admissionTimeoutMs: 20,
            probe: () => ({ ...SNAPSHOT, availableBytes: 0 }),
        });
        expect(blocked).toMatchObject({ status: 3, started: 0, completed: 0 });
    });

    it('preserves lint failures and spawn failures while stopping unstarted work', async () => {
        expect(await runLintTasks([task('process.exit(1)'), task()], OPTIONS)).toMatchObject({
            status: 1,
            started: 1,
            completed: 1,
        });
        expect(await runLintTasks([{ ...task(), command: '/missing-ag-lint-executable' }], OPTIONS)).toMatchObject({
            status: 2,
            started: 1,
            completed: 1,
        });
    });

    it('cancels running and queued children and releases every reservation', async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30);
        const report = await runLintTasks([task('setInterval(() => {}, 1000)'), task()], {
            ...OPTIONS,
            signal: controller.signal,
        });
        clearTimeout(timer);
        expect(report).toMatchObject({ status: 130, started: 1, completed: 1 });
        expect(await runLintTasks([task()], OPTIONS)).toMatchObject({ status: 0 });
    });

    it('stops active work on aggregate over-budget observations', async () => {
        let observations = 0;
        const report = await runLintTasks([task('setInterval(() => {}, 1000)')], {
            ...OPTIONS,
            usage: () => {
                observations += 1;
                return observations < 3 ? 16 : 300;
            },
        });
        expect(report).toMatchObject({ status: 3, completed: 1, peakTreeMiB: 300 });
    });

    it('preserves explicit SIGTERM cancellation before launching work', async () => {
        const controller = new AbortController();
        controller.abort('SIGTERM');
        expect(await runLintTasks([task()], { ...OPTIONS, signal: controller.signal }))
            .toMatchObject({ status: 143, started: 0, completed: 0 });
    });

    it('observes the owned process tree without trusting reused identifiers', () => {
        expect(processTreeMiB()).toBeGreaterThan(0);
        expect(processTreeMiB(2 ** 31)).toBeGreaterThanOrEqual(0);
    });

    it.skipIf(process.platform === 'win32')('preserves child SIGKILL instead of reporting a lint violation', async () => {
        expect(await runLintTasks([task('process.kill(process.pid, "SIGKILL")')], OPTIONS))
            .toMatchObject({ status: 137, completed: 1, tasks: [{ signal: 'SIGKILL' }] });
    });
});
