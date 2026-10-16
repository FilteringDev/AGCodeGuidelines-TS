/** @file Persist per-file Oxlint diagnostics keyed like ESLint's content cache. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { ShardDiagnostic } from './lint-shard.js';

export interface CacheEntry {
    hash: string;
    diagnostics: ShardDiagnostic[];
}

export interface LintCache {
    key: string;
    rules: number;
    files: Record<string, CacheEntry>;
}

/**
 * Hash a value with SHA-256.
 * @param value - Text or bytes.
 * @returns Hexadecimal digest.
 */
export function digest(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

/**
 * Read a cache written for the same configuration and tools.
 * @param path - Cache file.
 * @param key - Digest of the resolved configuration, report-independent options and tool versions.
 * @returns Entries, or an empty cache when absent, unreadable or for another key.
 */
export function readLintCache(path: string, key: string): LintCache {
    try {
        const cache = JSON.parse(readFileSync(path, 'utf8')) as LintCache;
        if (cache.key === key && cache.files && typeof cache.files === 'object') {
            return cache;
        }
    } catch {
        // A missing or corrupt cache only costs a full run.
    }
    return { key, rules: 0, files: {} };
}

/**
 * Replace the cache with the current file set.
 * @param path - Cache file.
 * @param cache - Entries for every discovered file.
 */
export function writeLintCache(path: string, cache: LintCache): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cache));
}
