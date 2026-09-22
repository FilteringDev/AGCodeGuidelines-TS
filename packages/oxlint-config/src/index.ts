/** @file Complete, portable Oxlint configurations derived from the pinned guide. */
import { catalog } from '@agcodeguidelines/rule-catalog';

import type { OxlintConfig } from 'oxlint';

export type Language = 'javascript' | 'typescript';
export type Environment = 'browser' | 'node' | 'both';
export interface ConfigOptions {
    language?: Language;
    environment?: Environment;
    sourceType?: 'module' | 'script' | 'commonjs';
}

/**
 * Create an independent configuration with all plugin settings at its root.
 * @param options - Language, globals, and module semantics for the consumer.
 * @returns A complete mutable Oxlint configuration.
 */
export function createConfig(options: ConfigOptions | Language = {}): OxlintConfig {
    const {
        language = 'javascript',
        environment = 'browser',
        sourceType = 'module',
    } = typeof options === 'string' ? { language: options } : options;
    if (
        !['javascript', 'typescript'].includes(language)
        || !['browser', 'node', 'both'].includes(environment)
        || !['module', 'script', 'commonjs'].includes(sourceType)
    ) {
        throw new TypeError('Unsupported language or environment.');
    }
    const rules = structuredClone(catalog.rules) as NonNullable<OxlintConfig['rules']>;
    const settings = structuredClone(catalog.settings);
    const providers = {
        ag: '@agcodeguidelines/oxlint-plugin',
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
        plugins: ['eslint', 'unicorn', 'typescript'],
        jsPlugins: Object.entries(providers).map(([name, specifier]) => ({ name, specifier })),
        env: {
            ...catalog.env,
            builtin: true,
            es2026: true,
            browser: environment !== 'node',
            node: environment !== 'browser',
        },
        settings,
        rules: rules as OxlintConfig['rules'],
        overrides: [],
    };
    if (language === 'typescript') {
        const unused = rules['ag-compat/no-unused-vars'];
        settings['import/extensions'] = ['.js', '.mjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'];
        settings['import/resolver'] = { typescript: true, node: { extensions: settings['import/extensions'] } };
        config.overrides = [
            {
                files: ['**/*.{ts,tsx,mts,cts}'],
                rules: {
                    'ag-compat/no-undef': 'off',
                    // Native syntax-aware rules understand signatures and parameter properties.
                    'ag-compat/no-unused-vars': 'off',
                    'eslint/no-unused-vars': Array.isArray(unused)
                        ? [unused[0], { caughtErrors: 'none', ...(unused[1] as object) }]
                        : [unused ?? 'off', { caughtErrors: 'none' }],
                    'ag-compat/no-shadow': 'off',
                    'eslint/no-shadow': rules['ag-compat/no-shadow'],
                    'ag-compat/no-useless-constructor': 'off',
                    'eslint/no-useless-constructor': rules['ag-compat/no-useless-constructor'],
                    'ag-compat/no-empty-function': 'off',
                    'eslint/no-empty-function': rules['ag-compat/no-empty-function'],
                    'ag-compat/indent': 'off',
                    'ag-style/indent': rules['ag-compat/indent'],
                    'ag/enum-name': 'error',
                    'ag/unknown-catch': 'error',
                    'ag-react/jsx-filename-extension': ['error', { extensions: ['.jsx', '.tsx'] }],
                    'ag-import/extensions': [
                        'error',
                        'ignorePackages',
                        {
                            js: 'never',
                            jsx: 'never',
                            ts: 'never',
                            tsx: 'never',
                            mts: 'never',
                            cts: 'never',
                        },
                    ],
                    'ag-jsdoc/check-tag-names': ['warn', { typed: true }],
                    'ag-jsdoc/require-param-type': 'off',
                    'ag-jsdoc/require-property-type': 'off',
                    'ag-jsdoc/require-returns-type': 'off',
                    'ag-jsdoc/require-next-type': 'off',
                    'ag-jsdoc/require-yields-type': 'off',
                    'ag-jsdoc/require-throws-type': 'off',
                    'ag-jsdoc/no-undefined-types': 'off',
                    'ag-jsdoc/no-types': 'error',
                    // Syntax-only @typescript-eslint subset backed by Oxlint's
                    // native typescript plugin (no type-aware rules).
                    ...Object.fromEntries(
                        catalog.mappings
                            .filter((mapping) => mapping.target?.startsWith('typescript/') ?? false)
                            .map((mapping) => [mapping.target as string, mapping.setting]),
                    ),
                },
            },
        ];
    }
    return config;
}

export const javascript = createConfig();
export const typescript = createConfig({ language: 'typescript' });
export const node = { env: { browser: false, node: true } } satisfies OxlintConfig;
