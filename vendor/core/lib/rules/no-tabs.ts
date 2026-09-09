/**
 * @file Rule to check for tabs inside a file
 * @author Gyandeep Singh
 * @deprecated in ESLint v8.53.0
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const tabRegex = /\t+/gu;
const anyNonWhitespaceRegex = /\S/u;

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ allowIndentationTabs?: boolean }?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Disallow all tabs',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-tabs',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    allowIndentationTabs: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            unexpectedTab: 'Unexpected tab character.',
        },
    },

    create(context) {
        const { sourceCode } = context;
        const allowIndentationTabs = context.options && context.options[0] && context.options[0].allowIndentationTabs;

        return {
            Program(node: Node<'Program'>) {
                sourceCode.getLines().forEach((line, index) => {
                    let match;

                    for (
                        match = tabRegex.exec(line);
                        match !== null;
                        match = tabRegex.exec(line)
                    ) {
                        if (
                            !(
                                allowIndentationTabs
                                && !anyNonWhitespaceRegex.test(line.slice(0, match.index))
                            )
                        ) {
                            context.report({
                                node,
                                loc: {
                                    start: {
                                        line: index + 1,
                                        column: match.index,
                                    },
                                    end: {
                                        line: index + 1,
                                        column: match.index + match[0].length,
                                    },
                                },
                                messageId: 'unexpectedTab',
                            });
                        }
                    }
                });
            },
        };
    },
};

export default rule;
