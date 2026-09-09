import type { Node, LegacyRule } from '../../types';
import docsUrl from '../docsUrl';

/**
 * Is require.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isRequire(node: Node) {
    return (
        node
        && node.callee
        && node.callee.type === 'Identifier'
        && node.callee.name === 'require'
        && node.arguments!.length >= 1
    );
}

/**
 * Is dynamic import.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isDynamicImport(node: Node) {
    return node && node.callee && node.callee.type === 'Import';
}

/**
 * Is static value.
 * @param arg The arg value.
 * @returns The result of this check.
 */
function isStaticValue(arg: Node) {
    return arg.type === 'Literal' || (arg.type === 'TemplateLiteral' && arg.expressions.length === 0);
}

const dynamicImportErrorMessage = 'Calls to import() should use string literals';

const rule: LegacyRule<[{ esmodule?: boolean }?]> = {
    meta: {
        type: 'suggestion',
        docs: {
            category: 'Static analysis',
            description: 'Forbid `require()` calls with expressions.',
            url: docsUrl('no-dynamic-require'),
        },
        schema: [
            {
                type: 'object',
                properties: {
                    esmodule: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const options = context.options[0] || {};

        return {
            CallExpression(node: Node<'CallExpression'>) {
                if (!node.arguments[0] || isStaticValue(node.arguments[0])) {
                    return undefined;
                }
                if (isRequire(node)) {
                    return context.report({
                        node,
                        message: 'Calls to require() should use string literals',
                    });
                }
                if (options.esmodule && isDynamicImport(node)) {
                    return context.report({
                        node,
                        message: dynamicImportErrorMessage,
                    });
                }

                return undefined;
            },
            ImportExpression(node: Node<'ImportExpression'>) {
                if (!options.esmodule || isStaticValue(node.source)) {
                    return undefined;
                }
                return context.report({
                    node,
                    message: dynamicImportErrorMessage,
                });
            },
        };
    },
};
export default rule;
