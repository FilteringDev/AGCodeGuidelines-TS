/** @file Capture inherited Airbnb configuration data without loading an ESLint engine. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

import sources from '../docs/reference/sources.json' with { type: 'json' };

interface Config {
    extends?: string[];
    rules?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    env?: Record<string, boolean>;
}
const require = createRequire(import.meta.url);
const cache = new Map<string, Config>();

/**
 * Evaluate only configuration modules and their ordinary metadata dependencies.
 * @param file - Absolute configuration module filename.
 * @returns Configuration data exported by the module.
 */
function load(file: string): Config {
    const cached = cache.get(file);
    if (cached) {
        return cached;
    }
    const loader = createRequire(file);
    const scoped = (specifier: string): unknown => {
        if (specifier === 'eslint/package.json') {
            return { version: sources.sources.core.version };
        }
        if (/^eslint(?:\/|$)/u.test(specifier)) {
            throw new Error(`Configuration attempted to load an ESLint engine: ${specifier}`);
        }
        const resolved = loader.resolve(specifier);
        return resolved.includes('eslint-config-airbnb') ? load(resolved) : loader(specifier);
    };
    Object.assign(scoped, { resolve: loader.resolve });
    const module = { exports: {} as Config };
    runInNewContext(
        readFileSync(file, 'utf8'),
        { module, exports: module.exports, require: scoped },
        { timeout: 1000 },
    );
    cache.set(file, module.exports);
    return module.exports;
}

const snapshot = {
    rules: {} as Record<string, unknown>,
    settings: {} as Record<string, unknown>,
    env: {} as Record<string, boolean>,
    origins: {} as Record<string, string>,
};

/**
 * Merge ancestors before children and retain a portable origin for each rule.
 * @param file - Absolute configuration module filename.
 */
function inherit(file: string): void {
    const config = load(file);
    for (const parent of config.extends ?? []) {
        inherit(createRequire(file).resolve(parent));
    }
    Object.assign(snapshot.settings, config.settings);
    Object.assign(snapshot.env, config.env);
    for (const [name, setting] of Object.entries(config.rules ?? {})) {
        const previous = snapshot.rules[name];
        snapshot.rules[name] = Array.isArray(previous) && (!Array.isArray(setting) || setting.length === 1)
            ? [Array.isArray(setting) ? setting[0] : setting, ...previous.slice(1)]
            : setting;
        snapshot.origins[name] = file.replaceAll('\\', '/').split('/node_modules/').at(-1)!;
    }
}

inherit(require.resolve('eslint-config-airbnb'));
const text = `${JSON.stringify(snapshot, null, 2)}\n`;
if (process.argv.includes('--check')) {
    if (readFileSync('docs/reference/airbnb.json', 'utf8') !== text) {
        throw new Error('The inherited Airbnb snapshot is stale. Run pnpm run snapshots:airbnb.');
    }
} else {
    writeFileSync('docs/reference/airbnb.json', text);
}
