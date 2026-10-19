/** @file Complete, portable Oxlint configurations derived from the pinned guide. */
import { catalog, listRuleOwnership, severity } from '@agcodeguidelines/rule-catalog';

import type {
    DetailedResolutionOptions,
    DetailedRuleResolution,
    ImportGroups,
    Overlay,
    Policy,
    Profile,
    RuleMap,
    RuleSetting,
} from '@agcodeguidelines/rule-catalog';
import type { OxlintConfig } from 'oxlint';
import { checkTsconfig, parseJsonc } from './compiler.js';

import type { TsconfigCheck } from './compiler.js';

export type {
    ImportGroups,
    Policy,
    Profile,
    TsconfigCheck,
};
export type Language = 'javascript' | 'typescript';
export type Environment = 'browser' | 'node' | 'both';
export interface ConfigOptions {
    language?: Language;
    environment?: Environment;
    sourceType?: 'module' | 'script' | 'commonjs';
    typeAware?: boolean;
    /** `guideline` enforces guide prose where it conflicts with the sample configuration. */
    policy?: Policy;
    /** `adguard-projects` adds rules shared by AdGuard projects that the guide does not require. */
    profile?: Profile;
    /** Import grouping for clause 10.10 under the guideline policy. */
    importGroups?: ImportGroups;
}

type Rules = NonNullable<OxlintConfig['rules']>;

export interface CompatibilityConfigOptions extends DetailedResolutionOptions {
    rules: RuleMap;
    ignorePatterns?: string[];
    typeAware?: boolean;
}

export interface CompatibilityConfigResult {
    config: OxlintConfig;
    ownership: DetailedRuleResolution[];
    fallback: DetailedRuleResolution[];
}

/** One explicitly scoped effective source configuration for a consumer. */
export interface CompatibilityConfigGroupOptions extends CompatibilityConfigOptions {
    id: string;
}

/** An independent Oxlint configuration and ownership result for one source scope. */
export interface CompatibilityConfigGroupResult extends CompatibilityConfigResult {
    id: string;
}

const PROVIDERS = {
    ag: '@agcodeguidelines/oxlint-plugin',
    'ag-ts': '@agcodeguidelines/oxlint-plugin/typescript',
    'ag-compat': '@agcodeguidelines/oxlint-plugin/compat',
    'ag-style': '@agcodeguidelines/oxlint-plugin/stylistic',
    'ag-jsdoc': '@agcodeguidelines/oxlint-plugin/jsdoc',
    'ag-react': '@agcodeguidelines/oxlint-plugin/react',
    'ag-a11y': '@agcodeguidelines/oxlint-plugin/jsx-a11y',
    'ag-import': '@agcodeguidelines/oxlint-plugin/import',
    'ag-newlines': '@agcodeguidelines/oxlint-plugin/newlines',
    'ag-boundaries': '@agcodeguidelines/oxlint-plugin/boundaries',
    'ag-notice': '@agcodeguidelines/oxlint-plugin/notice',
    'ag-logger': '@agcodeguidelines/oxlint-plugin/logger',
};

const PROVIDER_ALIASES = {
    'ag-ts-style': '@agcodeguidelines/oxlint-plugin/typescript-stylistic',
};

// Read by the pinned provider sources exactly as by the original ESLint plugins.
const PASSTHROUGH_SETTINGS = new Set([
    'import/extensions',
    'import/external-module-folders',
    'import/core-modules',
    'import/ignore',
    'import/internal-regex',
    'import/cache',
    'import/docstyle',
    'propWrapperFunctions',
    'componentWrapperFunctions',
    'formComponents',
    'linkComponents',
    'jsdoc',
    'boundaries/elements',
    'boundaries/ignore',
    'boundaries/include',
    'boundaries/root-path',
    'boundaries/dependency-nodes',
    'boundaries/additional-dependency-nodes',
]);
const RESOLVER_OPTIONS: Record<string, readonly string[]> = {
    node: ['extensions', 'moduleDirectory'],
    typescript: ['alwaysTryTypes', 'project', 'conditionNames', 'extensions', 'mainFields'],
};

/**
 * Map consumer settings onto the provider settings that reproduce them.
 * @param settings - Effective source settings.
 * @returns Oxlint settings and the keys whose behavior is not verified.
 */
function translateSettings(
    settings: Record<string, unknown>,
): { settings: Record<string, unknown>; unverified: string[] } {
    const result: Record<string, unknown> = {};
    const unverified: string[] = [];
    for (const [key, value] of Object.entries(settings)) {
        if (key === 'react') {
            // Oxlint's native React schema rejects version detection; providers read agReact.
            result.agReact = structuredClone(value);
            const version = (value as { version?: unknown } | null)?.version;
            if (version === undefined || (typeof version === 'string' && /^\d/u.test(version))) {
                result.react = structuredClone(value);
            }
        } else if (key === 'import/parsers') {
            // Oxc parses TypeScript and JSX dependencies; consumer parser packages must not load.
            continue;
        } else if (key === 'import/resolver') {
            const resolvers = value && typeof value === 'object' && !Array.isArray(value)
                ? Object.entries(value as Record<string, unknown>) : [];
            const supported = resolvers.length > 0 && resolvers.every(([name, options]) => (
                Object.hasOwn(RESOLVER_OPTIONS, name)
                && (options === true || (options !== null && typeof options === 'object' && !Array.isArray(options)
                    && Object.keys(options).every((option) => RESOLVER_OPTIONS[name]!.includes(option))))
            ));
            if (!supported) {
                unverified.push(key);
            }
            result[key] = structuredClone(value);
        } else if (PASSTHROUGH_SETTINGS.has(key) || /^ag[A-Z]/u.test(key)) {
            result[key] = structuredClone(value);
        } else {
            unverified.push(key);
            result[key] = structuredClone(value);
        }
    }
    return { settings: result, unverified };
}

// Only typed services read these; typed rules stay behind the separate typeAware decision.
const TYPED_PARSER_OPTIONS = new Set([
    'project',
    'tsconfigRootDir',
    'projectService',
    'extraFileExtensions',
    'warnOnUnsupportedTypeScriptVersion',
    'createDefaultProgram',
]);
// Accepted by parsers for legacy compatibility without changing the parsed program.
const INERT_FEATURES = new Set(['jsx', 'generators', 'objectLiteralDuplicateProperties', 'experimentalObjectRestSpread']);

/**
 * Map parser options onto provider settings without changing configured globals.
 * @param parserOptions - Effective source parser options.
 * @param sourceType - Explicit module semantics from the source context.
 * @returns Provider settings and the options whose behavior is not verified.
 */
function translateParserOptions(
    parserOptions: Record<string, unknown>,
    sourceType: string | undefined,
): { settings: Record<string, unknown>; unverified: string[] } {
    const settings: Record<string, unknown> = {};
    const unverified: string[] = [];
    const features: Record<string, unknown> = {};
    const type = sourceType ?? parserOptions.sourceType;
    if (type !== undefined) {
        if (type === 'module' || type === 'script') {
            settings.agSourceType = type;
        } else {
            unverified.push('sourceType');
        }
    }
    for (const [key, value] of Object.entries(parserOptions)) {
        if (key === 'sourceType' || TYPED_PARSER_OPTIONS.has(key)) {
            continue;
        }
        if (key === 'ecmaVersion') {
            const year = typeof value === 'number' && value > 5 && value < 2015 ? value + 2009 : value;
            if (typeof year === 'number' && year >= 2015) {
                settings.agRuleEcmaVersion = year;
            } else if (year !== 'latest') {
                unverified.push(key);
            }
        } else if (key === 'ecmaFeatures' && value && typeof value === 'object') {
            for (const [feature, enabled] of Object.entries(value)) {
                if (INERT_FEATURES.has(feature) || ((feature === 'globalReturn' || feature === 'impliedStrict')
                    && typeof enabled === 'boolean')) {
                    features[feature] = enabled;
                } else {
                    unverified.push(`ecmaFeatures.${feature}`);
                }
            }
        } else {
            unverified.push(key);
        }
    }
    if (features.globalReturn || features.impliedStrict) {
        settings.agParserOptions = { ecmaFeatures: features };
    }
    return { settings, unverified };
}

/**
 * Select providers after finalizing explicit rules, including every override.
 * @param config - An explicit configuration without inherited configurations.
 * @returns An independent configuration omitting unused providers and their redundant off entries.
 */
export function finalizeProviders(config: OxlintConfig): OxlintConfig {
    if (config.extends?.length) {
        throw new TypeError('Resolve inherited configurations before finalizing providers.');
    }
    const result = structuredClone(config);
    const active = new Set(
        [result.rules, ...(result.overrides ?? []).map((override) => override.rules)]
            .flatMap((rules) => Object.entries(rules ?? {}))
            .filter(([, setting]) => {
                const level = (Array.isArray(setting) ? setting[0] : setting) ?? 'off';
                if (![0, 1, 2, 'off', 'allow', 'warn', 'error', 'deny'].includes(level)) {
                    throw new TypeError(`Invalid Oxlint severity: ${level}.`);
                }
                return ['warn', 'error', 'deny', 1, 2].includes(level);
            })
            .map(([target]) => target.slice(0, target.lastIndexOf('/'))),
    );
    const registered = result.jsPlugins ?? [];
    const removable = new Set([
        ...Object.keys(PROVIDERS),
        ...Object.keys(PROVIDER_ALIASES),
        ...registered.flatMap((provider) => (typeof provider === 'string' ? [] : [provider.name])),
    ].filter((name) => !active.has(name)));
    [result.rules, ...(result.overrides ?? []).map((override) => override.rules)].forEach((rules) => {
        Object.keys(rules ?? {}).forEach((target) => {
            if (removable.has(target.slice(0, target.lastIndexOf('/')))) {
                delete rules![target];
            }
        });
    });
    const providers = registered.filter((provider) => typeof provider === 'string' || active.has(provider.name));
    Object.entries(PROVIDERS).forEach(([name, specifier]) => {
        if (active.has(name) && !providers.some((provider) => typeof provider !== 'string' && provider.name === name)) {
            providers.push({ name, specifier });
        }
    });
    Object.entries(PROVIDER_ALIASES).forEach(([name, specifier]) => {
        if (active.has(name) && !providers.some((provider) => typeof provider !== 'string' && provider.name === name)) {
            providers.push({ name, specifier });
        }
    });
    if (providers.length) {
        result.jsPlugins = providers;
    } else {
        delete result.jsPlugins;
    }
    return result;
}

/**
 * Translate one effective source configuration without enabling a preset.
 * @param options - Explicit source rules and an already resolved file/configuration scope.
 * @returns Selected rules and lossless decisions for rules retained by the original owner.
 */
export function createCompatibilityConfig(options: CompatibilityConfigOptions): CompatibilityConfigResult {
    const { context = {}, typeAware = false } = options;
    if (typeof typeAware !== 'boolean') {
        throw new TypeError('typeAware must be a boolean.');
    }
    const translated = translateSettings(context.settings ?? {});
    const parser = translateParserOptions(context.parserOptions ?? {}, context.sourceType);
    const ownership = listRuleOwnership(options.rules, { ...options, language: options.language ?? 'javascript' })
        .map((decision): DetailedRuleResolution => {
            if (decision.status === 'unsupported') {
                return decision;
            }
            let reason: string | undefined;
            if (parser.unverified.length) {
                reason = `Parser options ${parser.unverified.join(', ')} need independent verification; retain the source owner.`;
            } else if (decision.requiresTypeInfo && !typeAware) {
                reason = 'Type information is required; retain the typed owner or explicitly enable its service.';
            } else if (translated.unverified.length && !decision.nativeCandidate) {
                reason = `Consumer settings ${translated.unverified.join(', ')} have not been verified for this implementation.`;
            }
            if (reason && decision.disposition !== 'disabled') {
                return {
                    ...decision,
                    status: 'unsupported',
                    disposition: 'unsupported',
                    reason,
                };
            }
            return decision;
        });
    const rules: Rules = {};
    ownership.forEach((decision) => {
        if (decision.status === 'unsupported' || !decision.target || decision.disposition === 'compiler') {
            return;
        }
        // Oxlint validates options of disabled rules too; merged ESLint configs keep stale ones.
        const setting = severity(decision.setting) === 0 ? 'off' : structuredClone(decision.setting) as Rules[string];
        const previous = rules[decision.target];
        if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(setting)) {
            // A disabled base rule beside its enabled TypeScript extension leaves one active owner.
            if (severity(setting as RuleSetting) === 0) {
                return;
            }
            if (severity(previous as RuleSetting) !== 0) {
                throw new TypeError(`Conflicting ownership for ${decision.target}. Split configuration groups.`);
            }
        }
        rules[decision.target] = setting;
    });
    const language = options.language ?? 'javascript';
    const languageFiles = language === 'typescript' ? '**/*.{ts,tsx,mts,cts}' : '**/*.{js,jsx,mjs,cjs}';
    const otherLanguage = language === 'typescript' ? '**/*.{js,jsx,mjs,cjs}' : '**/*.{ts,tsx,mts,cts}';
    const config = finalizeProviders({
        categories: {
            correctness: 'off',
            suspicious: 'off',
            pedantic: 'off',
            perf: 'off',
            style: 'off',
            restriction: 'off',
            nursery: 'off',
        },
        plugins: ['eslint', 'unicorn', 'typescript', 'import', 'react'],
        ignorePatterns: structuredClone(options.ignorePatterns ?? []),
        env: structuredClone(context.env ?? {}),
        globals: Object.fromEntries(Object.entries(context.globals ?? {}).map(([name, value]) => [
            name, value === true ? 'writable' : value === false ? 'readonly' : value,
        ])),
        settings: { ...translated.settings, ...parser.settings },
        rules: {},
        ...(typeAware ? { options: { typeAware: true } } : {}),
        overrides: [{
            files: structuredClone(context.files ?? [languageFiles]),
            excludeFiles: [...(context.excludedFiles ?? []), otherLanguage],
            rules,
        }],
    });
    return {
        config,
        ownership,
        fallback: ownership.filter((decision) => ['unsupported', 'manual', 'compiler'].includes(decision.disposition)),
    };
}

/**
 * Resolve multiple disjoint effective source contexts without leaking root settings between them.
 * @param groups Explicit consumer-owned file groups and their already resolved source rules.
 * @returns Independent configurations; execute each with its own root settings and ignore patterns.
 */
export function createCompatibilityConfigGroups(
    groups: readonly CompatibilityConfigGroupOptions[],
): CompatibilityConfigGroupResult[] {
    const identifiers = new Set<string>();
    return groups.map(({ id, ...options }) => {
        if (!id || identifiers.has(id)) {
            throw new TypeError(`Compatibility configuration group IDs must be unique and nonempty: ${id}.`);
        }
        identifiers.add(id);
        const files = options.context?.files;
        if (!files?.length || files.some((pattern) => !pattern.trim())) {
            throw new TypeError(`Compatibility configuration group ${id} requires explicit file scopes.`);
        }
        return { id, ...createCompatibilityConfig(options) };
    });
}

/**
 * Create an independent configuration with all plugin settings at its root.
 * @param options - Language, globals, module semantics, policy, and profile for the consumer.
 * @returns A complete mutable Oxlint configuration.
 */
export function createConfig(options: ConfigOptions | Language = {}): OxlintConfig {
    const {
        language = 'javascript',
        environment = 'browser',
        sourceType = 'module',
        typeAware = false,
        policy = 'compatibility',
        profile = 'guide',
        importGroups,
    } = typeof options === 'string' ? { language: options } : options;
    if (
        !['javascript', 'typescript'].includes(language)
        || !['browser', 'node', 'both'].includes(environment)
        || !['module', 'script', 'commonjs'].includes(sourceType)
        || !['compatibility', 'guideline'].includes(policy)
        || !['guide', 'adguard-projects'].includes(profile)
    ) {
        throw new TypeError('Unsupported language, environment, source type, policy, or profile.');
    }
    if (typeof typeAware !== 'boolean' || (typeAware && language !== 'typescript')) {
        throw new TypeError('Type-aware linting requires the TypeScript preset and a boolean typeAware option.');
    }
    if (importGroups !== undefined && (policy !== 'guideline' || !['example', 'prose'].includes(importGroups))) {
        throw new TypeError('importGroups requires the guideline policy and one of: example, prose.');
    }
    const rules = structuredClone(catalog.rules) as Rules;
    const typescriptRules = structuredClone(catalog.typescriptRules) as Rules;
    const settings = structuredClone(catalog.settings);
    const overlays: Overlay[] = [];
    if (policy === 'guideline') {
        overlays.push(catalog.policies.guideline);
    }
    if (profile === 'adguard-projects') {
        overlays.push(catalog.profiles['adguard-projects']);
    }
    overlays.forEach((overlay) => {
        Object.assign(rules, structuredClone(overlay.rules));
        Object.assign(typescriptRules, structuredClone(overlay.typescriptRules));
        Object.assign(settings, structuredClone(overlay.settings));
    });
    if (policy === 'guideline') {
        rules['ag-import/order'] = structuredClone(
            catalog.policies.guideline.importGroups[importGroups ?? 'example'],
        ) as Rules[string];
        if (sourceType !== 'module') {
            rules['import/no-commonjs'] = 'off';
        }
    }
    if (!typeAware) {
        catalog.mappings
            .filter((mapping) => mapping.requiresTypeInfo && mapping.target)
            .forEach((mapping) => delete typescriptRules[mapping.target!]);
    }
    // Oxlint's native React settings schema cannot represent version detection.
    settings.agReact = settings.react;
    delete settings.react;
    settings.agSourceType = sourceType;
    settings.agTypeScript = language === 'typescript';
    settings.agPolicy = policy;
    settings.agProfile = profile;
    const config: OxlintConfig = {
        categories: {
            correctness: 'off',
            suspicious: 'off',
            pedantic: 'off',
            perf: 'off',
            style: 'off',
            restriction: 'off',
            nursery: 'off',
        },
        plugins: ['eslint', 'unicorn', 'typescript', 'import', 'react'],
        jsPlugins: Object.entries(PROVIDERS).map(([name, specifier]) => ({ name, specifier })),
        env: {
            ...catalog.env,
            builtin: true,
            es2026: true,
            browser: environment !== 'node',
            node: environment !== 'browser',
        },
        settings,
        rules,
        overrides: [],
    };
    if (typeAware) {
        config.options = { typeAware: true };
    }
    if (policy === 'guideline' && sourceType === 'module') {
        // CommonJS filename extensions and legacy ESLint configuration files keep CommonJS semantics.
        config.overrides!.push({ files: ['**/*.{cjs,cts}', '**/.eslintrc.js'], rules: { 'import/no-commonjs': 'off' } });
    }
    if (language === 'typescript') {
        settings['import/extensions'] = ['.js', '.mjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'];
        settings['import/resolver'] = { typescript: true, node: { extensions: settings['import/extensions'] } };
        config.overrides!.unshift({ files: ['**/*.{ts,tsx,mts,cts}'], rules: typescriptRules });
    }
    return config;
}

export const javascript = createConfig();
export const typescript = createConfig({ language: 'typescript' });
export const node = { env: { browser: false, node: true } } satisfies OxlintConfig;
export { checkTsconfig, parseJsonc };
