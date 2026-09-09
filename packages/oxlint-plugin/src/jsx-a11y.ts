/** @file Run accessibility rules through Oxlint. */
import plugin from 'eslint-plugin-jsx-a11y';
import type { Plugin, Rule } from '@oxlint/plugins';
import { legacyContext } from './legacy-context';

export default {
    ...plugin,
    rules: Object.fromEntries(
        Object.entries(plugin.rules).map(([name, rule]) => [
            name,
            {
                ...rule,
                create(context) {
                    return legacyContext(rule, context);
                },
            } satisfies Rule,
        ]),
    ),
} as Plugin;
