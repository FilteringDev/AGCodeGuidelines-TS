/**
 * @file Rule to flag use of comma operator
 * @author Brandon Mills
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const DEFAULT_OPTIONS = {
    allowInParentheses: true,
};

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ allowInParentheses?: boolean }?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow comma operators',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-sequences',
        },

        schema: [
            {
                properties: {
                    allowInParentheses: {
                        type: 'boolean',
                        default: true,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            unexpectedCommaExpression: 'Unexpected use of comma operator.',
        },
    },

    create(context) {
        const options = { ...DEFAULT_OPTIONS, ...context.options[0] };
        const { sourceCode } = context;

        /**
         * Parts of the grammar that are required to have parens.
         */
        const parenthesized: Record<string, string> = {
            DoWhileStatement: 'test',
            IfStatement: 'test',
            SwitchStatement: 'discriminant',
            WhileStatement: 'test',
            WithStatement: 'object',
            ArrowFunctionExpression: 'body',

            /**
             * Omitting CallExpression - commas are parsed as argument separators
             * Omitting NewExpression - commas are parsed as argument separators
             * Omitting ForInStatement - parts aren't individually parenthesised
             * Omitting ForStatement - parts aren't individually parenthesised
             */
        };

        /**
         * Determines whether a node is required by the grammar to be wrapped in
         * parens, e.g. the test of an if statement.
         * @param node The AST node
         * @returns True if parens around node belong to parent node.
         */
        function requiresExtraParens(node: Node<'SequenceExpression'>) {
            return (
                node.parent
                && parenthesized[node.parent.type]
                && node === Reflect.get(node.parent, parenthesized[node.parent.type]!)
            );
        }

        /**
         * Check if a node is wrapped in parens.
         * @param node The AST node
         * @returns True if the node has a paren on each side.
         */
        function isParenthesised(node: Node<'SequenceExpression'>) {
            return astUtils.isParenthesised(sourceCode, node);
        }

        /**
         * Check if a node is wrapped in two levels of parens.
         * @param node The AST node
         * @returns True if two parens surround the node on each side.
         */
        function isParenthesisedTwice(node: Node<'SequenceExpression'>) {
            const previousToken = sourceCode.getTokenBefore(node, 1);
            const nextToken = sourceCode.getTokenAfter(node, 1);

            return (
                isParenthesised(node)
                && previousToken
                && nextToken
                && astUtils.isOpeningParenToken(previousToken)
                && previousToken.range[1] <= node.range[0]
                && astUtils.isClosingParenToken(nextToken)
                && nextToken.range[0] >= node.range[1]
            );
        }

        return {
            SequenceExpression(node: Node<'SequenceExpression'>) {
                // Always allow sequences in for statement update
                if (
                    node.parent.type === 'ForStatement'
                    && (node === node.parent.init || node === node.parent.update)
                ) {
                    return;
                }

                // Wrapping a sequence in extra parens indicates intent
                if (options.allowInParentheses) {
                    if (requiresExtraParens(node)) {
                        if (isParenthesisedTwice(node)) {
                            return;
                        }
                    } else if (isParenthesised(node)) {
                        return;
                    }
                }

                const firstCommaToken = sourceCode.getTokenAfter(
                    node.expressions[0]!,
                    astUtils.isCommaToken,
                );

                context.report({
                    node,
                    loc: firstCommaToken!.loc,
                    messageId: 'unexpectedCommaExpression',
                });
            },
        };
    },
};

export default rule;
