/**
 * @file Rule to flag use of ternary operators.
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
            description: 'Disallow ternary operators',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-ternary',
        },

        schema: [],

        messages: {
            noTernaryOperator: 'Ternary operator used.',
        },
    },

    create(context) {
        return {
            ConditionalExpression(node: Node<'ConditionalExpression'>) {
                context.report({ node, messageId: 'noTernaryOperator' });
            },
        };
    },
};

export default rule;
