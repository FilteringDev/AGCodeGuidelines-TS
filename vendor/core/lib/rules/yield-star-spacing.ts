/**
 * @file Rule to check the spacing around the * in yield* expressions.
 * @author Bryan Smith
 * @deprecated in ESLint v8.53.0
 */
import type {
    Fixer, LegacyRule, Node, Token,
} from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [('before' | 'after' | 'both' | 'neither' | { before?: boolean; after?: boolean })?]
> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Require or disallow spacing around the `*` in `yield*` expressions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/yield-star-spacing',
        },

        fixable: 'whitespace',

        schema: [
            {
                oneOf: [
                    {
                        enum: ['before', 'after', 'both', 'neither'],
                    },
                    {
                        type: 'object',
                        properties: {
                            before: { type: 'boolean' },
                            after: { type: 'boolean' },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        ],
        messages: {
            missingBefore: 'Missing space before *.',
            missingAfter: 'Missing space after *.',
            unexpectedBefore: 'Unexpected space before *.',
            unexpectedAfter: 'Unexpected space after *.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        const mode = (function visitValue(
            option: string | { before?: boolean; after?: boolean } | undefined,
        ) {
            if (!option || typeof option === 'string') {
                return {
                    before: { before: true, after: false },
                    after: { before: false, after: true },
                    both: { before: true, after: true },
                    neither: { before: false, after: false },
                }[option || 'after'];
            }
            return option;
        }(context.options[0]));

        /**
         * Checks the spacing between two tokens before or after the star token.
         * @param side Either "before" or "after".
         * @param leftToken `function` keyword token if side is "before", or
         *     star token if side is "after".
         * @param rightToken Star token if side is "before", or identifier
         *     token if side is "after".
         */
        function checkSpacing(side: 'before' | 'after', leftToken: Token, rightToken: Token) {
            if (sourceCode.isSpaceBetweenTokens(leftToken, rightToken) !== mode![side]) {
                const after = leftToken.value === '*';
                const spaceRequired = mode![side];
                const node = after ? leftToken : rightToken;
                let messageId = '';

                if (spaceRequired) {
                    messageId = side === 'before' ? 'missingBefore' : 'missingAfter';
                } else {
                    messageId = side === 'before' ? 'unexpectedBefore' : 'unexpectedAfter';
                }

                context.report({
                    node,
                    messageId,
                    fix(fixer: Fixer) {
                        if (spaceRequired) {
                            if (after) {
                                return fixer.insertTextAfter(node, ' ');
                            }
                            return fixer.insertTextBefore(node, ' ');
                        }
                        return fixer.removeRange([leftToken.range[1], rightToken.range[0]]);
                    },
                });
            }
        }

        /**
         * Enforces the spacing around the star if node is a yield* expression.
         * @param node A yield expression node.
         */
        function checkExpression(node: Node<'YieldExpression'>) {
            if (!node.delegate) {
                return;
            }

            const tokens = sourceCode.getFirstTokens(node, 3);
            const yieldToken = tokens[0];
            const starToken = tokens[1];
            const nextToken = tokens[2];

            checkSpacing('before', yieldToken!, starToken!);
            checkSpacing('after', starToken!, nextToken!);
        }

        return {
            YieldExpression: checkExpression,
        };
    },
};

export default rule;
