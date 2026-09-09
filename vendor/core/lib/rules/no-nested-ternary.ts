/**
 * @file Rule to flag nested ternary expressions
 * @author Ian Christian Myers
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow nested ternary expressions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-nested-ternary',
        },

        schema: [],

        messages: {
            noNestedTernary: 'Do not nest ternary expressions.',
        },
    },

    create(context) {
        return {
            ConditionalExpression(node: Node<'ConditionalExpression'>) {
                if (
                    node.alternate.type === 'ConditionalExpression'
                    || node.consequent.type === 'ConditionalExpression'
                ) {
                    context.report({
                        node,
                        messageId: 'noNestedTernary',
                    });
                }
            },
        };
    },
};

export default rule;
