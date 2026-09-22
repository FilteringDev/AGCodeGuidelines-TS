/** @file Resolve TypeScript modules, aliases, package exports, and project references with Oxc. */
import { ResolverFactory } from 'oxc-resolver';

export interface TypescriptResolverOptions {
    project?: string | readonly string[];
    alwaysTryTypes?: boolean;
    conditionNames?: readonly string[];
    mainFields?: readonly string[];
    extensions?: readonly string[];
    tsconfig?: 'auto' | { configFile: string; references?: 'auto' };
}

interface ResolverConfig {
    config: unknown;
    cacheKey: string;
    resolver: ResolverFactory;
}

const cache = new Map<string, ResolverFactory>();

/**
 * Normalize resolver options into a stable cache key.
 * @param options - Consumer resolver settings.
 * @returns Stable representation used for resolver reuse.
 */
function normalize(options: TypescriptResolverOptions = {}): { config: ResolverConfig['config']; cacheKey: string } {
    let project = ['auto'];
    if (options.project !== undefined) {
        project = Array.isArray(options.project) ? [...options.project] : [options.project];
    }
    const value = {
        project,
        alwaysTryTypes: options.alwaysTryTypes ?? true,
        conditionNames: [...(options.conditionNames ?? ['types', 'import', 'node', 'default'])],
        extensions: [...(options.extensions ?? ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'])],
        mainFields: [...(options.mainFields ?? ['types', 'typings', 'module', 'main'])],
        tsconfig: options.tsconfig ?? 'auto',
    };
    return { config: value, cacheKey: JSON.stringify(value) };
}

/**
 * Create or reuse a resolver for explicit project and condition settings.
 * @param options - Project paths, conditions, extensions, and type fallback.
 * @returns Cached Oxc resolver plus its normalized configuration.
 */
export function createTypescriptResolver(options: TypescriptResolverOptions = {}): ResolverConfig {
    const { config, cacheKey } = normalize(options);
    let resolver = cache.get(cacheKey);
    if (!resolver) {
        const settings = config as {
            conditionNames: string[];
            extensions: string[];
            mainFields: string[];
            tsconfig: 'auto' | { configFile: string; references?: 'auto' };
        };
        resolver = new ResolverFactory({
            tsconfig: settings.tsconfig,
            builtinModules: true,
            extensions: settings.extensions,
            extensionAlias: {
                '.js': ['.ts', '.tsx', '.js'],
                '.mjs': ['.mts', '.mjs'],
                '.cjs': ['.cts', '.cjs'],
            },
            conditionNames: settings.conditionNames,
            mainFields: settings.mainFields,
        });
        cache.set(cacheKey, resolver);
    }
    return { config, cacheKey, resolver };
}

/**
 * Inspect resolver reuse during tests without exposing mutable state.
 * @returns Number of cached resolver instances.
 */
export function typescriptResolverCacheSize(): number {
    return cache.size;
}

const fallback = createTypescriptResolver();

const typescriptResolver = {
    interfaceVersion: 2 as const,
    /**
     * Resolve a specifier relative to the importing source file.
     * @param specifier - Imported package or relative module name.
     * @param filename - Absolute filename of the importing module.
     * @param options - Optional explicit resolver configuration.
     * @returns Resolution status and filename, or null for a builtin.
     */
    resolve(
        specifier: string,
        filename: string,
        options?: TypescriptResolverOptions,
    ): { found: false } | { found: true; path: string | null } {
        const active = options === undefined ? fallback : createTypescriptResolver(options);
        const result = active.resolver.resolveFileSync(filename, specifier);
        if (result.builtin) {
            return { found: true, path: null };
        }
        return result.path ? { found: true, path: result.path } : { found: false };
    },
};

export default typescriptResolver;
