/** @file Complete, portable Oxlint configurations derived from the pinned guide. */
import { catalog } from '@agcodeguidelines/rule-catalog';

import type {
    ImportGroups,
    Overlay,
    Policy,
    Profile,
} from '@agcodeguidelines/rule-catalog';
import type { OxlintConfig } from 'oxlint';
import { checkTsconfig, parseJsonc } from './compiler';

import type { TsconfigCheck } from './compiler';

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
    const providers = {
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
        plugins: ['eslint', 'unicorn', 'typescript', 'import'],
        jsPlugins: Object.entries(providers).map(([name, specifier]) => ({ name, specifier })),
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
