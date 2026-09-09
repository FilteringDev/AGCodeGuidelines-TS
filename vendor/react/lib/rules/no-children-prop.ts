/**
 * @file Prevent passing of children as props
 * @author Benjamin Stepp
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/isCreateElement';
import dependency2 from '../util/report';
import type { LegacyRule, Node, RuleContext } from '../../types';

const docsUrl = dependency0;
const isCreateElement = dependency1;
const report = dependency2;

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

/**
 * Checks if the node is a createElement call with a props literal.
 * @param node - The AST node being checked.
 * @param context - The AST node being checked.
 * @returns - True if node is a createElement call with a props
 * object literal, False if not.
 */
function isCreateElementWithProps(node: Node, context: RuleContext) {
    return (
        isCreateElement(context, node)
        && node.arguments!.length > 1
        && node.arguments![1]!.type === 'ObjectExpression'
    );
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    nestChildren:
        'Do not pass children as props. Instead, nest children between the opening and closing tags.',
    passChildrenAsArgs:
        'Do not pass children as props. Instead, pass them as additional arguments to React.createElement.',
    nestFunction:
        'Do not nest a function between the opening and closing tags. Instead, pass it as a prop.',
    passFunctionAsArgs:
        'Do not pass a function as an additional argument to React.createElement. Instead, pass it as a prop.',
};

const rule: LegacyRule<[{ allowFunctions?: boolean }?]> = {
    meta: {
        docs: {
            description: 'Disallow passing of children as props',
            category: 'Best Practices',
            recommended: true,
            url: docsUrl('no-children-prop'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    allowFunctions: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const configuration = context.options[0] || {};

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isFunction(node: Node) {
            return (
                configuration.allowFunctions
                && (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression')
            );
        }

        return {
            JSXAttribute(node: Node<'JSXAttribute'>) {
                if (node.name.name !== 'children') {
                    return;
                }

                const { value } = node;
                if (value && value.type === 'JSXExpressionContainer' && isFunction(value.expression)) {
                    return;
                }

                report(context, messages.nestChildren, 'nestChildren', {
                    node,
                });
            },
            CallExpression(node: Node<'CallExpression'>) {
                if (!isCreateElementWithProps(node, context)) {
                    return;
                }

                const props = 'properties' in node.arguments[1]! ? node.arguments[1].properties : undefined;
                const childrenProp = props!.find(
                    (prop) => 'key' in prop && prop.key && 'name' in prop.key && prop.key.name === 'children',
                );

                if (childrenProp) {
                    if (
                        'value' in childrenProp
                        && childrenProp.value
                        && !isFunction(childrenProp.value)
                    ) {
                        report(context, messages.passChildrenAsArgs, 'passChildrenAsArgs', {
                            node,
                        });
                    }
                } else if (node.arguments.length === 3) {
                    const children = node.arguments[2];
                    if (isFunction(children!)) {
                        report(context, messages.passFunctionAsArgs, 'passFunctionAsArgs', {
                            node,
                        });
                    }
                }
            },
            JSXElement(node: Node<'JSXElement'>) {
                const { children } = node;
                if (
                    children
                    && children.length === 1
                    && children[0]!.type === 'JSXExpressionContainer'
                ) {
                    if (isFunction(children[0]!.expression!)) {
                        report(context, messages.nestFunction, 'nestFunction', {
                            node,
                        });
                    }
                }
            },
        };
    },
};

export default rule;
