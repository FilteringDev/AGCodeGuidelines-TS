/**
 * @file Rule to flag when deleting variables
 * @author Ilya Volodin
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow deleting variables',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-delete-var',
        },

        schema: [],

        messages: {
            unexpected: 'Variables should not be deleted.',
        },
    },

    create(context) {
        return {
            UnaryExpression(node: Node<'UnaryExpression'>) {
                if (node.operator === 'delete' && node.argument.type === 'Identifier') {
                    context.report({ node, messageId: 'unexpected' });
                }
            },
        };
    },
};

export default rule;
