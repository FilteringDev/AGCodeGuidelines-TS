/**
 * @file The rule should warn against code that tries to compare against -0.
 * @author Aladdin-ADD <hh_2013@foxmail.com>
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow comparing against -0',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-compare-neg-zero',
        },

        fixable: null,
        schema: [],

        messages: {
            unexpected: "Do not use the '{{operator}}' operator to compare against -0.",
        },
    },

    create(context) {
        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Checks a given node is -0
         * @param node A node to check.
         * @returns `true` if the node is -0.
         */
        function isNegZero(node: Node) {
            return (
                node.type === 'UnaryExpression'
                && node.operator === '-'
                && node.argument.type === 'Literal'
                && node.argument.value === 0
            );
        }
        const OPERATORS_TO_CHECK = new Set(['>', '>=', '<', '<=', '==', '===', '!=', '!==']);

        return {
            BinaryExpression(node: Node<'BinaryExpression'>) {
                if (OPERATORS_TO_CHECK.has(node.operator)) {
                    if (isNegZero(node.left) || isNegZero(node.right)) {
                        context.report({
                            node,
                            messageId: 'unexpected',
                            data: { operator: node.operator },
                        });
                    }
                }
            },
        };
    },
};

export default rule;
