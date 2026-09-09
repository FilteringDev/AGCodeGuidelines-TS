/**
 * @file Rule to flag unsafe statements in finally block
 * @author Onur Temizkan
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const SENTINEL_NODE_TYPE_RETURN_THROW = /^(?:Program|(?:Function|Class)(?:Declaration|Expression)|ArrowFunctionExpression)$/u;
const SENTINEL_NODE_TYPE_BREAK = /^(?:Program|(?:Function|Class)(?:Declaration|Expression)|ArrowFunctionExpression|DoWhileStatement|WhileStatement|ForOfStatement|ForInStatement|ForStatement|SwitchStatement)$/u;
const SENTINEL_NODE_TYPE_CONTINUE = /^(?:Program|(?:Function|Class)(?:Declaration|Expression)|ArrowFunctionExpression|DoWhileStatement|WhileStatement|ForOfStatement|ForInStatement|ForStatement)$/u;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow control flow statements in `finally` blocks',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-unsafe-finally',
        },

        schema: [],

        messages: {
            unsafeUsage: 'Unsafe usage of {{nodeType}}.',
        },
    },
    create(context) {
        /**
         * Checks if the node is the finalizer of a TryStatement
         * @param node node to check.
         * @returns - true if the node is the finalizer of a TryStatement
         */
        function isFinallyBlock(node: Node) {
            return node.parent.type === 'TryStatement' && node.parent.finalizer === node;
        }

        /**
         * Climbs up the tree if the node is not a sentinel node
         * @param node node to check.
         * @param label label of the break or continue statement
         * @returns - return whether the node is a finally block or a sentinel node
         */
        function isInFinallyBlock(
            node: Node<
                'BreakStatement' | 'ContinueStatement' | 'ReturnStatement' | 'ThrowStatement'
            >,
            label: Node<'Identifier'> | null | undefined,
        ) {
            let labelInside = false;
            let sentinelNodeType;

            if (node.type === 'BreakStatement' && !node.label) {
                sentinelNodeType = SENTINEL_NODE_TYPE_BREAK;
            } else if (node.type === 'ContinueStatement') {
                sentinelNodeType = SENTINEL_NODE_TYPE_CONTINUE;
            } else {
                sentinelNodeType = SENTINEL_NODE_TYPE_RETURN_THROW;
            }

            for (
                let currentNode: Node = node;
                currentNode && !sentinelNodeType.test(currentNode.type);
                currentNode = currentNode.parent
            ) {
                if (
                    'label' in currentNode.parent
                    && currentNode.parent.label
                    && label
                    && currentNode.parent.label.name === label.name
                ) {
                    labelInside = true;
                }
                if (isFinallyBlock(currentNode)) {
                    if (label && labelInside) {
                        return false;
                    }
                    return true;
                }
            }
            return false;
        }

        /**
         * Checks whether the possibly-unsafe statement is inside a finally block.
         * @param node node to check.
         */
        function check(
            node: Node<
                'BreakStatement' | 'ContinueStatement' | 'ReturnStatement' | 'ThrowStatement'
            >,
        ) {
            if (isInFinallyBlock(node, 'label' in node ? node.label : undefined)) {
                context.report({
                    messageId: 'unsafeUsage',
                    data: {
                        nodeType: node.type,
                    },
                    node,
                });
            }
        }

        return {
            ReturnStatement: check,
            ThrowStatement: check,
            BreakStatement: check,
            ContinueStatement: check,
        };
    },
};

export default rule;
