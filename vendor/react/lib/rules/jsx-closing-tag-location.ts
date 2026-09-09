import dependency0 from 'string.prototype.repeat';
import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file Validate closing tag location in JSX
 * @author Ross Solomon
 */
import dependency1 from '../../compat/hasown';
import dependency2 from '../util/ast';
import dependency3 from '../util/docsUrl';
import dependency4 from '../util/eslint';
import dependency5 from '../util/report';

const repeat = dependency0;
const has = dependency1;

const astUtil = dependency2;
const docsUrl = dependency3;
const { getSourceCode } = dependency4;
const report = dependency5;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    onOwnLine: 'Closing tag of a multiline JSX expression must be on its own line.',
    matchIndent: 'Expected closing tag to match indentation of opening.',
    alignWithOpening: 'Expected closing tag to be aligned with the line containing the opening tag',
};

const defaultOption = 'tag-aligned';

const optionMessageMap = {
    'tag-aligned': 'matchIndent',
    'line-aligned': 'alignWithOpening',
};

const rule: LegacyRule<
    [('tag-aligned' | 'line-aligned' | { location?: 'tag-aligned' | 'line-aligned' })?]
> = {
    meta: {
        docs: {
            description: 'Enforce closing tag location for multiline JSX',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-closing-tag-location'),
        },
        fixable: 'whitespace',
        messages,
        schema: [
            {
                anyOf: [
                    {
                        enum: ['tag-aligned', 'line-aligned'],
                    },
                    {
                        type: 'object',
                        properties: {
                            location: {
                                enum: ['tag-aligned', 'line-aligned'],
                            },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        ],
    },

    create(context) {
        const config = context.options[0];
        let option: 'tag-aligned' | 'line-aligned' | undefined = defaultOption;

        if (typeof config === 'string') {
            option = config;
        } else if (typeof config === 'object') {
            if (has(config, 'location')) {
                option = config.location;
            }
        }

        /**
         * @param openingStartOfLine The opening start of line value.
         * @param openingStartOfLine.column The column value.
         * @param opening The opening value.
         * @returns The result of this check.
         */
        function getIndentation(openingStartOfLine: { column: number }, opening: Node) {
            if (option === 'line-aligned') {
                return openingStartOfLine.column;
            }
            if (option === 'tag-aligned') {
                return opening.loc.start.column;
            }

            return undefined;
        }

        /**
         * @param node The node to inspect.
         */
        function handleClosingElement(node: Node) {
            if (!node.parent) {
                return;
            }
            const sourceCode = getSourceCode(context);

            const opening = node.parent.openingElement || node.parent.openingFragment;
            const openingLoc = sourceCode.getFirstToken(opening!).loc.start;
            const openingLine = sourceCode.lines[openingLoc.line - 1];

            const openingStartOfLine = {
                column: /^\s*/.exec(openingLine!)![0].length,
                line: openingLoc.line,
            };

            if (opening!.loc.start.line === node.loc.start.line) {
                return;
            }

            if (opening!.loc.start.column === node.loc.start.column && option === 'tag-aligned') {
                return;
            }

            if (openingStartOfLine.column === node.loc.start.column && option === 'line-aligned') {
                return;
            }

            const messageId = astUtil.isNodeFirstInLine(context, node)
                ? optionMessageMap[option!]
                : 'onOwnLine';

            report(context, messages[messageId as keyof typeof messages], messageId, {
                node,
                loc: node.loc,
                fix(fixer: Fixer) {
                    const indent = repeat(' ', getIndentation(openingStartOfLine, opening!)!);

                    if (astUtil.isNodeFirstInLine(context, node)) {
                        return fixer.replaceTextRange(
                            [node.range[0] - node.loc.start.column, node.range[0]],
                            indent,
                        );
                    }

                    return fixer.insertTextBefore(node, `\n${indent}`);
                },
            });
        }

        return {
            JSXClosingElement: handleClosingElement,
            JSXClosingFragment: handleClosingElement,
        };
    },
};

export default rule;
