/**
 * @file Rule to disallow a negated condition
 * @author Alberto Rodríguez
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow negated conditions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-negated-condition',
        },

        schema: [],

        messages: {
            unexpectedNegated: 'Unexpected negated condition.',
        },
    },

    create(context) {
        /**
         * Determines if a given node is an if-else without a condition on the else
         * @param node The node to check.
         * @returns True if the node has an else without an if.
         */
        function hasElseWithoutCondition(node: Node<'IfStatement'>) {
            return node.alternate && node.alternate.type !== 'IfStatement';
        }

        /**
         * Determines if a given node is a negated unary expression
         * @param test The test object to check.
         * @returns True if the node is a negated unary expression.
         */
        function isNegatedUnaryExpression(test: Node) {
            return test.type === 'UnaryExpression' && test.operator === '!';
        }

        /**
         * Determines if a given node is a negated binary expression
         * @param test The test to check.
         * @returns True if the node is a negated binary expression.
         */
        function isNegatedBinaryExpression(test: Node) {
            return (
                test.type === 'BinaryExpression'
                && (test.operator === '!=' || test.operator === '!==')
            );
        }

        /**
         * Determines if a given node has a negated if expression
         * @param node The node to check.
         * @returns True if the node has a negated if expression.
         */
        function isNegatedIf(node: Node<'ConditionalExpression' | 'IfStatement'>) {
            return isNegatedUnaryExpression(node.test) || isNegatedBinaryExpression(node.test);
        }

        return {
            IfStatement(node: Node<'IfStatement'>) {
                if (!hasElseWithoutCondition(node)) {
                    return;
                }

                if (isNegatedIf(node)) {
                    context.report({
                        node,
                        messageId: 'unexpectedNegated',
                    });
                }
            },
            ConditionalExpression(node: Node<'ConditionalExpression'>) {
                if (isNegatedIf(node)) {
                    context.report({
                        node,
                        messageId: 'unexpectedNegated',
                    });
                }
            },
        };
    },
};

export default rule;
