/**
 * @file Rule to warn about using dot notation instead of square bracket notation when possible.
 * @author Josh Perez
 */
import dependency0 from './utils/ast-utils';
import dependency1 from './utils/keywords';
import type { Fixer, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;
const keywords = dependency1;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/u;

// `null` literal must be handled separately.
const literalTypesToCheck = new Set(['string', 'boolean']);

const rule: LegacyRule<[{ allowKeywords?: boolean; allowPattern?: string }?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Enforce dot notation whenever possible',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/dot-notation',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    allowKeywords: {
                        type: 'boolean',
                        default: true,
                    },
                    allowPattern: {
                        type: 'string',
                        default: '',
                    },
                },
                additionalProperties: false,
            },
        ],

        fixable: 'code',

        messages: {
            useDot: '[{{key}}] is better written in dot notation.',
            useBrackets: '.{{key}} is a syntax error.',
        },
    },

    create(context) {
        const options = context.options[0] || {};
        const allowKeywords = options.allowKeywords === undefined || options.allowKeywords;
        const { sourceCode } = context;

        let allowPattern: RegExp | undefined;

        if (options.allowPattern) {
            allowPattern = new RegExp(options.allowPattern, 'u');
        }

        /**
         * Check if the property is valid dot notation
         * @param node The dot notation node
         * @param value Value which is to be checked
         */
        function checkComputedProperty(
            node: Node<'MemberExpression'>,
            value: Node<'Literal'>['value'],
        ) {
            if (
                validIdentifier.test(String(value))
                && (allowKeywords || !keywords.includes(String(value)))
                && !(allowPattern && allowPattern.test(String(value)))
            ) {
                const formattedValue = node.property.type === 'Literal' ? JSON.stringify(value) : `\`${value}\``;

                context.report({
                    node: node.property,
                    messageId: 'useDot',
                    data: {
                        key: formattedValue,
                    },
                    * fix(fixer: Fixer) {
                        const leftBracket = sourceCode.getTokenAfter(
                            node.object,
                            astUtils.isOpeningBracketToken,
                        );
                        const rightBracket = sourceCode.getLastToken(node);
                        const nextToken = sourceCode.getTokenAfter(node);

                        // Don't perform any fixes if there are comments inside the brackets.
                        if (sourceCode.commentsExistBetween(leftBracket!, rightBracket)) {
                            return;
                        }

                        // Replace the brackets by an identifier.
                        if (!node.optional) {
                            yield fixer.insertTextBefore(
                                leftBracket!,
                                astUtils.isDecimalInteger(node.object) ? ' .' : '.',
                            );
                        }
                        yield fixer.replaceTextRange(
                            [leftBracket!.range[0], rightBracket!.range[1]],
                            String(value),
                        );

                        // Insert a space after the property if it will be connected to the next token.
                        if (
                            nextToken
                            && rightBracket!.range[1] === nextToken.range[0]
                            && !astUtils.canTokensBeAdjacent(String(value), nextToken)
                        ) {
                            yield fixer.insertTextAfter(node, ' ');
                        }
                    },
                });
            }
        }

        return {
            MemberExpression(node: Node<'MemberExpression'>) {
                if (
                    node.computed
                    && node.property.type === 'Literal'
                    && (literalTypesToCheck.has(typeof node.property.value)
                        || astUtils.isNullLiteral(node.property))
                ) {
                    checkComputedProperty(node, node.property.value);
                }
                if (node.computed && astUtils.isStaticTemplateLiteral(node.property)) {
                    checkComputedProperty(node, node.property.quasis[0]!.value.cooked!);
                }
                if (
                    !allowKeywords
                    && !node.computed
                    && node.property.type === 'Identifier'
                    && keywords.includes(String(node.property.name))
                ) {
                    context.report({
                        node: node.property,
                        messageId: 'useBrackets',
                        data: {
                            key: node.property.name,
                        },
                        * fix(fixer: Fixer) {
                            const dotToken = sourceCode.getTokenBefore(node.property);

                            // A statement that starts with `let[` is parsed as a destructuring variable
                            // declaration, not a MemberExpression.
                            if (
                                node.object.type === 'Identifier'
                                && node.object.name === 'let'
                                && !node.optional
                            ) {
                                return;
                            }

                            // Don't perform any fixes if there are comments between the dot and the property name.
                            if (sourceCode.commentsExistBetween(dotToken!, node.property)) {
                                return;
                            }

                            // Replace the identifier to brackets.
                            if (!node.optional) {
                                yield fixer.remove(dotToken!);
                            }
                            yield fixer.replaceText(node.property, `["${node.property.name}"]`);
                        },
                    });
                }
            },
        };
    },
};

export default rule;
