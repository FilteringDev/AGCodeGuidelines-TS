/**
 * @file Rule to disallow use of void operator.
 * @author Mike Sidorov
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ allowAsStatement?: boolean }?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow `void` operators',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-void',
        },

        messages: {
            noVoid: "Expected 'undefined' and instead saw 'void'.",
        },

        schema: [
            {
                type: 'object',
                properties: {
                    allowAsStatement: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const allowAsStatement = context.options[0] && context.options[0].allowAsStatement;

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            'UnaryExpression[operator="void"]': function onUnaryExpressionOperatorVoid(
                node: Node<'UnaryExpression'>,
            ) {
                if (
                    allowAsStatement
                    && node.parent
                    && node.parent.type === 'ExpressionStatement'
                ) {
                    return;
                }
                context.report({
                    node,
                    messageId: 'noVoid',
                });
            },
        };
    },
};

export default rule;
