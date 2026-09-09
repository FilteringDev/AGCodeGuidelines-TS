/**
 * @file Comma style - enforces comma styles of two types: last and first
 * @author Vignesh Anand aka vegetableman
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import type {
    LegacyListener, Fixer, LegacyRule, Node, Token,
} from '../../../types';

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[('first' | 'last')?, { exceptions?: { [key: string]: boolean } }?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Enforce consistent comma style',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/comma-style',
        },

        fixable: 'code',

        schema: [
            {
                enum: ['first', 'last'],
            },
            {
                type: 'object',
                properties: {
                    exceptions: {
                        type: 'object',
                        additionalProperties: {
                            type: 'boolean',
                        },
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            unexpectedLineBeforeAndAfterComma: "Bad line breaking before and after ','.",
            expectedCommaFirst: "',' should be placed first.",
            expectedCommaLast: "',' should be placed last.",
        },
    },

    create(context) {
        const style = context.options[0] || 'last';
        const { sourceCode } = context;
        const exceptions: Partial<Record<Node['type'], boolean>> = {
            ArrayPattern: true,
            ArrowFunctionExpression: true,
            CallExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
            ImportDeclaration: true,
            ObjectPattern: true,
            NewExpression: true,
        };

        if (
            context.options.length === 2
            && Object.prototype.hasOwnProperty.call(context.options[1], 'exceptions')
        ) {
            const keys = Object.keys(context!.options[1]!.exceptions!) as Node['type'][];

            for (let i = 0; i < keys.length; i += 1) {
                exceptions[keys[i]!] = context!.options[1]!.exceptions![keys[i]!];
            }
        }

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Modified text based on the style
         * @param styleType Style type
         * @param text Source code text
         * @returns modified text
         */
        function getReplacedText(styleType: string, text: string) {
            switch (styleType) {
                case 'between':
                    return `,${text.replace(astUtils.LINEBREAK_MATCHER, '')}`;

                case 'first':
                    return `${text},`;

                case 'last':
                    return `,${text}`;

                default:
                    return '';
            }
        }

        /**
         * Determines the fixer function for a given style.
         * @param styleType comma style
         * @param previousItemToken The token to check.
         * @param commaToken The token to check.
         * @param currentItemToken The token to check.
         * @returns Fixer function
         */
        function getFixerFunction(
            styleType: string,
            previousItemToken: Token,
            commaToken: Token,
            currentItemToken: Token,
        ) {
            const text = sourceCode.text.slice(previousItemToken.range[1], commaToken.range[0])
                + sourceCode.text.slice(commaToken.range[1], currentItemToken.range[0]);
            const range: [number, number] = [
                previousItemToken.range[1],
                currentItemToken.range[0],
            ];

            return function visitValue(fixer: Fixer) {
                return fixer.replaceTextRange(range, getReplacedText(styleType, text));
            };
        }

        /**
         * Validates the spacing around single items in lists.
         * @param previousItemToken The last token from the previous item.
         * @param commaToken The token representing the comma.
         * @param currentItemToken The first token of the current item.
         * @param reportItem The item to use when reporting an error.
         */
        function validateCommaItemSpacing(
            previousItemToken: Token,
            commaToken: Token,
            currentItemToken: Token,
            reportItem: Node | Token,
        ) {
            // if single line
            if (
                astUtils.isTokenOnSameLine(commaToken, currentItemToken)
                && astUtils.isTokenOnSameLine(previousItemToken, commaToken)
            ) {
                // do nothing.
            } else if (
                !astUtils.isTokenOnSameLine(commaToken, currentItemToken)
                && !astUtils.isTokenOnSameLine(previousItemToken, commaToken)
            ) {
                const comment = sourceCode.getCommentsAfter(commaToken)[0];
                const styleType = comment
                    && comment.type === 'Block'
                    && astUtils.isTokenOnSameLine(commaToken, comment)
                    ? style
                    : 'between';

                // lone comma
                context.report({
                    node: reportItem,
                    loc: commaToken.loc,
                    messageId: 'unexpectedLineBeforeAndAfterComma',
                    fix: getFixerFunction(
                        styleType,
                        previousItemToken,
                        commaToken,
                        currentItemToken,
                    ),
                });
            } else if (
                style === 'first'
                && !astUtils.isTokenOnSameLine(commaToken, currentItemToken)
            ) {
                context.report({
                    node: reportItem,
                    loc: commaToken.loc,
                    messageId: 'expectedCommaFirst',
                    fix: getFixerFunction(
                        style,
                        previousItemToken,
                        commaToken,
                        currentItemToken,
                    ),
                });
            } else if (
                style === 'last'
                && astUtils.isTokenOnSameLine(commaToken, currentItemToken)
            ) {
                context.report({
                    node: reportItem,
                    loc: commaToken.loc,
                    messageId: 'expectedCommaLast',
                    fix: getFixerFunction(
                        style,
                        previousItemToken,
                        commaToken,
                        currentItemToken,
                    ),
                });
            }
        }

        /**
         * Checks the comma placement with regards to a declaration/property/element
         * @param node The binary expression node to check
         * @param property The property of the node containing child nodes.
         */
        function validateComma<Key extends string>(
            node: Node & Record<Key, (Node | null)[]>,
            property: Key,
        ) {
            const items = node[property];
            const arrayLiteral = node.type === 'ArrayExpression' || node.type === 'ArrayPattern';

            if (items.length > 1 || arrayLiteral) {
                // seed as opening [
                let previousItemToken = sourceCode.getFirstToken(node);

                items.forEach((item) => {
                    const commaToken = item
                        ? sourceCode.getTokenBefore(item)
                        : previousItemToken;
                    const currentItemToken = item
                        ? sourceCode.getFirstToken(item)
                        : sourceCode.getTokenAfter(commaToken!);
                    const reportItem = item || currentItemToken;

                    /**
                     * This works by comparing three token locations:
                     * - previousItemToken is the last token of the previous item
                     * - commaToken is the location of the comma before the current item
                     * - currentItemToken is the first token of the current item
                     *
                     * These values get switched around if item is undefined.
                     * previousItemToken will refer to the last token not belonging
                     * to the current item, which could be a comma or an opening
                     * square bracket. currentItemToken could be a comma.
                     *
                     * All comparisons are done based on these tokens directly, so
                     * they are always valid regardless of an undefined item.
                     */
                    if (astUtils.isCommaToken(commaToken!)) {
                        validateCommaItemSpacing(
                            previousItemToken!,
                            commaToken!,
                            currentItemToken!,
                            reportItem!,
                        );
                    }

                    if (item) {
                        const tokenAfterItem = sourceCode.getTokenAfter(
                            item,
                            astUtils.isNotClosingParenToken,
                        );

                        previousItemToken = tokenAfterItem
                            ? sourceCode.getTokenBefore(tokenAfterItem)
                            : sourceCode.ast.tokens[sourceCode.ast.tokens.length - 1]!;
                    } else {
                        previousItemToken = currentItemToken;
                    }
                });

                /**
                 * Special case for array literals that have empty last items, such
                 * as [ 1, 2, ]. These arrays only have two items show up in the
                 * AST, so we need to look at the token to verify that there's no
                 * dangling comma.
                 */
                if (arrayLiteral) {
                    const lastToken = sourceCode.getLastToken(node);
                    const nextToLastToken = sourceCode.getTokenBefore(lastToken);

                    if (astUtils.isCommaToken(nextToLastToken!)) {
                        validateCommaItemSpacing(
                            sourceCode.getTokenBefore(nextToLastToken!)!,
                            nextToLastToken!,
                            lastToken,
                            lastToken,
                        );
                    }
                }
            }
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        const nodes: LegacyListener = {};

        if (!exceptions.VariableDeclaration) {
            nodes.VariableDeclaration = function nodesVariableDeclaration(
                node: Node<'VariableDeclaration'>,
            ) {
                validateComma(node, 'declarations');
            };
        }
        if (!exceptions.ObjectExpression) {
            nodes.ObjectExpression = function nodesObjectExpression(
                node: Node<'ObjectExpression'>,
            ) {
                validateComma(node, 'properties');
            };
        }
        if (!exceptions.ObjectPattern) {
            nodes.ObjectPattern = function nodesObjectPattern(node: Node<'ObjectPattern'>) {
                validateComma(node, 'properties');
            };
        }
        if (!exceptions.ArrayExpression) {
            nodes.ArrayExpression = function nodesArrayExpression(
                node: Node<'ArrayExpression'>,
            ) {
                validateComma(node, 'elements');
            };
        }
        if (!exceptions.ArrayPattern) {
            nodes.ArrayPattern = function nodesArrayPattern(node: Node<'ArrayPattern'>) {
                validateComma(node, 'elements');
            };
        }
        if (!exceptions.FunctionDeclaration) {
            nodes.FunctionDeclaration = function nodesFunctionDeclaration(
                node: Node<'FunctionDeclaration'>,
            ) {
                validateComma(node, 'params');
            };
        }
        if (!exceptions.FunctionExpression) {
            nodes.FunctionExpression = function nodesFunctionExpression(
                node: Node<'FunctionExpression'>,
            ) {
                validateComma(node, 'params');
            };
        }
        if (!exceptions.ArrowFunctionExpression) {
            nodes.ArrowFunctionExpression = function nodesArrowFunctionExpression(
                node: Node<'ArrowFunctionExpression'>,
            ) {
                validateComma(node, 'params');
            };
        }
        if (!exceptions.CallExpression) {
            nodes.CallExpression = function nodesCallExpression(node: Node<'CallExpression'>) {
                validateComma(node, 'arguments');
            };
        }
        if (!exceptions.ImportDeclaration) {
            nodes.ImportDeclaration = function nodesImportDeclaration(
                node: Node<'ImportDeclaration'>,
            ) {
                validateComma(node, 'specifiers');
            };
        }
        if (!exceptions.NewExpression) {
            nodes.NewExpression = function nodesNewExpression(node: Node<'NewExpression'>) {
                validateComma(node, 'arguments');
            };
        }

        return nodes;
    },
};

export default rule;
