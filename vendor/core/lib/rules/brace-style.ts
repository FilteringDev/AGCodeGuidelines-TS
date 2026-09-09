/**
 * @file Rule to flag block statements that do not use the one true brace style
 * @author Ian Christian Myers
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

const rule: LegacyRule<[('1tbs' | 'stroustrup' | 'allman')?, { allowSingleLine?: boolean }?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Enforce consistent brace style for blocks',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/brace-style',
        },

        schema: [
            {
                enum: ['1tbs', 'stroustrup', 'allman'],
            },
            {
                type: 'object',
                properties: {
                    allowSingleLine: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        fixable: 'whitespace',

        messages: {
            nextLineOpen:
                    'Opening curly brace does not appear on the same line as controlling statement.',
            sameLineOpen:
                    'Opening curly brace appears on the same line as controlling statement.',
            blockSameLine: 'Statement inside of curly braces should be on next line.',
            nextLineClose:
                    'Closing curly brace does not appear on the same line as the subsequent block.',
            singleLineClose:
                    'Closing curly brace should be on the same line as opening curly brace or on the line after the previous block.',
            sameLineClose:
                    'Closing curly brace appears on the same line as the subsequent block.',
        },
    },

    create(context) {
        const style = context.options[0] || '1tbs';
        const params = context.options[1] || {};
        const { sourceCode } = context;

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Fixes a place where a newline unexpectedly appears
         * @param firstToken The token before the unexpected newline
         * @param secondToken The token after the unexpected newline
         * @returns A fixer function to remove the newlines between the tokens
         */
        function removeNewlineBetween(firstToken: Token, secondToken: Token) {
            const textRange: [number, number] = [firstToken.range[1], secondToken.range[0]];
            const textBetween = sourceCode.text.slice(textRange[0], textRange[1]);

            // Don't do a fix if there is a comment between the tokens
            if (textBetween.trim()) {
                return null;
            }
            return (fixer: Fixer) => fixer.replaceTextRange(textRange, ' ');
        }

        /**
         * Validates a pair of curly brackets based on the user's config
         * @param openingCurly The opening curly bracket
         * @param closingCurly The closing curly bracket
         */
        function validateCurlyPair(openingCurly: Token, closingCurly: Token) {
            const tokenBeforeOpeningCurly = sourceCode.getTokenBefore(openingCurly);
            const tokenAfterOpeningCurly = sourceCode.getTokenAfter(openingCurly);
            const tokenBeforeClosingCurly = sourceCode.getTokenBefore(closingCurly);
            const singleLineException = params.allowSingleLine
                    && astUtils.isTokenOnSameLine(openingCurly, closingCurly);

            if (
                style !== 'allman'
                    && !astUtils.isTokenOnSameLine(tokenBeforeOpeningCurly!, openingCurly)
            ) {
                context.report({
                    node: openingCurly,
                    messageId: 'nextLineOpen',
                    fix: removeNewlineBetween(tokenBeforeOpeningCurly!, openingCurly),
                });
            }

            if (
                style === 'allman'
                    && astUtils.isTokenOnSameLine(tokenBeforeOpeningCurly!, openingCurly)
                    && !singleLineException
            ) {
                context.report({
                    node: openingCurly,
                    messageId: 'sameLineOpen',
                    fix: (fixer: Fixer) => fixer.insertTextBefore(openingCurly, '\n'),
                });
            }

            if (
                astUtils.isTokenOnSameLine(openingCurly, tokenAfterOpeningCurly!)
                    && tokenAfterOpeningCurly !== closingCurly
                    && !singleLineException
            ) {
                context.report({
                    node: openingCurly,
                    messageId: 'blockSameLine',
                    fix: (fixer: Fixer) => fixer.insertTextAfter(openingCurly, '\n'),
                });
            }

            if (
                tokenBeforeClosingCurly !== openingCurly
                    && !singleLineException
                    && astUtils.isTokenOnSameLine(tokenBeforeClosingCurly!, closingCurly)
            ) {
                context.report({
                    node: closingCurly,
                    messageId: 'singleLineClose',
                    fix: (fixer: Fixer) => fixer.insertTextBefore(closingCurly, '\n'),
                });
            }
        }

        /**
         * Validates the location of a token that appears before a keyword (e.g. a newline before `else`)
         * @param curlyToken The closing curly token. This is assumed to precede a keyword token (such as `else` or
         * `finally`).
         */
        function validateCurlyBeforeKeyword(curlyToken: Token) {
            const keywordToken = sourceCode.getTokenAfter(curlyToken);

            if (
                style === '1tbs'
                    && !astUtils.isTokenOnSameLine(curlyToken, keywordToken!)
            ) {
                context.report({
                    node: curlyToken,
                    messageId: 'nextLineClose',
                    fix: removeNewlineBetween(curlyToken, keywordToken!),
                });
            }

            if (style !== '1tbs' && astUtils.isTokenOnSameLine(curlyToken, keywordToken!)) {
                context.report({
                    node: curlyToken,
                    messageId: 'sameLineClose',
                    fix: (fixer: Fixer) => fixer.insertTextAfter(curlyToken, '\n'),
                });
            }
        }

        //--------------------------------------------------------------------------
        // Public API
        //--------------------------------------------------------------------------

        return {
            BlockStatement(node: Node<'BlockStatement'>) {
                if (!astUtils.STATEMENT_LIST_PARENTS.has(node.parent.type)) {
                    validateCurlyPair(
                        sourceCode.getFirstToken(node),
                        sourceCode.getLastToken(node),
                    );
                }
            },
            StaticBlock(node: Node<'StaticBlock'>) {
                validateCurlyPair(
                    sourceCode.getFirstToken(node, { skip: 1 })!, // skip the `static` token
                    sourceCode.getLastToken(node),
                );
            },
            ClassBody(node: Node<'ClassBody'>) {
                validateCurlyPair(
                    sourceCode.getFirstToken(node),
                    sourceCode.getLastToken(node),
                );
            },
            SwitchStatement(node: Node<'SwitchStatement'>) {
                const closingCurly = sourceCode.getLastToken(node);
                const openingCurly = sourceCode.getTokenBefore(
                    (node.cases.length ? node.cases[0] : closingCurly)!,
                );

                validateCurlyPair(openingCurly!, closingCurly);
            },
            IfStatement(node: Node<'IfStatement'>) {
                if (node.consequent.type === 'BlockStatement' && node.alternate) {
                    // Handle the keyword after the `if` block (before `else`)
                    validateCurlyBeforeKeyword(sourceCode.getLastToken(node.consequent));
                }
            },
            TryStatement(node: Node<'TryStatement'>) {
                // Handle the keyword after the `try` block (before `catch` or `finally`)
                validateCurlyBeforeKeyword(sourceCode.getLastToken(node.block));

                if (node.handler && node.finalizer) {
                    // Handle the keyword after the `catch` block (before `finally`)
                    validateCurlyBeforeKeyword(sourceCode.getLastToken(node.handler.body));
                }
            },
        };
    },
};

export default rule;
