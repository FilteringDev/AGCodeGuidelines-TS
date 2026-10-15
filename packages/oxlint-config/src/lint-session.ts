/** @file Share command-scoped resource admission between nested lint invocations. */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Socket } from 'node:net';
import { MIB, probeMemory } from './memory-budget.js';

import type { MemoryBudget } from './memory-budget.js';

export interface LintSessionDescriptor {
    endpoint: string;
    token: string;
    maxMiB: number;
    parallelism: number;
}

export interface LintSession {
    descriptor: LintSessionDescriptor;
    metrics: () => { active: number; queued: number; acquired: number; released: number };
    close: () => Promise<void>;
}

export interface LintSessionOptions {
    usage: () => number;
    timeoutMs?: number;
}

/**
 * Validate inherited coordinator metadata before loading a lint engine.
 * @param value - Command-local environment value, never included in profiles.
 * @returns The validated descriptor, or undefined for a root invocation.
 */
export function readLintSession(value = process.env.AG_LINT_SESSION): LintSessionDescriptor | undefined {
    if (value === undefined) {
        return undefined;
    }
    const parsed = JSON.parse(value) as Partial<LintSessionDescriptor>;
    if (typeof parsed.endpoint !== 'string' || !parsed.endpoint || typeof parsed.token !== 'string'
        || !/^[a-f0-9]{48}$/u.test(parsed.token) || !Number.isSafeInteger(parsed.maxMiB) || parsed.maxMiB! < 1
        || !Number.isSafeInteger(parsed.parallelism) || parsed.parallelism! < 1) {
        throw new TypeError('Invalid inherited lint budget session.');
    }
    return parsed as LintSessionDescriptor;
}

/**
 * Start one local admission coordinator for the lifetime of a root command.
 * @param budget - Aggregate root budget, not a per-package allocation.
 * @param options - Owned memory observation and bounded queue lifetime.
 * @returns Private connection metadata, observable counters and cleanup.
 */
export async function startLintSession(budget: MemoryBudget, options: LintSessionOptions): Promise<LintSession> {
    const token = randomBytes(24).toString('hex');
    const directory = await mkdtemp(join(tmpdir(), 'ag-lint-session-'));
    const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\ag-lint-${token}` : join(directory, 'socket');
    const queue: { socket: Socket; memory: number; threads: number; deadline: number }[] = [];
    const active = new Map<Socket, { memory: number; threads: number }>();
    const sockets = new Set<Socket>();
    const baseUsage = options.usage();
    let acquired = 0;
    let released = 0;
    let closing = false;
    const reply = (socket: Socket, error: string, resource = false) => {
        socket.end(`${JSON.stringify({ error, resource })}\n`);
    };
    const admit = () => {
        if (closing) {
            return;
        }
        try {
            const snapshot = probeMemory();
            const usage = options.usage();
            const memory = [...active.values()].reduce((sum, lease) => sum + lease.memory, 0);
            const threads = [...active.values()].reduce((sum, lease) => sum + lease.threads, 0);
            const request = queue[0];
            if (!request) {
                return;
            }
            if (active.size && options.timeoutMs === undefined) {
                request.deadline = performance.now() + 30000;
            }
            if (performance.now() >= request.deadline) {
                queue.shift();
                reply(request.socket, 'Resource admission timed out.', true);
                return;
            }
            const headroom = Math.min(
                snapshot.availableBytes,
                ...snapshot.constraints.map((constraint) => Math.max(0, constraint.limitBytes - constraint.usedBytes)),
            );
            const unrealized = Math.max(0, memory - Math.max(0, usage - baseUsage));
            if (Math.max(usage, baseUsage + memory) + request.memory <= budget.maxMiB
                && (request.memory + unrealized) * MIB <= headroom
                && threads + request.threads <= Math.min(snapshot.parallelism, budget.snapshot.parallelism)) {
                queue.shift();
                active.set(request.socket, { memory: request.memory, threads: request.threads });
                acquired += 1;
                request.socket.write('{"granted":true}\n');
            }
        } catch (error: unknown) {
            for (const request of queue.splice(0)) {
                reply(request.socket, `Cannot observe resource pressure: ${(error as Error).message}`, true);
            }
        }
    };
    const server = createServer((socket) => {
        sockets.add(socket);
        let buffer = '';
        let received = false;
        socket.setEncoding('utf8');
        socket.on('error', () => socket.destroy());
        socket.on('close', () => {
            sockets.delete(socket);
            if (active.delete(socket)) {
                released += 1;
            }
            const index = queue.findIndex((request) => request.socket === socket);
            if (index !== -1) {
                queue.splice(index, 1);
            }
            admit();
        });
        socket.on('data', (data: string) => {
            buffer += data;
            if (buffer.length > 8192 || received) {
                socket.destroy();
                return;
            }
            if (!buffer.includes('\n')) {
                return;
            }
            received = true;
            try {
                const request = JSON.parse(buffer.slice(0, buffer.indexOf('\n'))) as {
                    token?: string; memory?: number; threads?: number;
                };
                if (typeof request.token !== 'string' || request.token.length !== token.length
                    || !timingSafeEqual(Buffer.from(request.token), Buffer.from(token))) {
                    reply(socket, 'Invalid lint session credential.');
                    return;
                }
                if (!Number.isSafeInteger(request.memory) || request.memory! < 1
                    || !Number.isSafeInteger(request.threads) || request.threads! < 1
                    || request.memory! + baseUsage > budget.maxMiB
                    || request.threads! > budget.snapshot.parallelism) {
                    reply(socket, 'Reservation exceeds the root memory or CPU budget.', true);
                    return;
                }
                queue.push({
                    socket,
                    memory: request.memory!,
                    threads: request.threads!,
                    deadline: performance.now() + (options.timeoutMs ?? 30000),
                });
                admit();
            } catch {
                reply(socket, 'Invalid lint resource request.');
            }
        });
    });
    try {
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(endpoint, () => {
                server.removeListener('error', reject);
                resolve();
            });
        });
    } catch (error: unknown) {
        await rm(directory, { recursive: true, force: true });
        throw error;
    }
    const timer = setInterval(admit, 25);
    return {
        descriptor: {
            endpoint, token, maxMiB: budget.maxMiB, parallelism: budget.snapshot.parallelism,
        },
        metrics: () => ({
            active: active.size, queued: queue.length, acquired, released,
        }),
        close: async () => {
            closing = true;
            clearInterval(timer);
            sockets.forEach((socket) => socket.destroy());
            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
            await rm(directory, { recursive: true, force: true });
        },
    };
}

/**
 * Hold a root-coordinator permit until command completion or connection loss.
 * @param descriptor - Inherited private coordinator connection metadata.
 * @param memory - Requested whole MiB reservation.
 * @param threads - Requested CPU tokens.
 * @param signal - Cancellation for queued admission.
 * @param onDisconnect - Notify the caller when an active coordinator connection is lost.
 * @returns An idempotent release callback.
 */
export async function acquireLintLease(
    descriptor: LintSessionDescriptor,
    memory: number,
    threads: number,
    signal?: AbortSignal,
    onDisconnect?: () => void,
): Promise<() => void> {
    if (signal?.aborted) {
        throw new Error('Lint admission cancelled.');
    }
    return new Promise((resolve, reject) => {
        const socket = connect(descriptor.endpoint);
        let granted = false;
        let released = false;
        let buffer = '';
        const abort = () => socket.destroy(new Error('Lint admission cancelled.'));
        socket.setEncoding('utf8');
        socket.once('connect', () => socket.write(`${JSON.stringify({ token: descriptor.token, memory, threads })}\n`));
        socket.once('error', reject);
        socket.once('close', () => {
            signal?.removeEventListener('abort', abort);
            if (!granted) {
                reject(new Error('Lint coordinator closed before granting admission.'));
            } else if (!released) {
                onDisconnect?.();
            }
        });
        socket.on('data', (data: string) => {
            buffer += data;
            if (!buffer.includes('\n')) {
                return;
            }
            try {
                const result = JSON.parse(buffer.slice(0, buffer.indexOf('\n'))) as {
                    granted?: boolean; error?: string; resource?: boolean;
                };
                if (!result.granted) {
                    socket.destroy();
                    const ErrorType = result.resource ? RangeError : Error;
                    reject(new ErrorType(result.error ?? 'Lint admission rejected.'));
                    return;
                }
                granted = true;
                signal?.removeEventListener('abort', abort);
                resolve(() => {
                    released = true;
                    socket.end();
                });
            } catch (error: unknown) {
                socket.destroy();
                reject(error);
            }
        });
        signal?.addEventListener('abort', abort, { once: true });
    });
}
