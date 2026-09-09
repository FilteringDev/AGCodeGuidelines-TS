import type { LegacyRule, Node, Scope } from '../../types';
import { getScope } from '../../utils/contextCompat';
import docsUrl from '../docsUrl';

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',
        docs: {
            category: 'Helpful warnings',
            description: 'Forbid the use of mutable exports with `var` or `let`.',
            url: docsUrl('no-mutable-exports'),
        },
        schema: [],
    },

    create(context) {
        /**
         * Check declaration.
         * @param node The node to inspect.
         */
        function checkDeclaration(node: Node) {
            const { kind } = node;
            if (kind === 'var' || kind === 'let') {
                context.report(node, `Exporting mutable '${kind}' binding, use 'const' instead.`);
            }
        }

        /**
         * Check declarations in scope.
         * @param scope The lexical scope.
         * @param scope.variables The declared variables.
         * @param name The name to inspect.
         */
        function checkDeclarationsInScope({ variables }: Scope, name: string) {
            variables
                .filter((variable) => variable.name === name)
                .forEach((variable) => {
                    variable.defs
                        .filter((def) => def.type === 'Variable' && def.parent)
                        .forEach((def) => {
                            checkDeclaration(def.parent!);
                        });
                });
        }

        return {
            /**
             * @param node The node to inspect.
             */
            ExportDefaultDeclaration(node: Node<'ExportDefaultDeclaration'>) {
                const scope = getScope(context, node);

                if ('name' in node.declaration && node.declaration.name) {
                    checkDeclarationsInScope(scope, node.declaration.name);
                }
            },

            /**
             * @param node The node to inspect.
             */
            ExportNamedDeclaration(node: Node<'ExportNamedDeclaration'>) {
                const scope = getScope(context, node);

                if ('declaration' in node && node.declaration) {
                    checkDeclaration(node.declaration);
                } else if (!('source' in node) || !node.source) {
                    node.specifiers.forEach((specifier) => {
                        checkDeclarationsInScope(scope, specifier.local!.name!);
                    });
                }
            },
        };
    },
};
export default rule;
