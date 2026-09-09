/**
 * @file Rule to enforce a single linebreak style.
 * @author Erik Mueller
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import type { Fixer, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[('unix' | 'windows')?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Enforce consistent linebreak style',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/linebreak-style',
        },

        fixable: 'whitespace',

        schema: [
            {
                enum: ['unix', 'windows'],
            },
        ],
        messages: {
            expectedLF: "Expected linebreaks to be 'LF' but found 'CRLF'.",
            expectedCRLF: "Expected linebreaks to be 'CRLF' but found 'LF'.",
        },
    },

    create(context) {
        const { sourceCode } = context;

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Builds a fix function that replaces text at the specified range in the source text.
         * @param range The range to replace
         * @param text The text to insert.
         * @returns Fixer function
         */
        function createFix(range: [number, number], text: string) {
            return function visitValue(fixer: Fixer) {
                return fixer.replaceTextRange(range, text);
            };
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            Program: function checkForLinebreakStyle(node: Node<'Program'>) {
                const linebreakStyle = context.options[0] || 'unix';
                const expectedLF = linebreakStyle === 'unix';
                const expectedLFChars = expectedLF ? '\n' : '\r\n';
                const source = sourceCode.getText();
                const pattern = astUtils.createGlobalLinebreakMatcher();
                let match;

                let i = 0;

                for (
                    match = pattern.exec(source);
                    match !== null;
                    match = pattern.exec(source)
                ) {
                    i += 1;
                    if (!(match[0] === expectedLFChars)) {
                        const { index } = match;
                        const range: [number, number] = [index, index + match[0].length];

                        context.report({
                            node,
                            loc: {
                                start: {
                                    line: i,
                                    column: sourceCode!.lines[i - 1]!.length,
                                },
                                end: {
                                    line: i + 1,
                                    column: 0,
                                },
                            },
                            messageId: expectedLF ? 'expectedLF' : 'expectedCRLF',
                            fix: createFix(range, expectedLFChars),
                        });
                    }
                }
            },
        };
    },
};

export default rule;
