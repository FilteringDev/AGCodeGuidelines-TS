/** @file Run the isolated import rules through Oxlint with an Oxc dependency parser. */
import type { Plugin, Rule } from '@oxlint/plugins';
import plugin from '../../../vendor/import/index.js';
import { legacyContext } from './legacy-context';
import { remoteParser } from './import-parser';

export default {
    ...plugin,
    rules: Object.fromEntries(
        Object.entries(plugin.rules).map(([name, rule]) => [
            name,
            {
                ...rule,
                create(context) {
                    const adapted = Object.create(context, {
                        languageOptions: { value: { ...context.languageOptions, parser: remoteParser } },
                    });
                    return legacyContext(rule, adapted);
                },
            } satisfies Rule,
        ]),
    ),
} as Plugin;
