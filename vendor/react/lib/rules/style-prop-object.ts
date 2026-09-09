import type { LegacyRule, Node } from '../../types';
/**
 * @file Enforce style prop value is an object
 * @author David Petersen
 */
import dependency0 from '../util/variable';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/isCreateElement';
import dependency3 from '../util/report';

const variableUtil = dependency0;
const docsUrl = dependency1;
const isCreateElement = dependency2;
const report = dependency3;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    stylePropNotObject: 'Style prop value must be an object',
};

const rule: LegacyRule<[{ allow?: string[]; [key: string]: unknown }?]> = {
    meta: {
        docs: {
            description: 'Enforce style prop value is an object',
            category: 'Possible Errors',
            recommended: false,
            url: docsUrl('style-prop-object'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    allow: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        additionalItems: false,
                        uniqueItems: true,
                    },
                },
            },
        ],
    },

    create(context) {
        const allowed = new Set((context.options.length > 0 && context.options[0]!.allow) || []);

        /**
         * @param expression An Identifier node
         * @returns The result of this check.
         */
        function isNonNullaryLiteral(expression: Node | undefined) {
            return expression!.type === 'Literal' && expression!.value !== null;
        }

        /**
         * @param node A Identifier node
         */
        function checkIdentifiers(node: Node<'Identifier'>) {
            const variable = variableUtil.getVariableFromContext(context, node, node.name);

            if (!variable || !variable.defs[0] || !variable.defs[0].node.init) {
                return;
            }

            if (isNonNullaryLiteral(variable.defs[0].node.init)) {
                report(context, messages.stylePropNotObject, 'stylePropNotObject', {
                    node,
                });
            }
        }

        return {
            CallExpression(node: Node<'CallExpression'>) {
                if (isCreateElement(context, node) && node.arguments.length > 1) {
                    if ('name' in node.arguments[0]! && node.arguments[0].name) {
                        // store name of component
                        const componentName = node.arguments[0].name;

                        // allowed list contains the name
                        if (allowed.has(componentName)) {
                            // abort operation
                            return;
                        }
                    }
                    if (node.arguments[1]!.type === 'ObjectExpression') {
                        const style = node.arguments[1]!.properties!.find(
                            (property) => 'key' in property
                                && property.key
                                && 'name' in property.key
                                && property.key.name === 'style'
                                && !property.computed,
                        );

                        if (style && 'value' in style) {
                            if (style.value!.type === 'Identifier') {
                                checkIdentifiers(style.value!);
                            } else if (isNonNullaryLiteral(style.value)) {
                                report(context, messages.stylePropNotObject, 'stylePropNotObject', {
                                    node: style.value!,
                                });
                            }
                        }
                    }
                }
            },

            JSXAttribute(node: Node<'JSXAttribute'>) {
                if (!node.value || node.name.name !== 'style') {
                    return;
                }
                // store parent element
                const parentElement = node.parent;

                // parent element is a JSXOpeningElement
                if (parentElement && parentElement.type === 'JSXOpeningElement') {
                    // get the name of the JSX element
                    const name = parentElement.name && parentElement.name.name;

                    // allowed list contains the name
                    if (allowed.has(name as string)) {
                        // abort operation
                        return;
                    }
                }

                if (
                    node.value.type !== 'JSXExpressionContainer'
                    || isNonNullaryLiteral(node.value.expression)
                ) {
                    report(context, messages.stylePropNotObject, 'stylePropNotObject', {
                        node,
                    });
                } else if (node.value.expression.type === 'Identifier') {
                    checkIdentifiers(node.value.expression);
                }
            },
        };
    },
};

export default rule;
