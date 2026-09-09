/**
 * @file Rule to flag comparison where left part is the same as the right
 * part.
 * @author Ilya Volodin
 */
import type { LegacyRule, Node, Token } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow comparisons where both sides are exactly the same',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-self-compare',
        },

        schema: [],

        messages: {
            comparingToSelf: 'Comparing to itself is potentially pointless.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * Determines whether two nodes are composed of the same tokens.
         * @param nodeA The first node
         * @param nodeB The second node
         * @returns true if the nodes have identical token representations
         */
        function hasSameTokens(nodeA: Node, nodeB: Node) {
            const tokensA = sourceCode.getTokens(nodeA);
            const tokensB = sourceCode.getTokens(nodeB);

            return (
                tokensA.length === tokensB.length
                && tokensA.every(
                    (token: Token, index) => token.type === tokensB![index]!.type
                        && token.value === tokensB![index]!.value,
                )
            );
        }

        return {
            BinaryExpression(node: Node<'BinaryExpression'>) {
                const operators = new Set(['===', '==', '!==', '!=', '>', '<', '>=', '<=']);

                if (operators.has(node.operator) && hasSameTokens(node.left, node.right)) {
                    context.report({ node, messageId: 'comparingToSelf' });
                }
            },
        };
    },
};

export default rule;
