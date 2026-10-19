/**
 * @file Resolve TypeScript modules, aliases, and package exports with Oxc from the compiler configurations
 * that eslint-import-resolver-typescript reads, without following project references unless requested.
 */
import { statSync } from 'node:fs';
import path from 'node:path';

import { ResolverFactory } from 'oxc-resolver';

type TsconfigOption = 'auto' | { configFile: string; references?: 'auto' };

export interface TypescriptResolverOptions {
    project?: string | readonly string[];
    alwaysTryTypes?: boolean;
    conditionNames?: readonly string[];
    mainFields?: readonly string[];
    extensions?: readonly string[];
    tsconfig?: TsconfigOption;
}

interface NormalizedOptions {
    project: string[] | null;
    alwaysTryTypes: boolean;
    conditionNames: string[];
    extensions: string[];
    mainFields: string[];
    tsconfig: TsconfigOption | null;
}

interface ResolverConfig {
    config: NormalizedOptions;
    cacheKey: string;
    resolversFor: (filename: string) => readonly ResolverFactory[];
}

// The pinned resolver expands these entries with a glob library; they are not expanded here.
const GLOB_PATTERN = /[*?[\]{}!]/u;

const factories = new Map<string, ResolverFactory>();
const configs = new Map<string, ResolverConfig>();
const nearest = new Map<string, string | null>();

/**
 * Check whether a path names an existing regular file.
 * @param file - Absolute candidate path.
 * @returns Whether the file exists.
 */
function isFile(file: string): boolean {
    return statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}

/**
 * Find the nearest `tsconfig.json` at or above a directory without following project references.
 * @param directory - Absolute directory, possibly missing, where the search begins.
 * @returns Absolute configuration filename, or null when no ancestor has one.
 */
function findTsconfig(directory: string): string | null {
    let found = nearest.get(directory);
    if (found === undefined) {
        const candidate = path.join(directory, 'tsconfig.json');
        const parent = path.dirname(directory);
        if (isFile(candidate)) {
            found = candidate;
        } else {
            found = parent === directory ? null : findTsconfig(parent);
        }
        nearest.set(directory, found);
    }
    return found;
}

/**
 * Normalize resolver options into a stable representation.
 * @param options - Consumer resolver settings.
 * @returns Defaults applied and project paths made absolute against the working directory.
 */
function normalize(options: TypescriptResolverOptions): NormalizedOptions {
    let project: string[] | null = null;
    if (options.project !== undefined) {
        project = (Array.isArray(options.project) ? [...options.project] : [options.project])
            .map((entry: string) => (GLOB_PATTERN.test(entry) ? entry : path.resolve(entry)));
    }
    return {
        project,
        alwaysTryTypes: options.alwaysTryTypes ?? true,
        conditionNames: [...(options.conditionNames ?? ['types', 'import', 'node', 'default'])],
        extensions: [...(options.extensions ?? ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'])],
        mainFields: [...(options.mainFields ?? ['types', 'typings', 'module', 'main'])],
        tsconfig: options.tsconfig ?? null,
    };
}

/**
 * Create or reuse an Oxc resolver for one compiler configuration.
 * @param config - Normalized resolution settings.
 * @param tsconfig - Configuration whose paths apply, or undefined for none.
 * @returns Cached Oxc resolver.
 */
function factory(config: NormalizedOptions, tsconfig: TsconfigOption | undefined): ResolverFactory {
    const key = JSON.stringify([config.conditionNames, config.extensions, config.mainFields, tsconfig ?? null]);
    let resolver = factories.get(key);
    if (!resolver) {
        resolver = new ResolverFactory({
            ...(tsconfig === undefined ? {} : { tsconfig }),
            builtinModules: true,
            extensions: config.extensions,
            extensionAlias: {
                '.js': ['.ts', '.tsx', '.js'],
                '.mjs': ['.mts', '.mjs'],
                '.cjs': ['.cts', '.cjs'],
            },
            conditionNames: config.conditionNames,
            mainFields: config.mainFields,
        });
        factories.set(key, resolver);
    }
    return resolver;
}

/**
 * Select the resolvers that reproduce the project lookup of eslint-import-resolver-typescript.
 * @param config - Normalized resolution settings.
 * @returns Lookup of the resolvers to try, in order, for an importing file.
 */
function selectResolvers(config: NormalizedOptions): ResolverConfig['resolversFor'] {
    if (config.tsconfig !== null) {
        const explicit = [factory(config, config.tsconfig)];
        return () => explicit;
    }
    if (config.project === null) {
        // Without a project the pinned resolver reads the tsconfig.json nearest the working directory.
        const byConfig = new Map<string | null, readonly ResolverFactory[]>();
        return () => {
            const configFile = findTsconfig(process.cwd());
            let resolvers = byConfig.get(configFile);
            if (!resolvers) {
                resolvers = [factory(config, configFile === null ? undefined : { configFile })];
                byConfig.set(configFile, resolvers);
            }
            return resolvers;
        };
    }
    // A named file is read as is; any other entry uses the nearest tsconfig.json at or above it.
    const files = config.project
        .filter((entry) => !GLOB_PATTERN.test(entry))
        .map((entry) => (isFile(entry) ? entry : findTsconfig(entry)))
        .filter((file): file is string => file !== null);
    const resolvers = files.length === 0
        ? [factory(config, undefined)]
        : Array.from(new Set(files), (configFile) => factory(config, { configFile }));
    return () => resolvers;
}

/**
 * Create or reuse the resolvers for explicit project and condition settings.
 * @param options - Project paths, conditions, extensions, and type fallback.
 * @returns Normalized configuration plus its cached resolver lookup.
 */
export function createTypescriptResolver(options: TypescriptResolverOptions = {}): ResolverConfig {
    const config = normalize(options);
    const cacheKey = JSON.stringify(config);
    let active = configs.get(cacheKey);
    if (!active) {
        active = { config, cacheKey, resolversFor: selectResolvers(config) };
        configs.set(cacheKey, active);
    }
    return active;
}

/**
 * Inspect resolver reuse during tests without exposing mutable state.
 * @returns Number of cached resolver configurations.
 */
export function typescriptResolverCacheSize(): number {
    return configs.size;
}

const fallback = createTypescriptResolver();

const typescriptResolver = {
    interfaceVersion: 2 as const,
    /**
     * Resolve a specifier relative to the importing source file.
     * @param specifier - Imported package or relative module name.
     * @param filename - Absolute filename of the importing module.
     * @param options - Optional explicit resolver configuration; `true` and null select the defaults.
     * @returns Resolution status and filename, or null for a builtin.
     */
    resolve(
        specifier: string,
        filename: string,
        options?: TypescriptResolverOptions | boolean | null,
    ): { found: false } | { found: true; path: string | null } {
        const active = options !== null && typeof options === 'object' ? createTypescriptResolver(options) : fallback;
        let resolved: { found: false } | { found: true; path: string | null } = { found: false };
        active.resolversFor(filename).some((resolver) => {
            const result = resolver.resolveFileSync(filename, specifier);
            if (result.builtin) {
                resolved = { found: true, path: null };
            } else if (result.path) {
                resolved = { found: true, path: result.path };
            }
            return resolved.found;
        });
        return resolved;
    },
};

export default typescriptResolver;
