/** @file Compute one observable memory budget for a complete lint invocation. */
import { readFileSync } from 'node:fs';
import {
    availableParallelism,
    freemem,
    platform,
    totalmem,
} from 'node:os';
import { posix } from 'node:path';

export const MIB = 1024 * 1024;

export interface MemoryConstraint {
    source: string;
    limitBytes: number;
    usedBytes: number;
    soft?: boolean;
}

export interface MemorySnapshot {
    totalBytes: number;
    availableBytes: number;
    parallelism: number;
    constraints: MemoryConstraint[];
    warnings: string[];
    perProcessLimits?: { source: string; limitBytes: number }[];
}

export interface MemoryBudget {
    maxMiB: number;
    automaticMiB: number;
    availableMiB: number;
    hardLimitMiB: number;
    mode: 'automatic' | 'explicit';
    snapshot: MemorySnapshot;
}

export interface MemoryProbeOptions {
    read?: (filename: string) => string | undefined;
    system?: {
        platform: string;
        totalBytes: number;
        availableBytes: number;
        parallelism: number;
        constrainedBytes?: number;
    };
    hostLimitMiB?: number;
    hostAvailableMiB?: number;
}

/**
 * Decode kernel counters without interpreting unlimited sentinels as usable RAM.
 * @param text - A byte count or an unlimited marker.
 * @returns A safely representable byte count, or null for unknown/unlimited input.
 */
export function memoryBytes(text: string): number | null {
    if (!/^\d+$/u.test(text.trim())) {
        return null;
    }
    const value = BigInt(text.trim());
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

/**
 * Validate an explicit memory budget in whole MiB.
 * @param value - CLI operand without a unit suffix.
 * @returns A positive safely representable MiB count.
 */
export function parseMaxMemory(value: string): number {
    if (!/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value) * MIB)) {
        throw new TypeError('--max-mem requires a positive integer in MiB.');
    }
    return Number(value);
}

/**
 * Select the startup budget without multiplying it across child processes.
 * @param snapshot - Physical/guest availability and visible ancestor constraints.
 * @param requestedMiB - Optional explicit replacement for the automatic eighty-percent policy.
 * @returns An independent budget and its observable provenance.
 */
export function resolveMemoryBudget(snapshot: MemorySnapshot, requestedMiB?: number): MemoryBudget {
    const valid = (value: number) => Number.isSafeInteger(value) && value >= 0;
    if (
        !valid(snapshot.totalBytes)
        || snapshot.totalBytes === 0
        || !valid(snapshot.availableBytes)
        || snapshot.constraints.some(({ limitBytes, usedBytes }) => !valid(limitBytes) || !valid(usedBytes))
    ) {
        throw new TypeError('Memory observations must contain finite, nonnegative byte counts.');
    }
    if (requestedMiB !== undefined) {
        parseMaxMemory(String(requestedMiB));
    }
    const hardBytes = Math.min(
        snapshot.totalBytes,
        ...snapshot.constraints.filter((constraint) => !constraint.soft).map((constraint) => constraint.limitBytes),
    );
    const availableBytes = Math.max(
        0,
        Math.min(
            snapshot.availableBytes,
            hardBytes,
            ...snapshot.constraints.map(({ limitBytes, usedBytes }) => Math.max(0, limitBytes - usedBytes)),
        ),
    );
    const automaticMiB = Math.floor((availableBytes * 0.8) / MIB);
    const maxMiB = requestedMiB ?? automaticMiB;
    if (maxMiB < 1) {
        throw new RangeError('Insufficient available memory for linting.');
    }
    if (maxMiB > Math.floor(hardBytes / MIB)) {
        throw new RangeError(
            `--max-mem ${maxMiB} exceeds the observable hard limit of ${Math.floor(hardBytes / MIB)} MiB.`,
        );
    }
    return {
        maxMiB,
        automaticMiB,
        availableMiB: Math.floor(availableBytes / MIB),
        hardLimitMiB: Math.floor(hardBytes / MIB),
        mode: requestedMiB === undefined ? 'automatic' : 'explicit',
        snapshot: structuredClone(snapshot),
    };
}

/**
 * Observe guest memory and every readable cgroup ancestor without privileged host probing.
 * @param options - Injectable platform readings and optional provisioned host constraints.
 * @returns Effective observations and explicit visibility warnings.
 */
export function probeMemory(options: MemoryProbeOptions = {}): MemorySnapshot {
    const system = options.system ?? {
        platform: platform(),
        totalBytes: totalmem(),
        availableBytes: process.availableMemory?.() ?? freemem(),
        constrainedBytes: process.constrainedMemory?.(),
        parallelism: availableParallelism(),
    };
    const warnings = ['Physical-host limits outside the visible namespace are unknown unless provisioned.'];
    const read = (filename: string): string | undefined => {
        try {
            return options.read ? options.read(filename) : readFileSync(filename, 'utf8');
        } catch (error: unknown) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                warnings.push(`Cannot read ${filename}: ${(error as Error).message}`);
            }
            return undefined;
        }
    };
    const snapshot: MemorySnapshot = {
        totalBytes: system.totalBytes,
        availableBytes: system.availableBytes,
        parallelism: Math.max(1, system.parallelism),
        constraints: [],
        warnings,
    };
    if (system.platform === 'linux') {
        const processLimits = read('/proc/self/limits') ?? '';
        snapshot.perProcessLimits = [...processLimits.matchAll(
            /^Max (address space|data size)\s+(\S+)\s+(\S+)\s+bytes$/gmu,
        )].flatMap((match) => {
            const values = [memoryBytes(match[2]!), memoryBytes(match[3]!)].filter((value) => value !== null);
            return values.length ? [{ source: `rlimit:${match[1]}`, limitBytes: Math.min(...values) }] : [];
        });
        const info = read('/proc/meminfo') ?? '';
        const field = (name: string) => {
            const match = info.match(new RegExp(`^${name}:\\s+(\\d+)\\s+kB$`, 'mu'));
            return match ? memoryBytes(String(BigInt(match[1]!) * 1024n)) : null;
        };
        snapshot.totalBytes = field('MemTotal') ?? snapshot.totalBytes;
        snapshot.availableBytes = field('MemAvailable') ?? snapshot.availableBytes;
        const memberships = (read('/proc/self/cgroup') ?? '').split('\n').map((line) => {
            const [identifier, controllers, ...path] = line.split(':');
            return { identifier, controllers: controllers?.split(',') ?? [], path: path.join(':') };
        });
        const decode = (value: string) => value.replace(/\\([0-7]{3})/gu, (_match, digits: string) => String.fromCharCode(Number.parseInt(digits, 8)));
        for (const line of (read('/proc/self/mountinfo') ?? '').split('\n')) {
            const [left, right] = line.split(' - ');
            const fields = left?.split(' ') ?? [];
            const [kind, , superOptions = ''] = right?.split(' ') ?? [];
            if (kind !== 'cgroup' && kind !== 'cgroup2') {
                continue;
            }
            const membership = memberships.find((entry) => (kind === 'cgroup2'
                ? entry.identifier === '0'
                : entry.controllers.some(
                    (controller) => ['memory', 'cpu', 'cpuset'].includes(controller)
                              && superOptions.split(',').includes(controller),
                )));
            if (!membership?.path || !fields[3] || !fields[4]) {
                continue;
            }
            const root = decode(fields[3]);
            const mount = decode(fields[4]);
            const suffix = membership.path === '/' ? '' : posix.relative(root, membership.path);
            if (suffix.startsWith('..') || posix.isAbsolute(suffix)) {
                warnings.push(`Cgroup membership is outside the visible mount ${mount}.`);
                continue;
            }
            let directory = posix.join(mount, suffix);
            while (directory === mount || directory.startsWith(`${mount}/`)) {
                const rawLimit = read(
                    posix.join(directory, kind === 'cgroup2' ? 'memory.max' : 'memory.limit_in_bytes'),
                );
                const limit = rawLimit === undefined ? null : memoryBytes(rawLimit);
                const rawUsage = read(
                    posix.join(directory, kind === 'cgroup2' ? 'memory.current' : 'memory.usage_in_bytes'),
                );
                const usage = rawUsage === undefined ? null : memoryBytes(rawUsage);
                if (limit !== null) {
                    if (usage === null) {
                        warnings.push(`Usage unavailable for finite cgroup limit ${directory}; no headroom assumed.`);
                    }
                    snapshot.constraints.push({ source: directory, limitBytes: limit, usedBytes: usage ?? limit });
                }
                const high = read(posix.join(directory, 'memory.high'));
                const soft = high === undefined ? null : memoryBytes(high);
                if (kind === 'cgroup2' && soft !== null && usage !== null) {
                    snapshot.constraints.push({
                        source: `${directory}/memory.high`,
                        limitBytes: soft,
                        usedBytes: usage,
                        soft: true,
                    });
                }
                const quota = kind === 'cgroup2'
                    ? read(posix.join(directory, 'cpu.max'))?.trim().split(/\s+/u)
                    : [
                        read(posix.join(directory, 'cpu.cfs_quota_us')),
                        read(posix.join(directory, 'cpu.cfs_period_us')),
                    ];
                const quotaValue = Number(quota?.[0]);
                const periodValue = Number(quota?.[1]);
                if (quotaValue > 0 && periodValue > 0) {
                    snapshot.parallelism = Math.max(
                        1,
                        Math.min(snapshot.parallelism, Math.floor(quotaValue / periodValue)),
                    );
                }
                if (directory === mount) {
                    break;
                }
                directory = posix.dirname(directory);
            }
        }
    } else {
        warnings.push('Linux cgroup observations are unavailable; platform memory hints are used.');
    }
    const constrained = system.constrainedBytes;
    if (
        constrained !== undefined
        && Number.isSafeInteger(constrained)
        && constrained > 0
        && constrained < snapshot.totalBytes
    ) {
        snapshot.constraints.push({
            source: 'node.constrainedMemory',
            limitBytes: constrained,
            usedBytes: Math.max(0, constrained - system.availableBytes),
        });
    }
    if (options.hostLimitMiB !== undefined) {
        parseMaxMemory(String(options.hostLimitMiB));
        const limit = options.hostLimitMiB * MIB;
        const availableMiB = options.hostAvailableMiB;
        const available = availableMiB === undefined ? 0 : parseMaxMemory(String(availableMiB)) * MIB;
        snapshot.constraints.push({
            source: 'provisioned-host',
            limitBytes: limit,
            usedBytes: Math.max(0, limit - available),
        });
    } else if (options.hostAvailableMiB !== undefined) {
        throw new TypeError('Host availability requires a provisioned host limit.');
    }
    return snapshot;
}
