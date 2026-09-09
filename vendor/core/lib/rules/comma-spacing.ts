/**
 * @file Comma spacing - validates spacing before and after comma
 * @author Vignesh Anand aka vegetableman.
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import type {
    Fixer, LegacyRule, Node, Token,
} from '../../../types';

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ before?: boolean; after?: boolean }?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Enforce consistent spacing before and after commas',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/comma-spacing',
        },

        fixable: 'whitespace',

        schema: [
            {
                type: 'object',
                properties: {
                    before: {
                        type: 'boolean',
                        default: false,
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
            missing: "A space is required {{loc}} ','.",
            unexpected: "There should be no space {{loc}} ','.",
        },
    },

    create(context) {
        const { sourceCode } = context;
        const { tokensAndComments } = sourceCode;

        const options = {
            before: context.options[0] ? context.options[0].before : false,
            after: context.options[0] ? context.options[0].after : true,
        };

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        // list of comma tokens to ignore for the check of leading whitespace
        const commaTokensToIgnore: (Token | null)[] = [];

        /**
         * Reports a spacing error with an appropriate message.
         * @param node The binary expression node to report.
         * @param loc Is the error "before" or "after" the comma?
         * @param otherNode The node at the left or right of `node`
         */
        function report(node: Token, loc: 'before' | 'after', otherNode: Token) {
            context.report({
                node,
                fix(fixer: Fixer) {
                    if (options[loc]) {
                        if (loc === 'before') {
                            return fixer.insertTextBefore(node, ' ');
                        }
                        return fixer.insertTextAfter(node, ' ');
                    }
                    let start;
                    let end;
                    const newText = '';

                    if (loc === 'before') {
                        [, start] = otherNode.range;
                        [end] = node.range;
                    } else {
                        [, start] = node.range;
                        [end] = otherNode.range;
                    }

                    return fixer.replaceTextRange([start, end], newText);
                },
                messageId: options[loc] ? 'missing' : 'unexpected',
                data: {
                    loc,
                },
            });
        }

        /**
         * Adds null elements of the given ArrayExpression or ArrayPattern node to the ignore list.
         * @param node An ArrayExpression or ArrayPattern node.
         */
        function addNullElementsToIgnoreList(node: Node<'ArrayExpression' | 'ArrayPattern'>) {
            let previousToken: Token | Token | null = sourceCode.getFirstToken(node);

            node.elements.forEach((element) => {
                let token;

                if (element === null) {
                    token = sourceCode.getTokenAfter(previousToken!);

                    if (astUtils.isCommaToken(token!)) {
                        commaTokensToIgnore.push(token);
                    }
                } else {
                    token = sourceCode.getTokenAfter(element);
                }

                previousToken = token;
            });
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            'Program:exit': function onProgramExit() {
                tokensAndComments.forEach((token: Token, i) => {
                    if (!astUtils.isCommaToken(token)) {
                        return;
                    }

                    const previousToken = tokensAndComments[i - 1];
                    const nextToken = tokensAndComments[i + 1];

                    if (
                        previousToken
                        && !astUtils.isCommaToken(previousToken) // ignore spacing between two commas
                        /**
                         * `commaTokensToIgnore` are ending commas of `null` elements (array holes/elisions).
                         * In addition to spacing between two commas, this can also ignore:
                         *
                         *   - Spacing after `[` (controlled by array-bracket-spacing)
                         *       Example: [ , ]
                         *                 ^
                         *   - Spacing after a comment (for backwards compatibility, this was possibly
                         * unintentional)
                         *       Example: [a, /* * / ,]
                         *                          ^
                         */
                        && !commaTokensToIgnore.includes(token)
                        && astUtils.isTokenOnSameLine(previousToken, token)
                        && options.before !== sourceCode.isSpaceBetweenTokens(previousToken, token)
                    ) {
                        report(token, 'before', previousToken);
                    }

                    if (
                        nextToken
                        && !astUtils.isCommaToken(nextToken) // ignore spacing between two commas
                        && !astUtils.isClosingParenToken(nextToken) // controlled by space-in-parens
                        && !astUtils.isClosingBracketToken(nextToken) // controlled by array-bracket-spacing
                        && !astUtils.isClosingBraceToken(nextToken) // controlled by object-curly-spacing
                        && !(!options.after && nextToken.type === 'Line') // special case, allow space before line comment
                        && astUtils.isTokenOnSameLine(token, nextToken)
                        && options.after !== sourceCode.isSpaceBetweenTokens(token, nextToken)
                    ) {
                        report(token, 'after', nextToken);
                    }
                });
            },
            ArrayExpression: addNullElementsToIgnoreList,
            ArrayPattern: addNullElementsToIgnoreList,
        };
    },
};

export default rule;
