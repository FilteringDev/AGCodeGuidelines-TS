/**
 * @file Translate a consumer's effective ESLint configurations into one scoped Oxlint configuration.
 *
 * Usage: pnpm exec tsx scripts/consumer-translate.ts <consumer> <spec.json> <output.json> [--ext .js,.ts] [targets...]
 * The consumer's own ESLint runs in a child process from its directory to record each file's effective
 * configuration. The spec lists ordered glob scopes (broad to narrow, the last match wins, as in Oxlint
 * overrides); every scope must select files of exactly one effective configuration. Each scope becomes one
 * override holding a complete rule map, so overlapping overrides cannot leak rules between scopes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import minimatch from 'minimatch';
import type { OxlintConfig } from 'oxlint';
import { createCompatibilityConfigGroups, finalizeProviders } from '../packages/oxlint-config/src/index';
import { collectEslint, languageOf, typescriptEslintMajor } from './consumer-eslint';

import type { EslintFile } from './consumer-eslint';

type Override = NonNullable<OxlintConfig['overrides']>[number];
type Language = 'javascript' | 'typescript';

/** One ordered file scope; it becomes one Oxlint override. */
export interface TranslationScope {
    files: string[];
    excludeFiles?: string[];
}

/** Consumer-specific translation input. */
export interface TranslationSpec {
    scopes: TranslationScope[];
    /** Patterns Oxlint ignores; matching source files need no scope and are left out of the translation. */
    ignorePatterns?: string[];
    typeAware?: boolean;
    acceptNativeDifferences?: boolean;
    /** Root settings merged over the translated ones, such as `agTypeScriptEslint`. */
    settings?: Record<string, unknown>;
}

/** One linted file with its effective source configuration. */
export interface SourceFile {
    /** Path relative to the configuration directory, with `/` separators. */
    path: string;
    language: Language;
    config: EslintFile['config'];
}

/** Rules retained by their source owner, grouped by source rule. */
export type FallbackSummary = Record<string, { disposition: string; reason: string; scopes: number[] }>;

export interface TranslationResult {
    config: OxlintConfig;
    scopes: { files: string[]; count: number; language: Language }[];
    fallback: FallbackSummary;
}

const MATCH_OPTIONS = { dot: true };

/**
 * Check whether an override-style scope applies to a file.
 * @param path - File path relative to the configuration directory.
 * @param files - Patterns selecting files.
 * @param excludeFiles - Patterns removing files from the selection.
 * @returns Whether the scope applies.
 */
export function inScope(path: string, files: readonly string[], excludeFiles: readonly string[] = []): boolean {
    return files.some((pattern) => minimatch(path, pattern, MATCH_OPTIONS))
        && !excludeFiles.some((pattern) => minimatch(path, pattern, MATCH_OPTIONS));
}

/**
 * Check whether an ignore pattern excludes a file, following the gitignore rules Oxlint applies.
 * A pattern without an inner slash matches at any depth, and a pattern matching a directory excludes its contents.
 * @param path - File path relative to the configuration directory.
 * @param patterns - Ignore patterns.
 * @returns Whether the file is ignored.
 */
export function isIgnored(path: string, patterns: readonly string[]): boolean {
    const segments = path.split('/');
    return patterns.some((raw) => {
        const directoryOnly = raw.endsWith('/');
        const anchored = raw.replace(/\/$/u, '').includes('/');
        const pattern = raw.replace(/^\/|\/$/gu, '');
        const options = { ...MATCH_OPTIONS, matchBase: !anchored };
        return segments.some((_, index) => (!directoryOnly || index < segments.length - 1)
            && minimatch(segments.slice(0, index + 1).join('/'), pattern, options));
    });
}

/**
 * Find the last scope applying to a file, mirroring Oxlint's later-override precedence.
 * @param path - File path relative to the configuration directory.
 * @param scopes - Ordered scopes.
 * @returns The index of the effective scope, or -1.
 */
export function lastScope(path: string, scopes: readonly TranslationScope[]): number {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
        if (inScope(path, scopes[index]!.files, scopes[index]!.excludeFiles)) {
            return index;
        }
    }
    return -1;
}

/**
 * Assign each scope the single effective configuration of the files it owns.
 * @param files - Linted files and their configuration keys.
 * @param scopes - Ordered scopes.
 * @returns The configuration key of each scope.
 * @throws When a file has no scope, a scope owns no file, or a scope owns files of several configurations.
 */
export function assignScopes(
    files: readonly { path: string; key: string }[],
    scopes: readonly TranslationScope[],
): string[] {
    const owned = scopes.map(() => new Map<string, string>());
    const errors: string[] = [];
    for (const file of files) {
        const index = lastScope(file.path, scopes);
        if (index === -1) {
            errors.push(`${file.path} matches no scope.`);
        } else if (!owned[index]!.has(file.key)) {
            owned[index]!.set(file.key, file.path);
        }
    }
    const keys = owned.map((groups, index) => {
        if (groups.size !== 1) {
            const examples = [...groups.values()].join(', ');
            errors.push(groups.size
                ? `Scope ${index} (${scopes[index]!.files.join(', ')}) mixes ${groups.size} configurations: ${examples}.`
                : `Scope ${index} (${scopes[index]!.files.join(', ')}) owns no linted file.`);
        }
        return [...groups.keys()][0] ?? '';
    });
    if (errors.length) {
        throw new Error(`Invalid translation scopes:\n${errors.slice(0, 40).join('\n')}`);
    }
    return keys;
}

/**
 * Give every override an explicit setting for every rule any override sets.
 * @param overrides - Overrides whose rule maps may differ in their keys.
 * @returns Overrides with complete rule maps; missing rules are off.
 */
export function completeOverrides(overrides: readonly Override[]): Override[] {
    const targets = new Set(overrides.flatMap((override) => Object.keys(override.rules ?? {})));
    return overrides.map((override) => ({
        ...override,
        rules: Object.fromEntries([...targets].sort().map((target) => [target, override.rules?.[target] ?? 'off'])),
    }));
}

/**
 * Require an identical root value from every independent group configuration.
 * @param configs - Group configurations.
 * @param key - Root key that Oxlint accepts only at the root.
 * @returns The shared value.
 * @throws When groups disagree; such groups need separate configuration files.
 */
function sharedRoot<K extends keyof OxlintConfig>(configs: readonly OxlintConfig[], key: K): OxlintConfig[K] {
    const values = new Set(configs.map((config) => JSON.stringify(config[key] ?? null)));
    if (values.size > 1) {
        throw new Error(`Root ${key} differs between scopes and cannot be expressed in one configuration: `
            + `${[...values].join(' | ')}`);
    }
    return structuredClone(configs[0]![key]);
}

/**
 * Translate linted files and their effective configurations into one scoped configuration.
 * @param files - Files linted by the source configuration.
 * @param spec - Ordered scopes and translation options.
 * @returns The configuration, scope assignment and source-owned rules.
 */
export function translateConsumer(files: readonly SourceFile[], spec: TranslationSpec): TranslationResult {
    const keyed = files.filter((file) => !isIgnored(file.path, spec.ignorePatterns ?? []))
        .map((file) => ({ ...file, key: JSON.stringify([file.language, file.config]) }));
    const keys = assignScopes(keyed, spec.scopes);
    const results = spec.scopes.map((scope, index) => {
        const source = keyed.find((file) => file.key === keys[index])!;
        const [result] = createCompatibilityConfigGroups([{
            id: `scope-${index}`,
            language: source.language,
            typeAware: spec.typeAware ?? false,
            acceptNativeDifferences: spec.acceptNativeDifferences ?? false,
            rules: source.config.rules,
            context: {
                files: scope.files,
                excludedFiles: scope.excludeFiles ?? [],
                env: source.config.env,
                globals: source.config.globals,
                settings: source.config.settings,
                parserOptions: source.config.parserOptions,
            },
        }]);
        if (result!.config.overrides?.length !== 1) {
            throw new Error(`Scope ${index} produced ${result!.config.overrides?.length ?? 0} overrides.`);
        }
        return { ...result!, language: source.language };
    });
    const configs = results.map((result) => result.config);
    const overrides = completeOverrides(configs.map((config) => config.overrides![0]!));
    const sharedEnvironment = new Set(configs.map((config) => JSON.stringify([config.env, config.globals]))).size === 1;
    if (!sharedEnvironment) {
        // Overrides extend the root environment, so each one states every environment and global explicitly.
        const environments = new Set(configs.flatMap((config) => Object.keys(config.env ?? {})));
        const globals = new Set(configs.flatMap((config) => Object.keys(config.globals ?? {})));
        overrides.forEach((override, index) => {
            const { env = {}, globals: values = {} } = configs[index]!;
            override.env = Object.fromEntries(Array.from(environments, (name) => [name, env[name] ?? false]));
            override.globals = Object.fromEntries(Array.from(globals, (name) => [
                name, values[name] ?? 'off',
            ])) as Override['globals'];
        });
    }
    const jsPlugins = new Map<string, NonNullable<OxlintConfig['jsPlugins']>[number]>();
    for (const provider of configs.flatMap((config) => config.jsPlugins ?? [])) {
        const name = typeof provider === 'string' ? provider : provider.name;
        const previous = jsPlugins.get(name);
        if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(provider)) {
            throw new Error(`Provider ${name} resolves differently between scopes.`);
        }
        jsPlugins.set(name, provider);
    }
    const config = finalizeProviders({
        categories: sharedRoot(configs, 'categories'),
        plugins: sharedRoot(configs, 'plugins'),
        ignorePatterns: structuredClone(spec.ignorePatterns ?? []),
        env: sharedEnvironment ? structuredClone(configs[0]!.env) : {},
        globals: sharedEnvironment ? structuredClone(configs[0]!.globals) : {},
        settings: { ...sharedRoot(configs, 'settings'), ...spec.settings },
        rules: {},
        ...(configs[0]!.options ? { options: sharedRoot(configs, 'options') } : {}),
        jsPlugins: [...jsPlugins.values()],
        overrides,
    });
    const emitted = config.overrides!.map(({ files: patterns, excludeFiles }) => ({ files: patterns, excludeFiles }));
    const mismatched = keyed.filter((file) => keys[lastScope(file.path, emitted)] !== file.key);
    if (mismatched.length) {
        throw new Error(`Emitted overrides select another configuration for: ${mismatched.slice(0, 20)
            .map((file) => file.path).join(', ')}`);
    }
    const fallback: FallbackSummary = {};
    results.forEach((result, index) => {
        for (const decision of result.fallback) {
            fallback[decision.source] ??= {
                disposition: decision.disposition, reason: decision.reason ?? decision.disposition, scopes: [],
            };
            fallback[decision.source]!.scopes.push(index);
        }
    });
    return {
        config,
        scopes: spec.scopes.map((scope, index) => ({
            files: scope.files,
            count: keyed.filter((file) => lastScope(file.path, spec.scopes) === index).length,
            language: results[index]!.language,
        })),
        fallback,
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const [consumerArgument, specArgument, outputArgument, ...options] = process.argv.slice(2);
    if (!consumerArgument || !specArgument || !outputArgument) {
        throw new Error('Usage: consumer-translate.ts <consumer> <spec.json> <output.json> [--ext .js,.ts] [targets...]');
    }
    const consumer = resolve(consumerArgument);
    const extIndex = options.indexOf('--ext');
    const extensions = extIndex === -1 ? ['.js', '.jsx', '.ts', '.tsx'] : options[extIndex + 1]!.split(',');
    const targets = options.filter((_, index) => extIndex === -1 || (index !== extIndex && index !== extIndex + 1));
    const spec = JSON.parse(readFileSync(resolve(specArgument), 'utf8')) as TranslationSpec;
    const files = collectEslint(consumer, extensions, targets).map((file) => ({
        path: relative(consumer, file.filePath).split(sep).join('/'),
        language: languageOf(file.filePath),
        config: file.config,
    }));
    // Spec settings take precedence over the detected plugin version.
    const major = typescriptEslintMajor(consumer);
    const result = translateConsumer(files, {
        ...spec,
        settings: { ...(major === undefined ? {} : { agTypeScriptEslint: major }), ...spec.settings },
    });
    writeFileSync(resolve(outputArgument), `${JSON.stringify(result.config, null, 2)}\n`);
    const ignored = files.filter((file) => isIgnored(file.path, spec.ignorePatterns ?? [])).length;
    process.stdout.write(`${files.length} files (${ignored} ignored), ${result.scopes.length} scopes\n`);
    result.scopes.forEach((scope, index) => {
        const rules = Object.values(result.config.overrides![index]!.rules ?? {}).filter((setting) => setting !== 'off');
        process.stdout.write(`  scope ${index} ${scope.language} ${scope.files.join(',')}: `
            + `${scope.count} files, ${rules.length} active rules\n`);
    });
    for (const [source, decision] of Object.entries(result.fallback)) {
        process.stdout.write(`  retained ${source} [${decision.disposition}] scopes ${decision.scopes.join(',')}: `
            + `${decision.reason}\n`);
    }
}
