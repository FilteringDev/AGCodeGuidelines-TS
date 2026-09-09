/**
 * @file Rule to disallow an empty pattern
 * @author Alberto Rodríguez
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ allowObjectPatternsAsParameters?: boolean }?]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow empty destructuring patterns',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-empty-pattern',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    allowObjectPatternsAsParameters: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            unexpected: 'Unexpected empty {{type}} pattern.',
        },
    },

    create(context) {
        const options = context.options[0] || {};
        const allowObjectPatternsAsParameters = options.allowObjectPatternsAsParameters || false;

        return {
            ObjectPattern(node: Node<'ObjectPattern'>) {
                if (node.properties.length > 0) {
                    return;
                }

                // Allow {} and {} = {} empty object patterns as parameters when allowObjectPatternsAsParameters is
                // true
                if (
                    allowObjectPatternsAsParameters
                    && (astUtils.isFunction(node.parent)
                        || (node.parent.type === 'AssignmentPattern'
                            && astUtils.isFunction(node.parent.parent)
                            && node.parent.right.type === 'ObjectExpression'
                            && node.parent.right.properties.length === 0))
                ) {
                    return;
                }

                context.report({ node, messageId: 'unexpected', data: { type: 'object' } });
            },
            ArrayPattern(node: Node<'ArrayPattern'>) {
                if (node.elements.length === 0) {
                    context.report({ node, messageId: 'unexpected', data: { type: 'array' } });
                }
            },
        };
    },
};

export default rule;
