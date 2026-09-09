/**
 * @file Validates newlines before and after dots
 * @author Greg Cochard
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import type { Fixer, LegacyRule, Node } from '../../../types';

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[('object' | 'property')?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Enforce consistent newlines before and after dots',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/dot-location',
        },

        schema: [
            {
                enum: ['object', 'property'],
            },
        ],

        fixable: 'code',

        messages: {
            expectedDotAfterObject: 'Expected dot to be on same line as object.',
            expectedDotBeforeProperty: 'Expected dot to be on same line as property.',
        },
    },

    create(context) {
        const config = context.options[0];

        // default to onObject if no preference is passed
        const onObject = config === 'object' || !config;

        const { sourceCode } = context;

        /**
         * Reports if the dot between object and property is on the correct location.
         * @param node The `MemberExpression` node.
         */
        function checkDotLocation(node: Node<'MemberExpression'>) {
            const { property } = node;
            const dotToken = sourceCode.getTokenBefore(property);

            if (onObject) {
                // `obj` expression can be parenthesized, but those paren tokens are not a part of the `obj` node.
                const tokenBeforeDot = sourceCode.getTokenBefore(dotToken!);

                if (!astUtils.isTokenOnSameLine(tokenBeforeDot!, dotToken!)) {
                    context.report({
                        node,
                        loc: dotToken!.loc,
                        messageId: 'expectedDotAfterObject',
                        * fix(fixer: Fixer) {
                            if (
                                dotToken!.value.startsWith('.')
                                && astUtils.isDecimalIntegerNumericToken(tokenBeforeDot!)
                            ) {
                                yield fixer.insertTextAfter(
                                    tokenBeforeDot!,
                                    ` ${dotToken!.value}`,
                                );
                            } else {
                                yield fixer.insertTextAfter(tokenBeforeDot!, dotToken!.value);
                            }
                            yield fixer.remove(dotToken!);
                        },
                    });
                }
            } else if (!astUtils.isTokenOnSameLine(dotToken!, property)) {
                context.report({
                    node,
                    loc: dotToken!.loc,
                    messageId: 'expectedDotBeforeProperty',
                    * fix(fixer: Fixer) {
                        yield fixer.remove(dotToken!);
                        yield fixer.insertTextBefore(property, dotToken!.value);
                    },
                });
            }
        }

        /**
         * Checks the spacing of the dot within a member expression.
         * @param node The node to check.
         */
        function checkNode(node: Node<'MemberExpression'>) {
            if (!node.computed) {
                checkDotLocation(node);
            }
        }

        return {
            MemberExpression: checkNode,
        };
    },
};

export default rule;
