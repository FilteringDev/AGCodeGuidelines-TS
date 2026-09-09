/**
 * @file Forbid "button" element without an explicit "type" attribute
 * @author Filipp Riabchun
 */
import dependency0 from 'jsx-ast-utils/getProp.js';
import dependency1 from 'jsx-ast-utils/getLiteralPropValue.js';
import type { LegacyRule, Node } from '../../types';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/isCreateElement';
import dependency4 from '../util/report';

const getProp = dependency0;
const getLiteralPropValue = dependency1;
const docsUrl = dependency2;
const isCreateElement = dependency3;
const report = dependency4;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const optionDefaults = {
    button: true,
    submit: true,
    reset: true,
};

const messages = {
    missingType: 'Missing an explicit type attribute for button',
    complexType:
        'The button type attribute must be specified by a static string or a trivial ternary expression',
    invalidValue: '"{{value}}" is an invalid value for button type attribute',
    forbiddenValue: '"{{value}}" is an invalid value for button type attribute',
};

const rule: LegacyRule<[{ button?: boolean; submit?: boolean; reset?: boolean }?]> = {
    meta: {
        docs: {
            description: 'Disallow usage of `button` elements without an explicit `type` attribute',
            category: 'Possible Errors',
            recommended: false,
            url: docsUrl('button-has-type'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    button: {
                        default: optionDefaults.button,
                        type: 'boolean',
                    },
                    submit: {
                        default: optionDefaults.submit,
                        type: 'boolean',
                    },
                    reset: {
                        default: optionDefaults.reset,
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const configuration = { ...optionDefaults, ...context.options[0] };

        /**
         * @param node The node to inspect.
         */
        function reportMissing(node: Node) {
            report(context, messages.missingType, 'missingType', {
                node,
            });
        }

        /**
         * @param node The node to inspect.
         */
        function reportComplex(node: Node) {
            report(context, messages.complexType, 'complexType', {
                node,
            });
        }

        /**
         * @param node The node to inspect.
         * @param value The value to inspect.
         */
        function checkValue(node: Node, value: unknown) {
            if (!((value as PropertyKey) in configuration)) {
                report(context, messages.invalidValue, 'invalidValue', {
                    node,
                    data: {
                        value,
                    },
                });
            } else if (!configuration[value as keyof typeof configuration]) {
                report(context, messages.forbiddenValue, 'forbiddenValue', {
                    node,
                    data: {
                        value,
                    },
                });
            }
        }

        /**
         * @param node The node to inspect.
         * @param expression The expression value.
         */
        function checkExpression(node: Node, expression: Node) {
            switch (expression.type) {
                case 'Literal':
                    checkValue(node, expression.value);
                    return;
                case 'TemplateLiteral':
                    if (expression.expressions.length === 0) {
                        checkValue(node, expression.quasis[0]!.value.raw);
                    } else {
                        reportComplex(expression);
                    }
                    return;
                case 'ConditionalExpression':
                    checkExpression(node, expression.consequent);
                    checkExpression(node, expression.alternate);
                    return;
                default:
                    reportComplex(expression);
            }
        }

        return {
            JSXElement(node: Node<'JSXElement'>) {
                if (node.openingElement.name.name !== 'button') {
                    return;
                }

                const typeProp = getProp(node.openingElement.attributes, 'type');

                if (!typeProp) {
                    reportMissing(node);
                    return;
                }

                if (typeProp.value && typeProp.value.type === 'JSXExpressionContainer') {
                    checkExpression(node, typeProp.value.expression);
                    return;
                }

                const propValue = getLiteralPropValue(typeProp);
                checkValue(node, propValue);
            },
            CallExpression(node: Node<'CallExpression'>) {
                if (!isCreateElement(context, node) || node.arguments.length < 1) {
                    return;
                }

                if (node.arguments[0]!.type !== 'Literal' || node.arguments[0]!.value !== 'button') {
                    return;
                }

                if (!node.arguments[1] || node.arguments[1].type !== 'ObjectExpression') {
                    reportMissing(node);
                    return;
                }

                const props = node.arguments[1].properties;
                const typeProp = props.find(
                    (prop) => 'key' in prop && prop.key && 'name' in prop.key && prop.key.name === 'type',
                );

                if (!typeProp) {
                    reportMissing(node);
                    return;
                }

                checkExpression(node, ('value' in typeProp ? typeProp.value : undefined)!);
            },
        };
    },
};

export default rule;
