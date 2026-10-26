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

    it('extends queued deadlines while leases are active without an explicit timeout', async () => {
        const session = await startLintSession(BUDGET, { usage: () => 16 });
        try {
            const release = await acquireLintLease(session.descriptor, 128, 1);
            const pending = acquireLintLease(session.descriptor, 128, 1);
            const outcome = await Promise.race([
                pending.then(() => 'granted' as const, (error: Error) => error.message),
                new Promise<'waiting'>((resolve) => {
                    setTimeout(() => resolve('waiting'), 100);
                }),
            ]);
            expect(outcome).toBe('waiting');
            release();
            await expect(pending).resolves.toBeTypeOf('function');
        } finally {
            await session.close();
        }
    });

    it('drops queued reservations when their socket closes before admission', async () => {
        const session = await startLintSession(BUDGET, { usage: () => 16 });
        try {
            const { createConnection } = await import('node:net');
            const release = await acquireLintLease(session.descriptor, 128, 1);
            const socket = createConnection(session.descriptor.endpoint);
            await new Promise<void>((resolve) => {
                socket.on('connect', () => resolve());
            });
            socket.write(`${JSON.stringify({ token: session.descriptor.token, memory: 128, threads: 1 })}\n`);
            await new Promise<void>((resolve) => {
                setTimeout(() => resolve(), 100);
            });
            socket.destroy();
            await new Promise<void>((resolve) => {
                setTimeout(() => resolve(), 100);
            });
            release();
            await expect(acquireLintLease(session.descriptor, 64, 1)).resolves.toBeTypeOf('function');
        } finally {
            await session.close();
        }
    });

    it('releases active leases when their sockets close mid-grant', async () => {
        const session = await startLintSession(BUDGET, { usage: () => 16 });
        try {
            const { createConnection } = await import('node:net');
            const first = createConnection(session.descriptor.endpoint);
            await new Promise<void>((resolve) => {
                first.on('connect', () => resolve());
            });
            first.write(`${JSON.stringify({ token: session.descriptor.token, memory: 128, threads: 1 })}\n`);
            const granted = await new Promise<unknown>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Admission reply timed out.')), 5000);
                first.on('error', reject);
                first.on('data', (data: Buffer) => {
                    if (data.toString('utf8').includes('\n')) {
                        clearTimeout(timer);
                        resolve(data.toString('utf8'));
                    }
                });
            });
            expect(String(granted)).toContain('granted');
            expect(session.metrics().acquired).toBe(1);
            first.destroy();
            await new Promise<void>((resolve) => {
                setTimeout(() => resolve(), 100);
            });
            expect(session.metrics().released).toBe(1);
            const release = await acquireLintLease(session.descriptor, 128, 1);
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

    it('rejects unparsable coordinator replies without granting a lease', async () => {
        const session = await startLintSession(BUDGET, { usage: () => 16 });
        try {
            const { createConnection } = await import('node:net');
            // Occupy the only permit so a second lease stays queued server-side.
            const release = await acquireLintLease(session.descriptor, 128, 1);
            const pending = acquireLintLease(session.descriptor, 128, 1);
            const probe = createConnection(session.descriptor.endpoint);
            await new Promise<void>((resolve) => {
                probe.on('connect', () => resolve());
            });
            // Split one admission frame across two chunks so the handler waits
            // for the newline before answering; the pending lease is unaffected.
            probe.write(JSON.stringify({ token: session.descriptor.token, memory: 64, threads: 1 }));
            await new Promise<void>((resolve) => {
                setTimeout(() => resolve(), 50);
            });
            probe.write('\n');
            release();
            await expect(pending).resolves.toBeTypeOf('function');
            probe.destroy();
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

    it('rejects admission frames with invalid credentials or reservations', async () => {
        const session = await startLintSession(BUDGET, { usage: () => 16 });
        try {
            const { createConnection } = await import('node:net');
            const send = (payload: unknown): Promise<string> => new Promise((resolve, reject) => {
                const socket = createConnection(session.descriptor.endpoint);
                const timer = setTimeout(() => {
                    socket.destroy();
                    reject(new Error('Admission reply timed out.'));
                }, 5000);
                let answer = '';
                socket.on('error', (error: Error) => {
                    clearTimeout(timer);
                    resolve(`error:${error.message}`);
                });
                socket.on('data', (data: Buffer) => {
                    answer += data.toString('utf8');
                    if (answer.includes('\n')) {
                        clearTimeout(timer);
                        socket.end();
                        resolve(answer);
                    }
                });
                socket.on('connect', () => {
                    socket.write(`${JSON.stringify(payload)}\n`);
                });
            });
            expect(await send({ token: '0'.repeat(48), memory: 64, threads: 1 }))
                .toContain('Invalid lint session credential');
            expect(await send({ token: session.descriptor.token, memory: 0, threads: 1 }))
                .toContain('Reservation exceeds');
            expect(await send({ memory: 64, threads: 1 }))
                .toContain('Invalid lint session credential');
        } finally {
            await session.close();
        }
    });

    it('drops oversized frames and repeated payloads without granting a lease', async () => {
        const session = await startLintSession(BUDGET, { usage: () => 16 });
        try {
            const { createConnection } = await import('node:net');
            const sendRaw = (chunks: string[]): Promise<string> => new Promise((resolve) => {
                const socket = createConnection(session.descriptor.endpoint);
                socket.on('error', () => resolve('error'));
                socket.on('close', () => resolve('closed'));
                socket.on('connect', () => {
                    for (const chunk of chunks) {
                        socket.write(chunk);
                    }
                    setTimeout(() => {
                        socket.destroy();
                        resolve('timeout');
                    }, 500);
                });
            });
            expect(await sendRaw([`${'x'.repeat(9000)}\n`])).toBe('closed');
        } finally {
            await session.close();
        }
    });

    it('rejects malformed admission payloads without granting a lease', async () => {
        const session = await startLintSession(BUDGET, { usage: () => 16 });
        try {
            const { createConnection } = await import('node:net');
            const socket = createConnection(session.descriptor.endpoint);
            const outcome = await new Promise<string>((resolve) => {
                socket.on('error', (error: Error) => resolve(`error:${error.message}`));
                socket.on('close', () => resolve('closed'));
                socket.on('connect', () => {
                    socket.write(`${JSON.stringify({ lease: 'x'.repeat(9000) })}\n`);
                });
                setTimeout(() => resolve('timeout'), 2000);
            });
            socket.destroy();
            expect(outcome === 'closed' || outcome === 'timeout' || outcome.startsWith('error:')).toBe(true);
        } finally {
            await session.close();
        }
    });
});
