import { createRequire } from 'node:module';
/**
 * @file Load an external dependency parser through its CommonJS entrypoint.
 */

const requireExternal = createRequire(import.meta.url);

/**
 * Load the configured external module; callers establish the parser contract.
 * @param specifier The configured module path.
 * @returns The module's CommonJS export.
 */
export default function moduleRequire(specifier: string): unknown {
    return requireExternal(specifier) as unknown;
}
