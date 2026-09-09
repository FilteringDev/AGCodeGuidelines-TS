/**
 * @file Rule to flag when IIFE is not wrapped in parens
 * @author Ilya Volodin
 * @deprecated in ESLint v8.53.0
 */
import dependency1 from '../../compat/eslint-utils';
import dependency0 from './utils/ast-utils';
import type { Fixer, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;
const eslintUtils = dependency1;

//----------------------------------------------------------------------
// Helpers
//----------------------------------------------------------------------

/**
 * Check if the given node is callee of a `NewExpression` node
 * @param node node to check
 * @returns True if the node is callee of a `NewExpression` node
 */
function isCalleeOfNewExpression(node: Node<'CallExpression'>) {
    const maybeCallee = node.parent.type === 'ChainExpression' ? node.parent : node;

    return (
        maybeCallee.parent.type === 'NewExpression' && maybeCallee.parent.callee === maybeCallee
    );
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [('outside' | 'inside' | 'any')?, { functionPrototypeMethods?: boolean }?]
> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Require parentheses around immediate `function` invocations',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/wrap-iife',
        },

        schema: [
            {
                enum: ['outside', 'inside', 'any'],
            },
            {
                type: 'object',
                properties: {
                    functionPrototypeMethods: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        fixable: 'code',
        messages: {
            wrapInvocation: 'Wrap an immediate function invocation in parentheses.',
            wrapExpression: 'Wrap only the function expression in parens.',
            moveInvocation: 'Move the invocation into the parens that contain the function.',
        },
    },

    create(context) {
        const style = context.options[0] || 'outside';
        const includeFunctionPrototypeMethods = context.options[1] && context.options[1].functionPrototypeMethods;

        const { sourceCode } = context;

        /**
         * Check if the node is wrapped in any (). All parens count: grouping parens and parens for constructs such
         * as if()
         * @param node node to evaluate
         * @returns True if it is wrapped in any parens
         */
        function isWrappedInAnyParens(node: Node<'CallExpression' | 'FunctionExpression'>) {
            return astUtils.isParenthesised(sourceCode, node);
        }

        /**
         * Check if the node is wrapped in grouping (). Parens for constructs such as if() don't count
         * @param node node to evaluate
         * @returns True if it is wrapped in grouping parens
         */
        function isWrappedInGroupingParens(node: Node<'CallExpression'>) {
            return eslintUtils.isParenthesized(1, node, sourceCode);
        }

        /**
         * Get the function node from an IIFE
         * @param node node to evaluate
         * @returns node that is the function expression of the given IIFE, or null if none exist
         */
        function getFunctionNodeFromIIFE(node: Node<'CallExpression'>) {
            const callee = astUtils.skipChainExpression(node.callee);

            if (callee.type === 'FunctionExpression') {
                return callee;
            }

            if (
                includeFunctionPrototypeMethods
                && callee.type === 'MemberExpression'
                && callee.object.type === 'FunctionExpression'
                && (astUtils.getStaticPropertyName(callee) === 'call'
                    || astUtils.getStaticPropertyName(callee) === 'apply')
            ) {
                return callee.object;
            }

            return null;
        }

        return {
            CallExpression(node: Node<'CallExpression'>) {
                const innerNode = getFunctionNodeFromIIFE(node);

                if (!innerNode) {
                    return;
                }

                const isCallExpressionWrapped = isWrappedInAnyParens(node);
                const isFunctionExpressionWrapped = isWrappedInAnyParens(innerNode);

                if (!isCallExpressionWrapped && !isFunctionExpressionWrapped) {
                    context.report({
                        node,
                        messageId: 'wrapInvocation',
                        fix(fixer: Fixer) {
                            const nodeToSurround = style === 'inside' ? innerNode : node;

                            return fixer.replaceText(
                                nodeToSurround,
                                `(${sourceCode.getText(nodeToSurround)})`,
                            );
                        },
                    });
                } else if (style === 'inside' && !isFunctionExpressionWrapped) {
                    context.report({
                        node,
                        messageId: 'wrapExpression',
                        fix(fixer: Fixer) {
                            // The outer call expression will always be wrapped at this point.

                            if (
                                isWrappedInGroupingParens(node)
                                && !isCalleeOfNewExpression(node)
                            ) {
                                /**
                                 * Parenthesize the function expression and remove unnecessary grouping parens
                                 * around the call expression.
                                 * Replace the range between the end of the function expression and the end of the
                                 * call expression.
                                 * for example, in `(function(foo) {}(bar))`, the range `(bar))` should get replaced
                                 * with `)(bar)`.
                                 */

                                const parenAfter = sourceCode.getTokenAfter(node);

                                return fixer.replaceTextRange(
                                    [innerNode.range[1], parenAfter!.range[1]],
                                    `)${sourceCode.getText().slice(innerNode.range[1], parenAfter!.range[0])}`,
                                );
                            }

                            /**
                             * Call expression is wrapped in mandatory parens such as if(), or in necessary grouping
                             * parens.
                             * These parens cannot be removed, so just parenthesize the function expression.
                             */

                            return fixer.replaceText(
                                innerNode,
                                `(${sourceCode.getText(innerNode)})`,
                            );
                        },
                    });
                } else if (style === 'outside' && !isCallExpressionWrapped) {
                    context.report({
                        node,
                        messageId: 'moveInvocation',
                        fix(fixer: Fixer) {
                            /**
                             * The inner function expression will always be wrapped at this point.
                             * It's only necessary to replace the range between the end of the function expression
                             * and the call expression. For example, in `(function(foo) {})(bar)`, the range
                             * `)(bar)`
                             * should get replaced with `(bar))`.
                             */
                            const parenAfter = sourceCode.getTokenAfter(innerNode);

                            return fixer.replaceTextRange(
                                [parenAfter!.range[0], node.range[1]],
                                `${sourceCode.getText().slice(parenAfter!.range[1], node.range[1])})`,
                            );
                        },
                    });
                }
            },
        };
    },
};

export default rule;
