import dependency1 from 'string.prototype.repeat';
import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file Validate closing bracket location in JSX
 * @author Yannick Croissant
 */
import dependency0 from '../../compat/hasown';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/eslint';
import dependency4 from '../util/report';

const has = dependency0;
const repeat = dependency1;

const docsUrl = dependency2;
const { getSourceCode } = dependency3;
const report = dependency4;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    bracketLocation: 'The closing bracket must be {{location}}{{details}}',
};

const rule: LegacyRule<
    [
        (
            | 'after-props'
            | 'props-aligned'
            | 'tag-aligned'
            | 'line-aligned'
            | { location?: 'after-props' | 'props-aligned' | 'tag-aligned' | 'line-aligned' }
            | {
                nonEmpty?: 'after-props' | 'props-aligned' | 'tag-aligned' | 'line-aligned' | false;
                selfClosing?: 'after-props' | 'props-aligned' | 'tag-aligned' | 'line-aligned' | false;
            }
        )?,
    ]
> = {
    meta: {
        docs: {
            description: 'Enforce closing bracket location in JSX',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-closing-bracket-location'),
        },
        fixable: 'code',

        messages,

        schema: [
            {
                anyOf: [
                    {
                        enum: ['after-props', 'props-aligned', 'tag-aligned', 'line-aligned'],
                    },
                    {
                        type: 'object',
                        properties: {
                            location: {
                                enum: ['after-props', 'props-aligned', 'tag-aligned', 'line-aligned'],
                            },
                        },
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            nonEmpty: {
                                enum: [
                                    'after-props',
                                    'props-aligned',
                                    'tag-aligned',
                                    'line-aligned',
                                    false,
                                ],
                            },
                            selfClosing: {
                                enum: [
                                    'after-props',
                                    'props-aligned',
                                    'tag-aligned',
                                    'line-aligned',
                                    false,
                                ],
                            },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        ],
    },

    create(context) {
        const MESSAGE_LOCATION = {
            'after-props': 'placed after the last prop',
            'after-tag': 'placed after the opening tag',
            'props-aligned': 'aligned with the last prop',
            'tag-aligned': 'aligned with the opening tag',
            'line-aligned': 'aligned with the line containing the opening tag',
        };
        type Location = keyof typeof MESSAGE_LOCATION;
        type LocationOption = Location | false | undefined;
        const DEFAULT_LOCATION = 'tag-aligned';

        const config = context.options[0];
        const options: { nonEmpty: LocationOption; selfClosing: LocationOption } = {
            nonEmpty: DEFAULT_LOCATION,
            selfClosing: DEFAULT_LOCATION,
        };

        if (typeof config === 'string') {
            // simple shorthand [1, 'something']
            options.nonEmpty = config;
            options.selfClosing = config;
        } else if (typeof config === 'object') {
            // [1, {location: 'something'}] (back-compat)
            if (has(config, 'location')) {
                options.nonEmpty = config.location;
                options.selfClosing = config.location;
            }
            // [1, {nonEmpty: 'something'}]
            if (has(config, 'nonEmpty')) {
                options.nonEmpty = config.nonEmpty;
            }
            // [1, {selfClosing: 'something'}]
            if (has(config, 'selfClosing')) {
                options.selfClosing = config.selfClosing;
            }
        }

        /**
         * Get the locations of the opening bracket, closing bracket, last prop, and
         * start of opening line.
         * @param node The node to check
         * @returns Locations of the opening bracket, closing bracket, last
         * prop and start of opening line.
         */
        function getTokensLocations(node: Node<'JSXOpeningElement'>) {
            const sourceCode = getSourceCode(context);
            const opening = sourceCode.getFirstToken(node)!.loc.start;
            const closing = sourceCode.getLastTokens(node, node.selfClosing ? 2 : 1)[0]!.loc.start;
            const tag = sourceCode.getFirstToken(node.name).loc.start;
            let lastProp: { column: number; firstLine: number; lastLine: number } | undefined;
            if (node.attributes!.length) {
                const lastAttribute = node.attributes![node.attributes!.length - 1]!;
                lastProp = {
                    column: sourceCode.getFirstToken(lastAttribute).loc.start.column,
                    firstLine: sourceCode.getFirstToken(lastAttribute).loc.start.line,
                    lastLine: sourceCode.getLastToken(lastAttribute).loc.end.line,
                };
            }
            const openingLine = sourceCode.lines[opening.line - 1];
            const closingLine = sourceCode.lines[closing.line - 1];
            const isTab = {
                openTab: /^\t/.test(openingLine!),
                closeTab: /^\t/.test(closingLine!),
            };
            const openingStartOfLine = {
                column: /^\s*/.exec(openingLine!)![0].length,
                line: opening.line,
            };
            return {
                isTab,
                tag,
                opening,
                closing,
                lastProp,
                selfClosing: node.selfClosing,
                openingStartOfLine,
            };
        }

        /**
         * Get expected location for the closing bracket
         * @param tokens Locations of the opening bracket, closing bracket and last prop
         * @returns Expected location for the closing bracket
         */
        function getExpectedLocation(tokens: ReturnType<typeof getTokensLocations>): LocationOption {
            let location: LocationOption;
            // Is always after the opening tag if there is no props
            if (typeof tokens.lastProp === 'undefined') {
                location = 'after-tag';
                // Is always after the last prop if this one is on the same line as the opening bracket
            } else if (tokens.opening.line === tokens.lastProp!.lastLine) {
                location = 'after-props';
                // Else use configuration dependent on selfClosing property
            } else {
                location = tokens.selfClosing ? options.selfClosing : options.nonEmpty;
            }
            return location;
        }

        /**
         * Get the correct 0-indexed column for the closing bracket, given the
         * expected location.
         * @param tokens Locations of the opening bracket, closing bracket and last prop
         * @param expectedLocation Expected location for the closing bracket
         * @returns The correct column for the closing bracket, or null
         */
        function getCorrectColumn(
            tokens: ReturnType<typeof getTokensLocations>,
            expectedLocation: LocationOption,
        ) {
            switch (expectedLocation) {
                case 'props-aligned':
                    return tokens.lastProp!.column;
                case 'tag-aligned':
                    return tokens.opening.column;
                case 'line-aligned':
                    return tokens.openingStartOfLine.column;
                default:
                    return null;
            }
        }

        /**
         * Check if the closing bracket is correctly located
         * @param tokens Locations of the opening bracket, closing bracket and last prop
         * @param expectedLocation Expected location for the closing bracket
         * @returns True if the closing bracket is correctly located, false if not
         */
        function hasCorrectLocation(
            tokens: ReturnType<typeof getTokensLocations>,
            expectedLocation: LocationOption,
        ) {
            switch (expectedLocation) {
                case 'after-tag':
                    return tokens.tag.line === tokens.closing.line;
                case 'after-props':
                    return tokens.lastProp!.lastLine === tokens.closing.line;
                case 'props-aligned':
                case 'tag-aligned':
                case 'line-aligned': {
                    const correctColumn = getCorrectColumn(tokens, expectedLocation);
                    return correctColumn === tokens.closing.column;
                }
                default:
                    return true;
            }
        }

        /**
         * Get the characters used for indentation on the line to be matched
         * @param tokens Locations of the opening bracket, closing bracket and last prop
         * @param expectedLocation Expected location for the closing bracket
         * @param [correctColumn] Expected column for the closing bracket. Default to 0
         * @returns The characters used for indentation
         */
        function getIndentation(
            tokens: ReturnType<typeof getTokensLocations>,
            expectedLocation: LocationOption,
            correctColumn?: number | null,
        ) {
            const newColumn = correctColumn || 0;
            let indentation = '';
            let spaces = '';
            switch (expectedLocation) {
                case 'props-aligned':
                    [indentation] = /^\s*/.exec(
                        getSourceCode(context).lines[tokens.lastProp!.firstLine - 1]!,
                    )!;
                    break;
                case 'tag-aligned':
                case 'line-aligned':
                    [indentation] = /^\s*/.exec(getSourceCode(context).lines[tokens.opening.line - 1]!)!;
                    break;
                default:
                    indentation = '';
            }
            if (indentation!.length + 1 < newColumn) {
                // Non-whitespace characters were included in the column offset
                spaces = repeat(' ', +correctColumn! - indentation!.length);
            }
            return indentation + spaces;
        }

        /**
         * Get an unique ID for a given JSXOpeningElement
         * @param node The AST node being checked.
         * @returns Unique ID (based on its range)
         */
        function getOpeningElementId(node: Node) {
            return node.range.join(':');
        }

        const lastAttributeNode: Record<string, Node> = {};

        return {
            JSXAttribute(node: Node<'JSXAttribute'>) {
                lastAttributeNode[getOpeningElementId(node.parent)] = node;
            },

            JSXSpreadAttribute(node: Node<'JSXSpreadAttribute'>) {
                lastAttributeNode[getOpeningElementId(node.parent)] = node;
            },

            'JSXOpeningElement:exit': function onJSXOpeningElementExit(node: Node<'JSXOpeningElement'>) {
                const attributeNode = lastAttributeNode[getOpeningElementId(node)];
                const cachedLastAttributeEndPos = attributeNode ? attributeNode.range[1] : null;

                let expectedNextLine: boolean | undefined;
                const tokens = getTokensLocations(node);
                const expectedLocation = getExpectedLocation(tokens);
                let usingSameIndentation = true;

                if (expectedLocation === 'tag-aligned') {
                    usingSameIndentation = tokens.isTab.openTab === tokens.isTab.closeTab;
                }

                if (hasCorrectLocation(tokens, expectedLocation) && usingSameIndentation) {
                    return;
                }

                const data = {
                    location: MESSAGE_LOCATION[expectedLocation as Location],
                    details: '',
                };
                const correctColumn = getCorrectColumn(tokens, expectedLocation);

                if (correctColumn !== null) {
                    expectedNextLine = tokens.lastProp && tokens.lastProp!.lastLine === tokens.closing.line;
                    data.details = ` (expected column ${correctColumn + 1}${expectedNextLine ? ' on the next line)' : ')'}`;
                }

                report(context, messages.bracketLocation, 'bracketLocation', {
                    node,
                    loc: tokens.closing,
                    data,
                    fix(fixer: Fixer) {
                        const closingTag = tokens.selfClosing ? '/>' : '>';
                        switch (expectedLocation) {
                            case 'after-tag':
                                if (cachedLastAttributeEndPos) {
                                    return fixer.replaceTextRange(
                                        [cachedLastAttributeEndPos!, node.range[1]],
                                        (expectedNextLine ? '\n' : '') + closingTag,
                                    );
                                }
                                return fixer.replaceTextRange(
                                    [node.name.range[1], node.range[1]],
                                    (expectedNextLine ? '\n' : ' ') + closingTag,
                                );
                            case 'after-props':
                                return fixer.replaceTextRange(
                                    [cachedLastAttributeEndPos!, node.range[1]],
                                    (expectedNextLine ? '\n' : '') + closingTag,
                                );
                            case 'props-aligned':
                            case 'tag-aligned':
                            case 'line-aligned':
                                return fixer.replaceTextRange(
                                    [cachedLastAttributeEndPos!, node.range[1]],
                                    `\n${getIndentation(tokens, expectedLocation, correctColumn)}${closingTag}`,
                                );
                            default:
                                // hasCorrectLocation already accepts every unhandled location.
                                return true as never;
                        }
                    },
                });
            },
        };
    },
};

export default rule;
