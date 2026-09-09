import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import nodeResolver from 'eslint-import-resolver-node';
import enumerableKeys from './enumerableKeys';
import type {
    ResolvedResult,
    ResolverConfig,
    CacheSettings,
    ImportSettings,
    Resolver,
    RuleContext,
} from '../types';
import { getPhysicalFilename } from './contextCompat';
import { hashObject } from './hash';
import ModuleCache from './ModuleCache';
import pkgDir from './pkgDir';
import typescriptResolver from '../compat/import-resolver';

const requireExternal = createRequire(import.meta.url);

const CASE_SENSITIVE_FS = !fs.existsSync(fileURLToPath(import.meta.url).toUpperCase());
export { CASE_SENSITIVE_FS };

const ERROR_NAME = 'EslintPluginImportResolveError';

const fileExistsCache = new ModuleCache<boolean | string | null>();

/**
 * Is resolver valid.
 * @param resolver The resolver value.
 * @returns The result of this check.
 */
function isResolverValid(resolver: unknown): resolver is Resolver {
    if (resolver === null || (typeof resolver !== 'object' && typeof resolver !== 'function')) {
        return false;
    }
    if ('interfaceVersion' in resolver && resolver.interfaceVersion === 2) {
        return 'resolve' in resolver && !!resolver.resolve && typeof resolver.resolve === 'function';
    }
    return (
        'resolveImport' in resolver
        && !!resolver.resolveImport
        && typeof resolver.resolveImport === 'function'
    );
}

/**
 * Try require.
 * @param target The target value.
 * @param [sourceFile] The source file value.
 * @returns The result of this check.
 */
function tryRequire(target: string, sourceFile?: string | null): unknown {
    let resolved;
    try {
        // Check if the target exists
        if (sourceFile != null) {
            try {
                resolved = createRequire(path.resolve(sourceFile)).resolve(target);
            } catch (e) {
                resolved = requireExternal.resolve(target);
            }
        } else {
            resolved = requireExternal.resolve(target);
        }
    } catch (e) {
        // If the target does not exist then just return undefined
        return undefined;
    }

    // If the target exists then return the loaded module
    return requireExternal(resolved) as unknown;
}

/**
 * Resolver reducer.
 * @param resolvers The resolvers value.
 * @param map The map value.
 * @returns The result of this check.
 */
function resolverReducer(resolvers: ResolverConfig, map: Map<string, unknown>) {
    if (Array.isArray(resolvers)) {
        resolvers.forEach((r) => resolverReducer(r, map));
        return map;
    }

    if (typeof resolvers === 'string') {
        map.set(resolvers, null);
        return map;
    }

    if (typeof resolvers === 'object') {
        enumerableKeys(resolvers).forEach((key) => {
            map.set(key, resolvers[key]);
        });
        return map;
    }

    const err = new Error('invalid resolver config');
    err.name = ERROR_NAME;
    throw err;
}

/**
 * Get base dir.
 * @param sourceFile The source file value.
 * @returns The result of this check.
 */
function getBaseDir(sourceFile: string) {
    return pkgDir(sourceFile) || process.cwd();
}

/**
 * Require resolver.
 * @param name The name to inspect.
 * @param sourceFile The source file value.
 * @returns The result of this check.
 */
function requireResolver(name: string, sourceFile: string): Resolver {
    if (name === 'node') {
        return nodeResolver;
    }
    if (name === 'typescript') {
        return typescriptResolver;
    }
    // Try to resolve package with conventional name
    const resolver = tryRequire(`eslint-import-resolver-${name}`, sourceFile)
        || tryRequire(name, sourceFile)
        || tryRequire(path.resolve(getBaseDir(sourceFile), name));

    if (!resolver) {
        const err = new Error(`unable to load resolver "${name}".`);
        err.name = ERROR_NAME;
        throw err;
    }
    if (!isResolverValid(resolver)) {
        const err = new Error(`${name} with invalid interface loaded as resolver`);
        err.name = ERROR_NAME;
        throw err;
    }

    return resolver;
}

// https://stackoverflow.com/a/27382838

export const fileExistsWithCaseSync = function fileExistsWithCaseSync(
    filepath: string | null,
    cacheSettings: CacheSettings,
    strict?: boolean,
): boolean {
    // don't care if the FS is case-sensitive
    if (CASE_SENSITIVE_FS) {
        return true;
    }

    // null means it resolved to a builtin
    if (filepath === null) {
        return true;
    }
    if (filepath.toLowerCase() === process.cwd().toLowerCase() && !strict) {
        return true;
    }
    const parsedPath = path.parse(filepath);
    const { dir } = parsedPath;

    let result = fileExistsCache.get(filepath, cacheSettings) as boolean | undefined;
    if (result != null) {
        return result;
    }

    // base case
    if (dir === '' || parsedPath.root === filepath) {
        result = true;
    } else {
        const filenames = fs.readdirSync(dir);
        if (filenames.indexOf(parsedPath.base) === -1) {
            result = false;
        } else {
            result = fileExistsWithCaseSync(dir, cacheSettings, strict);
        }
    }
    fileExistsCache.set(filepath, result);
    return result;
};

let prevSettings: ImportSettings | null = null;
let memoizedHash = '';

/**
 * Full resolve.
 * @param modulePath The module path value.
 * @param sourceFile The source file value.
 * @param settings The settings value.
 * @returns The result of this check.
 */
function fullResolve(modulePath: string, sourceFile: string, settings: ImportSettings): ResolvedResult {
    // check if this is a bonus core module
    const coreSet = new Set(settings['import/core-modules']);
    if (coreSet.has(modulePath)) {
        return { found: true, path: null };
    }

    const sourceDir = path.dirname(sourceFile);

    if (prevSettings !== settings) {
        memoizedHash = hashObject(settings).digest('hex');
        prevSettings = settings;
    }

    const cacheKey = sourceDir + memoizedHash + modulePath;

    const cacheSettings = ModuleCache.getSettings(settings);

    const cachedPath = fileExistsCache.get(cacheKey, cacheSettings) as string | null | undefined;
    if (cachedPath !== undefined) {
        return { found: true, path: cachedPath };
    }

    /**
     * Cache.
     * @param resolvedPath The resolved path value.
     */
    function cache(resolvedPath: string | null) {
        fileExistsCache.set(cacheKey, resolvedPath);
    }

    /**
     * With resolver.
     * @param resolver The resolver value.
     * @param config The configured rule options.
     * @returns The result of this check.
     */
    function withResolver(resolver: Resolver, config: unknown): ResolvedResult {
        if (resolver.interfaceVersion === 2) {
            return resolver.resolve(modulePath, sourceFile, config);
        }

        try {
            const resolved = resolver.resolveImport(modulePath, sourceFile, config);
            if (resolved === undefined) {
                return { found: false };
            }
            return { found: true, path: resolved };
        } catch (err) {
            return { found: false };
        }
    }

    const configResolvers = settings['import/resolver'] || { node: settings['import/resolve'] };
    // backward compatibility

    const resolvers = resolverReducer(configResolvers, new Map());

    const entryIterator0 = resolvers[Symbol.iterator]();
    for (
        let entryStep1 = entryIterator0.next();
        !entryStep1.done;
        entryStep1 = entryIterator0.next()
    ) {
        const pair = entryStep1.value;
        const name = pair[0];
        const config = pair[1];
        const resolver = requireResolver(name, sourceFile);
        const resolved = withResolver(resolver, config);

        if (resolved.found) {
            // else, counts
            cache(resolved.path);
            return resolved;
        }
    }

    // failed
    // cache(undefined)
    return { found: false };
}

/**
 * Relative.
 * @param modulePath The module path value.
 * @param sourceFile The source file value.
 * @param settings The settings value.
 * @returns The result of this check.
 */
function relative(modulePath: string, sourceFile: string, settings: ImportSettings) {
    return fullResolve(modulePath, sourceFile, settings).path;
}
export { relative };

const erroredContexts = new Set();

/**
 * Given
 * @param p - module path
 * @param context - ESLint context
 * @returns - the full module filesystem path; null if package is core; undefined if not found
 */
function resolve(p: string, context: RuleContext) {
    try {
        return relative(p, getPhysicalFilename(context), context.settings);
    } catch (err) {
        const resolveError = err as { name?: string; message?: string; stack?: string };
        if (!erroredContexts.has(context)) {
            // The `err.stack` string starts with `err.name` followed by colon and `resolveError.message`.
            // We're filtering out the default `err.name` because it adds little value to the message.

            let errMessage = resolveError.message;

            if (resolveError.name !== ERROR_NAME && resolveError.stack) {
                errMessage = resolveError.stack.replace(/^Error: /, '');
            }
            context.report({
                message: `Resolve error: ${errMessage}`,
                loc: { line: 1, column: 0 },
            });
            erroredContexts.add(context);
        }
    }

    return undefined;
}
resolve.relative = relative;
export default resolve;
