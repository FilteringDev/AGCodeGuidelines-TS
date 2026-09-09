/** @file Reproduce the typed sample while retaining its exact upstream configuration data. */
import { isDeepStrictEqual } from 'node:util';
import { runInNewContext } from 'node:vm';

import patches from './reference-patches.json' with { type: 'json' };
import { patchSource } from './ports';

export interface ReferenceConfig {
    extends?: readonly string[];
    rules?: Record<string, string | number | readonly unknown[]>;
    settings?: Record<string, unknown>;
    env?: Record<string, boolean>;
}

/**
 * Reproduce the ESM configuration from its reviewed upstream text.
 * @param source - Exact upstream sample bytes.
 * @returns Typed ESM source with the reviewed formatting and annotations.
 */
export function portReference(source: string): string {
    return patchSource(source, patches, 'docs/reference/eslintrc.ts');
}

/**
 * Check the port against the upstream configuration without loading a lint engine.
 * @param source - Frozen upstream CommonJS configuration data.
 * @param config - Configuration exported by the typed port.
 */
export function verifyReference(source: string, config: ReferenceConfig): void {
    // This bridge evaluates the frozen external sample, never repository modules.
    const capture: { exports: unknown } = { exports: {} };
    runInNewContext(source, { module: capture }, { timeout: 1000 });
    const upstream: unknown = JSON.parse(JSON.stringify(capture.exports));
    if (!isDeepStrictEqual(upstream, config)) {
        throw new Error('The typed reference configuration differs from the frozen upstream sample.');
    }
}
