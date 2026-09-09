/**
 * @file Rule to disallow whitespace before properties
 * @author Kai Cataldo
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import type {
    Fixer, LegacyRule, Node, Token,
} from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Disallow whitespace before properties',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-whitespace-before-property',
        },

        fixable: 'whitespace',
        schema: [],

        messages: {
            unexpectedWhitespace: 'Unexpected whitespace before property {{propName}}.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Reports whitespace before property token
         * @param node the node to report in the event of an error
         * @param leftToken the left token
         * @param rightToken the right token
         */
        function reportError(
            node: Node<'MemberExpression'>,
            leftToken: Token,
            rightToken: Token,
        ) {
            context.report({
                node,
                messageId: 'unexpectedWhitespace',
                data: {
                    propName: sourceCode.getText(node.property),
                },
                fix(fixer: Fixer) {
                    let replacementText = '';

                    if (
                        !node.computed
                        && !node.optional
                        && astUtils.isDecimalInteger(node.object)
                    ) {
                        /**
                         * If the object is a number literal, fixing it to something like 5.toString() would cause a
                         * SyntaxError.
                         * Don't fix this case.
                         */
                        return null;
                    }

                    // Don't fix if comments exist.
                    if (sourceCode.commentsExistBetween(leftToken, rightToken)) {
                        return null;
                    }

                    if (node.optional) {
                        replacementText = '?.';
                    } else if (!node.computed) {
                        replacementText = '.';
                    }

                    return fixer.replaceTextRange(
                        [leftToken.range[1], rightToken.range[0]],
                        replacementText,
                    );
                },
            });
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            MemberExpression(node: Node<'MemberExpression'>) {
                let rightToken;
                let leftToken;

                if (!astUtils.isTokenOnSameLine(node.object, node.property)) {
                    return;
                }

                if (node.computed) {
                    rightToken = sourceCode.getTokenBefore(
                        node.property,
                        astUtils.isOpeningBracketToken,
                    );
                    leftToken = sourceCode.getTokenBefore(rightToken!, node.optional ? 1 : 0);
                } else {
                    rightToken = sourceCode.getFirstToken(node.property);
                    leftToken = sourceCode.getTokenBefore(rightToken, 1);
                }

                if (sourceCode.isSpaceBetweenTokens(leftToken!, rightToken!)) {
                    reportError(node, leftToken!, rightToken!);
                }
            },
        };
    },
};

export default rule;
