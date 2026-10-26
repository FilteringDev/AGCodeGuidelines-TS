/** @file Resolve the repository-owned scratch directory under the system temp area. */
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Resolve the base directory for repository-owned scratch data.
 * @param parts - Path segments below the scratch root.
 * @returns Absolute scratch path honoring AG_CACHE_ROOT, defaulting under /tmp.
 */
export default function cacheRoot(...parts: string[]): string {
    const base = process.env.AG_CACHE_ROOT ?? join(tmpdir(), 'agcodeguidelines-cache');
    return resolve(base, ...parts);
}
