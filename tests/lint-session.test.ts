/** @file Verify command-scoped admission is shared rather than multiplied by child count. */
import { setImmediate } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { acquireLintLease, readLintSession, startLintSession } from '../packages/oxlint-config/src/lint-session';
import { MIB, resolveMemoryBudget } from '../packages/oxlint-config/src/memory-budget';

const BUDGET = resolveMemoryBudget({
    totalBytes: 4096 * MIB,
    availableBytes: 2048 * MIB,
    parallelism: 2,
    constraints: [],
    warnings: [],
}, 256);

describe('one lint admission coordinator', () => {
    it('serializes reservations across clients and reclaims disconnected permits', async () => {
        const session = await startLintSession(BUDGET, { usage: () => 16 });
        try {
            const first = await acquireLintLease(session.descriptor, 128, 1);
            let granted = false;
            const queued = acquireLintLease(session.descriptor, 128, 1).then((release) => {
                granted = true;
                return release;
            });
            await setImmediate();
            expect(granted).toBe(false);
            first();
            const release = await queued;
            expect(granted).toBe(true);
            release();
            await setImmediate();
            expect(session.metrics().acquired).toBe(2);
        } finally {
            await session.close();
        }
    });

    it('rejects oversized requests and wrong credentials instead of enabling independent budgets', async () => {
        const session = await startLintSession(BUDGET, { usage: () => 16 });
        try {
            await expect(acquireLintLease(session.descriptor, 256, 1)).rejects.toThrow('root memory');
            await expect(acquireLintLease(session.descriptor, 256, 1)).rejects.toBeInstanceOf(RangeError);
            await expect(acquireLintLease({ ...session.descriptor, token: '0'.repeat(48) }, 64, 1))
                .rejects.toThrow('credential');
            await expect(acquireLintLease(session.descriptor, 64, 3)).rejects.toThrow('CPU');
        } finally {
            await session.close();
        }
    });

    it('cancels queued clients and times out rather than waiting forever', async () => {
        const session = await startLintSession(BUDGET, { usage: () => 16, timeoutMs: 20 });
        try {
            const release = await acquireLintLease(session.descriptor, 128, 1);
            const controller = new AbortController();
            const pending = acquireLintLease(session.descriptor, 128, 1, controller.signal);
            controller.abort();
            await expect(pending).rejects.toThrow('cancelled');
            await expect(acquireLintLease(session.descriptor, 128, 1)).rejects.toThrow('timed out');
            release();
        } finally {
            await session.close();
        }
    });

    it('validates inherited metadata and rejects already cancelled requests', async () => {
        expect(readLintSession(undefined)).toBeUndefined();
        expect(() => readLintSession('{}')).toThrow('Invalid inherited');
        const session = await startLintSession(BUDGET, { usage: () => 16 });
        try {
            expect(readLintSession(JSON.stringify(session.descriptor))).toEqual(session.descriptor);
            const controller = new AbortController();
            controller.abort();
            await expect(acquireLintLease(session.descriptor, 128, 1, controller.signal)).rejects.toThrow('cancelled');
        } finally {
            await session.close();
        }
    });

    it('notifies active clients when their coordinator is lost', async () => {
        const session = await startLintSession(BUDGET, { usage: () => 16 });
        const closed = new Promise<void>((resolve, reject) => {
            acquireLintLease(session.descriptor, 128, 1, undefined, resolve)
                .then(() => session.close()).catch(reject);
        });
        await closed;
    });
});
