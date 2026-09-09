import type { LegacyRule, Node, ModuleSource } from '../../types';
import resolve, { CASE_SENSITIVE_FS, fileExistsWithCaseSync } from '../../utils/resolve';
import ModuleCache from '../../utils/ModuleCache';
import moduleVisitor, { makeOptionsSchema } from '../../utils/moduleVisitor';
import docsUrl from '../docsUrl';

/**
 * @file Ensures that an imported path exists, given resolution rules.
 */

const rule: LegacyRule<
    [
        {
            commonjs?: boolean;
            amd?: boolean;
            esmodule?: boolean;
            ignore?: string[];
            caseSensitive?: boolean;
            caseSensitiveStrict?: boolean;
        }?,
    ]
> = {
    meta: {
        type: 'problem',
        docs: {
            category: 'Static analysis',
            description: 'Ensure imports point to a file/module that can be resolved.',
            url: docsUrl('no-unresolved'),
        },

        schema: [
            makeOptionsSchema({
                caseSensitive: { type: 'boolean', default: true },
                caseSensitiveStrict: { type: 'boolean', default: false },
            }),
        ],
    },

    create(context) {
        const options = context.options[0] || {};

        /**
         * Check source value.
         * @param source The source text.
         * @param node The node to inspect.
         */
        function checkSourceValue(source: ModuleSource, node: Node) {
            // ignore type-only imports and exports
            if (node.importKind === 'type' || node.exportKind === 'type') {
                return;
            }

            const caseSensitive = !CASE_SENSITIVE_FS && options.caseSensitive !== false;
            const caseSensitiveStrict = !CASE_SENSITIVE_FS && options.caseSensitiveStrict;

            const resolvedPath = resolve(source.value, context);

            if (resolvedPath === undefined) {
                context.report(source, `Unable to resolve path to module '${source.value}'.`);
            } else if (caseSensitive || caseSensitiveStrict) {
                const cacheSettings = ModuleCache.getSettings(context.settings);
                if (!fileExistsWithCaseSync(resolvedPath, cacheSettings, caseSensitiveStrict)) {
                    context.report(
                        source,
                        `Casing of ${source.value} does not match the underlying filesystem.`,
                    );
                }
            }
        }

        return moduleVisitor(checkSourceValue, options);
    },
};
export default rule;
