import type {
    Token, Fixer, LegacyRule, Node, FixFunction,
} from '../../types';
/**
 * @file Prevent missing parentheses around multilines JSX
 * @author Yannick Croissant
 */
import dependency0 from '../../compat/hasown';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/eslint';
import dependency3 from '../util/jsx';
import dependency4 from '../util/report';
import dependency5 from '../util/ast';

const has = dependency0;
const docsUrl = dependency1;
const eslintUtil = dependency2;
const jsxUtil = dependency3;
const reportC = dependency4;
const { isParenthesized } = dependency5;

const { getSourceCode } = eslintUtil;
const { getText } = eslintUtil;

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const DEFAULTS = {
    declaration: 'parens',
    assignment: 'parens',
    return: 'parens',
    arrow: 'parens',
    condition: 'ignore',
    logical: 'ignore',
    prop: 'ignore',
};

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    missingParens: 'Missing parentheses around multilines JSX',
    extraParens: 'Expected no parentheses around multilines JSX',
    parensOnNewLines: 'Parentheses around JSX should be on separate lines',
};

const rule: LegacyRule<
    [
        {
            declaration?: true | false | 'ignore' | 'parens' | 'parens-new-line' | 'never';
            assignment?: true | false | 'ignore' | 'parens' | 'parens-new-line' | 'never';
            return?: true | false | 'ignore' | 'parens' | 'parens-new-line' | 'never';
            arrow?: true | false | 'ignore' | 'parens' | 'parens-new-line' | 'never';
            condition?: true | false | 'ignore' | 'parens' | 'parens-new-line' | 'never';
            logical?: true | false | 'ignore' | 'parens' | 'parens-new-line' | 'never';
            prop?: true | false | 'ignore' | 'parens' | 'parens-new-line' | 'never';
        }?,
    ]
> = {
    meta: {
        docs: {
            description: 'Disallow missing parentheses around multiline JSX',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-wrap-multilines'),
        },
        fixable: 'code',

        messages,

        schema: [
            {
                type: 'object',
                // true/false are for backwards compatibility
                properties: {
                    declaration: {
                        enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
                    },
                    assignment: {
                        enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
                    },
                    return: {
                        enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
                    },
                    arrow: {
                        enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
                    },
                    condition: {
                        enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
                    },
                    logical: {
                        enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
                    },
                    prop: {
                        enum: [true, false, 'ignore', 'parens', 'parens-new-line', 'never'],
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        /**
         * @returns The result of this check.
         * @param type The node or option kind.
         */
        function getOption(type: keyof typeof DEFAULTS) {
            const userOptions = context.options[0] || {};
            if (has(userOptions, type)) {
                return userOptions[type];
            }
            return DEFAULTS[type];
        }

        /**
         * @returns The result of this check.
         * @param type The node or option kind.
         */
        function isEnabled(type: keyof typeof DEFAULTS) {
            const option = getOption(type);
            return option && option !== 'ignore';
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function needsOpeningNewLine(node: Node) {
            const previousToken = getSourceCode(context).getTokenBefore(node);

            if (!isParenthesized(context, node)) {
                return false;
            }

            if (previousToken!.loc.end.line === node.loc.start.line) {
                return true;
            }

            return false;
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function needsClosingNewLine(node: Node) {
            const nextToken = getSourceCode(context).getTokenAfter(node);

            if (!isParenthesized(context, node)) {
                return false;
            }

            if (node.loc.end.line === nextToken!.loc.end.line) {
                return true;
            }

            return false;
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isMultilines(node: Node) {
            return node.loc.start.line !== node.loc.end.line;
        }

        /**
         * @param node The node to inspect.
         * @param messageId The message id value.
         * @param fix The fix value.
         */
        function report(node: Node, messageId: keyof typeof messages, fix: FixFunction) {
            reportC(context, messages[messageId], messageId, {
                node,
                fix,
            });
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         * @param tokenBefore The token before value.
         */
        function trimTokenBeforeNewline(node: Node, tokenBefore: Token | null) {
            // if the token before the jsx is a bracket or curly brace
            // we don't want a space between the opening parentheses and the multiline jsx
            const isBracket = tokenBefore!.value === '{' || tokenBefore!.value === '[';
            return `${tokenBefore!.value.trim()}${isBracket ? '' : ' '}`;
        }

        /**
         * @param node The node to inspect.
         * @param type The node or option kind.
         */
        function check(node: Node, type: keyof typeof DEFAULTS) {
            if (!node || !jsxUtil.isJSX(node)) {
                return;
            }

            const sourceCode = getSourceCode(context);
            const option = getOption(type);

            if (
                (option === true || option === 'parens')
                && !isParenthesized(context, node)
                && isMultilines(node)
            ) {
                report(node, 'missingParens', (fixer: Fixer) => fixer.replaceText(node, `(${getText(context, node)})`));
            }

            if (option === 'parens-new-line' && isMultilines(node)) {
                if (!isParenthesized(context, node)) {
                    const tokenBefore = sourceCode.getTokenBefore(node, { includeComments: true });
                    const tokenAfter = sourceCode.getTokenAfter(node, { includeComments: true });
                    const { start } = node.loc;
                    if (tokenBefore!.loc.end.line < start.line) {
                        // Strip newline after operator if parens newline is specified
                        report(node, 'missingParens', (fixer: Fixer) => fixer.replaceTextRange(
                            [
                                tokenBefore!.range[0],
                                tokenAfter && (tokenAfter.value === ';' || tokenAfter.value === '}')
                                    ? tokenAfter.range[0]
                                    : node.range[1],
                            ],
                            `${trimTokenBeforeNewline(node, tokenBefore)}(\n${start.column > 0 ? ' '.repeat(start.column) : ''}${getText(context, node)}\n${start.column > 0 ? ' '.repeat(start.column - 2) : ''})`,
                        ));
                    } else {
                        report(
                            node,
                            'missingParens',
                            (fixer: Fixer) => fixer.replaceText(node, `(\n${getText(context, node)}\n)`),
                        );
                    }
                } else {
                    const needsOpening = needsOpeningNewLine(node);
                    const needsClosing = needsClosingNewLine(node);
                    if (needsOpening || needsClosing) {
                        report(node, 'parensOnNewLines', (fixer: Fixer) => {
                            const text = getText(context, node);
                            let fixed = text;
                            if (needsOpening) {
                                fixed = `\n${fixed}`;
                            }
                            if (needsClosing) {
                                fixed = `${fixed}\n`;
                            }
                            return fixer.replaceText(node, fixed);
                        });
                    }
                }
            }

            if (option === 'never' && isParenthesized(context, node)) {
                const tokenBefore = sourceCode.getTokenBefore(node);
                const tokenAfter = sourceCode.getTokenAfter(node);
                report(node, 'extraParens', (fixer: Fixer) => fixer.replaceTextRange(
                    [tokenBefore!.range[0], tokenAfter!.range[1]],
                    getText(context, node),
                ));
            }
        }

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        return {
            VariableDeclarator(node: Node<'VariableDeclarator'>) {
                const type = 'declaration';
                if (!isEnabled(type)) {
                    return;
                }
                if (!isEnabled('condition') && node.init && node.init.type === 'ConditionalExpression') {
                    check(node.init.consequent, type);
                    check(node.init.alternate, type);
                    return;
                }
                check(node.init!, type);
            },

            AssignmentExpression(node: Node<'AssignmentExpression'>) {
                const type = 'assignment';
                if (!isEnabled(type)) {
                    return;
                }
                if (!isEnabled('condition') && node.right.type === 'ConditionalExpression') {
                    check(node.right.consequent, type);
                    check(node.right.alternate, type);
                    return;
                }
                check(node.right, type);
            },

            ReturnStatement(node: Node<'ReturnStatement'>) {
                const type = 'return';
                if (isEnabled(type)) {
                    check(node.argument!, type);
                }
            },

            'ArrowFunctionExpression:exit': (node: Node<'ArrowFunctionExpression'>) => {
                const arrowBody = node.body;
                const type = 'arrow';

                if (isEnabled(type) && arrowBody!.type !== 'BlockStatement') {
                    check(arrowBody, type);
                }
            },

            ConditionalExpression(node: Node<'ConditionalExpression'>) {
                const type = 'condition';
                if (isEnabled(type)) {
                    check(node.consequent, type);
                    check(node.alternate, type);
                }
            },

            LogicalExpression(node: Node<'LogicalExpression'>) {
                const type = 'logical';
                if (isEnabled(type)) {
                    check(node.right, type);
                }
            },

            JSXAttribute(node: Node<'JSXAttribute'>) {
                const type = 'prop';
                if (isEnabled(type) && node.value && node.value.type === 'JSXExpressionContainer') {
                    check(node.value.expression, type);
                }
            },
        };
    },
};

export default rule;
