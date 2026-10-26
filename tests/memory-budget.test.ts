/** @file Verify aggregate memory budgets before launching any lint engines. */
import { describe, expect, it } from 'vitest';

import {
    memoryBytes,
    MIB,
    parseMaxMemory,
    probeMemory,
    resolveMemoryBudget,
} from '../packages/oxlint-config/src/memory-budget';

import type { MemorySnapshot } from '../packages/oxlint-config/src/memory-budget';

const SNAPSHOT: MemorySnapshot = {
    totalBytes: 16384 * MIB,
    availableBytes: 10240 * MIB,
    parallelism: 8,
    constraints: [],
    warnings: [],
};

describe('aggregate lint memory policy', () => {
    it('uses eighty percent of available memory, not eighty percent per child', () => {
        expect(resolveMemoryBudget(SNAPSHOT)).toMatchObject({
            maxMiB: 8192,
            automaticMiB: 8192,
            availableMiB: 10240,
            hardLimitMiB: 16384,
            mode: 'automatic',
        });
    });

    it('honors tighter ancestor headroom and soft pressure boundaries', () => {
        const snapshot = {
            ...SNAPSHOT,
            constraints: [
                { source: 'leaf', limitBytes: 8192 * MIB, usedBytes: 1024 * MIB },
                { source: 'parent', limitBytes: 4096 * MIB, usedBytes: 2048 * MIB },
                {
                    source: 'memory.high',
                    limitBytes: 3072 * MIB,
                    usedBytes: 2048 * MIB,
                    soft: true,
                },
            ],
        };
        expect(resolveMemoryBudget(snapshot)).toMatchObject({ maxMiB: 819, hardLimitMiB: 4096 });
        expect(resolveMemoryBudget(snapshot, 3072)).toMatchObject({ maxMiB: 3072, mode: 'explicit' });
        expect(() => resolveMemoryBudget(snapshot, 4097)).toThrow('hard limit');
    });

    it('allows explicit lower or higher budgets without changing the source snapshot', () => {
        const result = resolveMemoryBudget(SNAPSHOT, 12288);
        expect(result.maxMiB).toBe(12288);
        expect(resolveMemoryBudget(SNAPSHOT, 512).maxMiB).toBe(512);
        result.snapshot.warnings.push('changed');
        expect(SNAPSHOT.warnings).toEqual([]);
    });

    it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '1GiB', '', '01', '9007199254740992'])(
        'rejects invalid MiB operand %s',
        (value) => expect(() => parseMaxMemory(value)).toThrow('positive integer'),
    );

    it('does not treat unlimited or unsafe kernel values as available memory', () => {
        expect(memoryBytes('max')).toBeNull();
        expect(memoryBytes('18446744073709551615')).toBeNull();
        expect(memoryBytes('9223372036854771712')).toBeNull();
        expect(memoryBytes('-1')).toBeNull();
        expect(memoryBytes(' 1024\n')).toBe(1024);
        expect(memoryBytes('0')).toBe(0);
        expect(parseMaxMemory('8192')).toBe(8192);
    });

    it('fails explicitly when no safe budget can be assigned', () => {
        expect(() => resolveMemoryBudget({ ...SNAPSHOT, availableBytes: 0 })).toThrow('Insufficient');
        expect(() => resolveMemoryBudget(
            {
                ...SNAPSHOT,
                constraints: [{ source: 'zero hard cap', limitBytes: 0, usedBytes: 0 }],
            },
            1,
        )).toThrow('hard limit');
        expect(() => resolveMemoryBudget({ ...SNAPSHOT, totalBytes: Number.NaN })).toThrow('finite');
        expect(() => resolveMemoryBudget({ ...SNAPSHOT, availableBytes: -1 })).toThrow('finite');
    });
});

describe('observable memory limits', () => {
    const system = {
        platform: 'linux',
        totalBytes: 16384 * MIB,
        availableBytes: 8192 * MIB,
        parallelism: 16,
        constrainedBytes: 18446744073709552000,
    };

    it('keeps per-process virtual/data limits distinct from the aggregate RAM ceiling', () => {
        const limits = `Max address space         ${2048 * MIB} ${4096 * MIB} bytes\nMax data size             unlimited unlimited bytes\n`;
        const observed = probeMemory({
            system,
            read: (file) => (file === '/proc/self/limits' ? limits : undefined),
        });
        expect(observed.perProcessLimits).toEqual([{ source: 'rlimit:address space', limitBytes: 2048 * MIB }]);
        expect(resolveMemoryBudget(observed, 8192).hardLimitMiB).toBe(16384);
    });

    it('resolves v2 mount namespaces and tighter ancestor memory/CPU limits', () => {
        const files: Record<string, string> = {
            '/proc/meminfo': 'MemTotal: 16777216 kB\nMemAvailable: 12582912 kB\nSwapFree: 99999999 kB\n',
            '/proc/self/cgroup': '0::/parent/leaf\n',
            '/proc/self/mountinfo': '1 0 0:1 / /cg rw - cgroup2 cgroup rw\n',
            '/cg/memory.max': 'max',
            '/cg/parent/memory.max': String(4096 * MIB),
            '/cg/parent/memory.current': String(1024 * MIB),
            '/cg/parent/cpu.max': '250000 100000',
            '/cg/parent/leaf/memory.max': String(8192 * MIB),
            '/cg/parent/leaf/memory.current': String(512 * MIB),
        };
        const snapshot = probeMemory({ system, read: (file) => files[file] });
        expect(resolveMemoryBudget(snapshot)).toMatchObject({ maxMiB: 2457, hardLimitMiB: 4096 });
        expect(snapshot.parallelism).toBe(2);
        expect(snapshot.constraints).toHaveLength(2);
    });

    it('handles v1 limits, namespace roots, escaped paths and absent usage conservatively', () => {
        const files: Record<string, string> = {
            '/proc/self/cgroup': '4:memory:/\n',
            '/proc/self/mountinfo': '1 0 0:1 /outside /cg\\040memory rw - cgroup cgroup rw,memory\n',
            '/cg memory/memory.limit_in_bytes': String(2048 * MIB),
        };
        const snapshot = probeMemory({ system, read: (file) => files[file] });
        expect(snapshot.constraints).toEqual([{ source: '/cg memory', limitBytes: 2048 * MIB, usedBytes: 2048 * MIB }]);
        expect(() => resolveMemoryBudget(snapshot)).toThrow('Insufficient');
        expect(snapshot.warnings.some((message) => message.includes('Usage unavailable'))).toBe(true);
    });

    it('preserves soft limits separately and never escapes a mismatched cgroup mount', () => {
        const files: Record<string, string> = {
            '/proc/self/cgroup': '0::/tenant/child\n',
            '/proc/self/mountinfo': '1 0 0:1 /wrong /cg rw - cgroup2 cgroup rw\n',
        };
        expect(probeMemory({ system, read: (file) => files[file] }).warnings).toEqual(
            expect.arrayContaining([expect.stringContaining('outside the visible mount')]),
        );
        files['/proc/self/mountinfo'] = '1 0 0:1 /tenant /cg rw - cgroup2 cgroup rw\n';
        files['/cg/child/memory.max'] = String(4096 * MIB);
        files['/cg/child/memory.current'] = String(1024 * MIB);
        files['/cg/child/memory.high'] = String(2048 * MIB);
        expect(resolveMemoryBudget(probeMemory({ system, read: (file) => files[file] }))).toMatchObject({
            maxMiB: 819,
            hardLimitMiB: 4096,
        });
    });

    it('reports unavailable reads and supports non-Linux and provisioned host hints', () => {
        const snapshot = probeMemory({
            system,
            read: () => {
                throw new Error('denied');
            },
        });
        expect(snapshot.warnings.some((message) => message.includes('denied'))).toBe(true);
        const portable = probeMemory({
            system: { ...system, platform: 'win32' },
            hostLimitMiB: 4096,
            hostAvailableMiB: 2048,
        });
        expect(resolveMemoryBudget(portable)).toMatchObject({ maxMiB: 1638, hardLimitMiB: 4096 });
        const constrained = probeMemory({
            system: { ...system, constrainedBytes: 4096 * MIB },
        });
        expect(constrained.constraints).toEqual([
            expect.objectContaining({ source: 'node.constrainedMemory', limitBytes: 4096 * MIB }),
        ]);
        expect(() => probeMemory({ system, read: () => undefined, hostAvailableMiB: 2048 })).toThrow(
            'provisioned host limit',
        );
    });
});
