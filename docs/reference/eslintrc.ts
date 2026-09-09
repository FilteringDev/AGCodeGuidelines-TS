/** @file Typed port of the frozen AdGuard sample configuration. */
import type { ReferenceConfig } from '../../scripts/reference';

const config = {
    env: {
        browser: true,
    },
    extends: [
        'airbnb',
        'plugin:jsdoc/recommended',
    ],
    rules: {
        'no-console': 'error',
        'no-await-in-loop': 'off',
        'max-len': ['error', {
            code: 120,
            comments: 120,
            tabWidth: 4,
            ignoreUrls: false,
            ignoreTrailingComments: false,
            ignoreComments: false,
        }],
        curly: ['error', 'all'],
        'brace-style': ['error', '1tbs', { allowSingleLine: false }],
        indent: ['error', 4, {
            SwitchCase: 1,
        }],
    },
} satisfies ReferenceConfig;

export default config;
