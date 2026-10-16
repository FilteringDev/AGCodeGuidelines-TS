/** @file Expose TypeScript extension-style rules under a distinct Oxlint plugin identity. */
import { definePlugin } from '@oxlint/plugins';
import plugin from '@stylistic/eslint-plugin';

import type { Rule } from '@oxlint/plugins';

const RULE_NAMES = [
    'brace-style',
    'comma-dangle',
    'comma-spacing',
    'function-call-spacing',
    'indent',
    'key-spacing',
    'keyword-spacing',
    'lines-around-comment',
    'lines-between-class-members',
    'member-delimiter-style',
    'no-extra-parens',
    'no-extra-semi',
    'object-curly-spacing',
    'padding-line-between-statements',
    'quotes',
    'semi',
    'space-before-blocks',
    'space-before-function-paren',
    'space-infix-ops',
] as const;

const rules: Record<string, Rule> = Object.fromEntries(RULE_NAMES.map((name) => {
    const rule = plugin.rules[name];
    if (!rule) {
        throw new Error(`Missing pinned Stylistic rule ${name}.`);
    }
    return [name, rule as unknown as Rule];
}));

export default definePlugin({ meta: { name: 'ag-ts-style' }, rules });
