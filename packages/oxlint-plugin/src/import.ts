/** @file Run the isolated import rules through Oxlint with an Oxc dependency parser. */
import type { Plugin, Rule } from '@oxlint/plugins';
import plugin from '../../../vendor/import/index';
import { legacyContext } from './legacy-context';
import { remoteParser } from './import-parser';

// Keyed by AST so all import rules of one file share the object and its serialized cache key.
const languageOptions = new WeakMap<object, object>();

export default {
    ...plugin,
    rules: Object.fromEntries(
        Object.entries(plugin.rules).map(([name, rule]) => [
            name,
            {
                ...rule,
                create(context) {
                    const { ast } = context.sourceCode;
                    let options = languageOptions.get(ast);
                    if (!options) {
                        options = { ...context.languageOptions, parser: remoteParser };
                        languageOptions.set(ast, options);
                    }
                    const adapted = Object.create(context, {
                        languageOptions: { value: options },
                    });
                    return legacyContext(rule as unknown as Rule, adapted);
                },
            } satisfies Rule,
        ]),
    ),
} as Plugin;
