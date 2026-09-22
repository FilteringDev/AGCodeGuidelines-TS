/** @file Run the boundaries rules through Oxlint. */
import type { Plugin, Rule } from '@oxlint/plugins';
import plugin from '../../../vendor/boundaries/index';
import { legacyContext } from './legacy-context';

export default {
    ...plugin,
    rules: Object.fromEntries(
        Object.entries(plugin.rules).map(([name, rule]) => [
            name,
            {
                ...rule,
                create(context) {
                    return legacyContext(rule as unknown as Rule, context);
                },
            } satisfies Rule,
        ]),
    ),
} as Plugin;
