import type {
    Token, Fixer, LegacyRule, Node,
} from '../../../types';
/**
 * @file Rule to define spacing before/after arrow function's arrow.
 * @author Jxck
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const legacyRule: LegacyRule<[{ before?: boolean; after?: boolean }?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description:
                'Enforce consistent spacing before and after the arrow in arrow functions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/arrow-spacing',
        },

        fixable: 'whitespace',

        schema: [
            {
                type: 'object',
                properties: {
                    before: {
                        type: 'boolean',
                        default: true,
                    },
                    after: {
                        type: 'boolean',
                        default: true,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            expectedBefore: 'Missing space before =>.',
            unexpectedBefore: 'Unexpected space before =>.',

            expectedAfter: 'Missing space after =>.',
            unexpectedAfter: 'Unexpected space after =>.',
        },
    },

    create(context) {
        // merge rules with default
        const rule = { ...context.options[0] };

        rule.before = rule.before !== false;
        rule.after = rule.after !== false;

        const { sourceCode } = context;

        /**
         * Get tokens of arrow(`=>`) and before/after arrow.
         * @param node The arrow function node.
         * @returns Tokens of arrow and before/after arrow.
         */
        function getTokens(node: Node<'ArrowFunctionExpression'>) {
            const arrow = sourceCode.getTokenBefore(node.body, astUtils.isArrowToken);

            return {
                before: sourceCode.getTokenBefore(arrow!),
                arrow,
                after: sourceCode.getTokenAfter(arrow!),
            };
        }

        /**
         * Count spaces before/after arrow(`=>`) token.
         * @param tokens Tokens before/after arrow.
         * @param tokens.before The before value.
         * @param tokens.arrow The arrow value.
         * @param tokens.after The after value.
         * @returns count of space before/after arrow.
         */
        function countSpaces(tokens: {
            before: Token | null;
            arrow: Token | null;
            after: Token | null;
        }) {
            const before = tokens.arrow!.range[0] - tokens.before!.range[1];
            const after = tokens.after!.range[0] - tokens.arrow!.range[1];

            return { before, after };
        }

        /**
         * Determines whether space(s) before after arrow(`=>`) is satisfy rule.
         * if before/after value is `true`, there should be space(s).
         * if before/after value is `false`, there should be no space.
         * @param node The arrow function node.
         */
        function spaces(node: Node<'ArrowFunctionExpression'>) {
            const tokens = getTokens(node);
            const countSpace = countSpaces(tokens);

            if (rule.before) {
                // should be space(s) before arrow
                if (countSpace.before === 0) {
                    context.report({
                        node: tokens.before!,
                        messageId: 'expectedBefore',
                        fix(fixer: Fixer) {
                            return fixer.insertTextBefore(tokens.arrow!, ' ');
                        },
                    });
                }
            } else if (countSpace.before > 0) {
                // should be no space before arrow
                context.report({
                    node: tokens.before!,
                    messageId: 'unexpectedBefore',
                    fix(fixer: Fixer) {
                        return fixer.removeRange([
                            tokens!.before!.range[1],
                            tokens!.arrow!.range[0],
                        ]);
                    },
                });
            }

            if (rule.after) {
                // should be space(s) after arrow
                if (countSpace.after === 0) {
                    context.report({
                        node: tokens.after!,
                        messageId: 'expectedAfter',
                        fix(fixer: Fixer) {
                            return fixer.insertTextAfter(tokens.arrow!, ' ');
                        },
                    });
                }
            } else if (countSpace.after > 0) {
                // should be no space after arrow
                context.report({
                    node: tokens.after!,
                    messageId: 'unexpectedAfter',
                    fix(fixer: Fixer) {
                        return fixer.removeRange([
                            tokens!.arrow!.range[1],
                            tokens!.after!.range[0],
                        ]);
                    },
                });
            }
        }

        return {
            ArrowFunctionExpression: spaces,
        };
    },
};

export default legacyRule;
