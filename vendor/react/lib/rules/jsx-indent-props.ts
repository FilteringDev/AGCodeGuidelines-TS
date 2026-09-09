import dependency0 from 'string.prototype.repeat';
import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file Validate props indentation in JSX
 * @author Yannick Croissant
 *
 * This rule has been ported and modified from eslint and nodeca.
 * @author Vitaly Puzrin
 * @author Gyandeep Singh
 * @copyright 2015 Vitaly Puzrin. All rights reserved.
 * @copyright 2015 Gyandeep Singh. All rights reserved.
 * Copyright (C) 2014 by Vitaly Puzrin
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the 'Software'), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
import dependency1 from '../util/ast';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/eslint';
import dependency4 from '../util/report';

const repeat = dependency0;

const astUtil = dependency1;
const docsUrl = dependency2;
const { getText } = dependency3;
const reportC = dependency4;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    wrongIndent: 'Expected indentation of {{needed}} {{type}} {{characters}} but found {{gotten}}.',
};

const rule: LegacyRule<
    [
        (
            | 'tab'
            | 'first'
            | number
            | {
                indentMode?: 'tab' | 'first' | number;
                ignoreTernaryOperator?: boolean;
                [key: string]: unknown;
            }
        )?,
    ]
> = {
    meta: {
        docs: {
            description: 'Enforce props indentation in JSX',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-indent-props'),
        },
        fixable: 'code',

        messages,

        schema: [
            {
                anyOf: [
                    {
                        enum: ['tab', 'first'],
                    },
                    {
                        type: 'integer',
                    },
                    {
                        type: 'object',
                        properties: {
                            indentMode: {
                                anyOf: [
                                    {
                                        enum: ['tab', 'first'],
                                    },
                                    {
                                        type: 'integer',
                                    },
                                ],
                            },
                            ignoreTernaryOperator: {
                                type: 'boolean',
                            },
                        },
                    },
                ],
            },
        ],
    },

    create(context) {
        const extraColumnStart = 0;
        let indentType = 'space';

        let indentSize: number | 'first' = 4;
        const line = {
            isUsingOperator: false,
            currentOperator: false,
        };
        let ignoreTernaryOperator = false;

        if (context.options.length) {
            const option = context.options[0];
            const isConfigObject = typeof option === 'object';
            const indentMode = isConfigObject ? option.indentMode : context.options[0];

            if (indentMode === 'first') {
                indentSize = 'first';
                indentType = 'space';
            } else if (indentMode === 'tab') {
                indentSize = 1;
                indentType = 'tab';
            } else if (typeof indentMode === 'number') {
                indentSize = indentMode;
                indentType = 'space';
            }

            if (isConfigObject && option.ignoreTernaryOperator) {
                ignoreTernaryOperator = true;
            }
        }

        /**
         * Reports a given indent violation and properly pluralizes the message
         * @param node Node violating the indent rule
         * @param needed Expected indentation character count
         * @param gotten Indentation character count in the actual node/code
         */
        function report(node: Node, needed: number, gotten: number) {
            const msgContext = {
                needed,
                type: indentType,
                characters: needed === 1 ? 'character' : 'characters',
                gotten,
            };

            reportC(context, messages.wrongIndent, 'wrongIndent', {
                node,
                data: msgContext,
                fix(fixer: Fixer) {
                    return fixer.replaceTextRange(
                        [node.range[0] - node.loc.start.column, node.range[0]],
                        repeat(indentType === 'space' ? ' ' : '\t', needed),
                    );
                },
            });
        }

        /**
         * Get node indent
         * @param node Node to examine
         * @returns Indent
         */
        function getNodeIndent(node: Node) {
            let src = getText(context, node, node.loc.start.column + extraColumnStart);
            const lines = src.split('\n');
            src = lines[0]!;

            let regExp;
            if (indentType === 'space') {
                regExp = /^[ ]+/;
            } else {
                regExp = /^[\t]+/;
            }

            const indent = regExp.exec(src);
            const useOperator = /^([ ]|[\t])*[:]/.test(src) || /^([ ]|[\t])*[?]/.test(src);
            const useBracket = /[<]/.test(src);

            line.currentOperator = false;
            if (useOperator) {
                line.isUsingOperator = true;
                line.currentOperator = true;
            } else if (useBracket) {
                line.isUsingOperator = false;
            }

            return indent ? indent[0].length : 0;
        }

        /**
         * Check indent for nodes list
         * @param nodes list of node objects
         * @param indent needed indent
         */
        function checkNodesIndent(nodes: Node[], indent: number) {
            let nestedIndent = indent;
            nodes.forEach((node: Node) => {
                const nodeIndent = getNodeIndent(node);
                if (
                    line.isUsingOperator
                    && !line.currentOperator
                    && indentSize !== 'first'
                    && !ignoreTernaryOperator
                ) {
                    nestedIndent += indentSize;
                    line.isUsingOperator = false;
                }
                if (
                    node.type !== 'ArrayExpression'
                    && node.type !== 'ObjectExpression'
                    && nodeIndent !== nestedIndent
                    && astUtil.isNodeFirstInLine(context, node)
                ) {
                    report(node, nestedIndent, nodeIndent);
                }
            });
        }

        return {
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                if (!node.attributes.length) {
                    return;
                }
                let propIndent;
                if (indentSize === 'first') {
                    const firstPropNode = node.attributes[0];
                    propIndent = firstPropNode!.loc.start.column;
                } else {
                    const elementIndent = getNodeIndent(node);
                    propIndent = elementIndent + indentSize;
                }
                checkNodesIndent(node.attributes, propIndent);
            },
        };
    },
};

export default rule;
