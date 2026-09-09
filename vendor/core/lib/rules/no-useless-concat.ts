/**
 * @file disallow unnecessary concatenation of template strings
 * @author Henry Zhu
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node, Token } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks whether or not a given node is a concatenation.
 * @param node A node to check.
 * @returns `true` if the node is a concatenation.
 */
function isConcatenation(node: Node): node is Node<'BinaryExpression'> {
    return node.type === 'BinaryExpression' && node.operator === '+';
}

/**
 * Checks if the given token is a `+` token or not.
 * @param token The token to check.
 * @returns `true` if the token is a `+` token.
 */
function isConcatOperatorToken(token: Token) {
    return token.value === '+' && token.type === 'Punctuator';
}

/**
 * Get's the right most node on the left side of a BinaryExpression with + operator.
 * @param node A BinaryExpression node to check.
 * @returns node
 */
function getLeft(node: Node<'BinaryExpression'>) {
    let { left } = node;

    while (isConcatenation(left)) {
        left = left.right;
    }
    return left;
}

/**
 * Get's the left most node on the right side of a BinaryExpression with + operator.
 * @param node A BinaryExpression node to check.
 * @returns node
 */
function getRight(node: Node<'BinaryExpression'>) {
    let { right }: { right: Node } = node;

    while (isConcatenation(right)) {
        right = right.left;
    }
    return right;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow unnecessary concatenation of literals or template literals',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-useless-concat',
        },

        schema: [],

        messages: {
            unexpectedConcat: 'Unexpected string concatenation of literals.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        return {
            BinaryExpression(node: Node<'BinaryExpression'>) {
                // check if not concatenation
                if (node.operator !== '+') {
                    return;
                }

                // account for the `foo + "a" + "b"` case
                const left = getLeft(node);
                const right = getRight(node);

                if (
                    astUtils.isStringLiteral(left)
                    && astUtils.isStringLiteral(right)
                    && astUtils.isTokenOnSameLine(left, right)
                ) {
                    const operatorToken = sourceCode.getFirstTokenBetween(
                        left,
                        right,
                        isConcatOperatorToken,
                    );

                    context.report({
                        node,
                        loc: operatorToken!.loc,
                        messageId: 'unexpectedConcat',
                    });
                }
            },
        };
    },
};

export default rule;
