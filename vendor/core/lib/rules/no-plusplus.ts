/**
 * @file Rule to flag use of unary increment and decrement operators.
 * @author Ian Christian Myers
 * @author Brody McKee (github.com/mrmckeb)
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Determines whether the given node is the update node of a `ForStatement`.
 * @param node The node to check.
 * @returns `true` if the node is `ForStatement` update.
 */
function isForStatementUpdate(node: Node<'SequenceExpression' | 'UpdateExpression'>) {
    const { parent } = node;

    return parent.type === 'ForStatement' && parent.update === node;
}

/**
 * Determines whether the given node is considered to be a for loop "afterthought" by the logic of this rule.
 * In particular, it returns `true` if the given node is either:
 *   - The update node of a `ForStatement`: for (;; i++) {}
 *   - An operand of a sequence expression that is the update node: for (;; foo(), i++) {}
 *   - An operand of a sequence expression that is child of another sequence expression, etc.,
 *     up to the sequence expression that is the update node: for (;; foo(), (bar(), (baz(), i++))) {}
 * @param node The node to check.
 * @returns `true` if the node is a for loop afterthought.
 */
function isForLoopAfterthought(node: Node<'SequenceExpression' | 'UpdateExpression'>) {
    const { parent } = node;

    if (parent.type === 'SequenceExpression') {
        return isForLoopAfterthought(parent);
    }

    return isForStatementUpdate(node);
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ allowForLoopAfterthoughts?: boolean }?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow the unary operators `++` and `--`',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-plusplus',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    allowForLoopAfterthoughts: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            unexpectedUnaryOp: "Unary operator '{{operator}}' used.",
        },
    },

    create(context) {
        const config = context.options[0];
        let allowForLoopAfterthoughts = false;

        if (typeof config === 'object') {
            allowForLoopAfterthoughts = config.allowForLoopAfterthoughts === true;
        }

        return {
            UpdateExpression(node: Node<'UpdateExpression'>) {
                if (allowForLoopAfterthoughts && isForLoopAfterthought(node)) {
                    return;
                }

                context.report({
                    node,
                    messageId: 'unexpectedUnaryOp',
                    data: {
                        operator: node.operator,
                    },
                });
            },
        };
    },
};

export default rule;
