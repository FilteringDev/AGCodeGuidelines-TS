/**
 * @file enforce the location of arrow function bodies
 * @author Sharmila Jesupaul
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import type { Fixer, LegacyRule, Node } from '../../../types';

const { isCommentToken, isNotOpeningParenToken } = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------
const rule: LegacyRule<[('beside' | 'below')?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Enforce the location of arrow function bodies',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/implicit-arrow-linebreak',
        },

        fixable: 'whitespace',

        schema: [
            {
                enum: ['beside', 'below'],
            },
        ],
        messages: {
            expected: 'Expected a linebreak before this expression.',
            unexpected: 'Expected no linebreak before this expression.',
        },
    },

    create(context) {
        const { sourceCode } = context;
        const option = context.options[0] || 'beside';

        /**
         * Validates the location of an arrow function body
         * @param node The arrow function body
         */
        function validateExpression(node: Node<'ArrowFunctionExpression'>) {
            if (node.body.type === 'BlockStatement') {
                return;
            }

            const arrowToken = sourceCode.getTokenBefore(node.body, isNotOpeningParenToken);
            const firstTokenOfBody = sourceCode.getTokenAfter(arrowToken!);

            if (
                arrowToken!.loc.end.line === firstTokenOfBody!.loc.start.line
                && option === 'below'
            ) {
                context.report({
                    node: firstTokenOfBody!,
                    messageId: 'expected',
                    fix: (fixer: Fixer) => fixer.insertTextBefore(firstTokenOfBody!, '\n'),
                });
            } else if (
                arrowToken!.loc.end.line !== firstTokenOfBody!.loc.start.line
                && option === 'beside'
            ) {
                context.report({
                    node: firstTokenOfBody!,
                    messageId: 'unexpected',
                    fix(fixer: Fixer) {
                        if (
                            sourceCode.getFirstTokenBetween(arrowToken!, firstTokenOfBody!, {
                                includeComments: true,
                                filter: isCommentToken,
                            })
                        ) {
                            return null;
                        }

                        return fixer.replaceTextRange(
                            [arrowToken!.range[1], firstTokenOfBody!.range[0]],
                            ' ',
                        );
                    },
                });
            }
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------
        return {
            ArrowFunctionExpression: (node: Node<'ArrowFunctionExpression'>) => validateExpression(node),
        };
    },
};

export default rule;
