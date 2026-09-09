/**
 * @file Look for useless escapes in strings and regexes
 * @author Onur Temizkan
 */
import * as dependency1 from '@eslint-community/regexpp';
import dependency0 from './utils/ast-utils';
import type { Fixer, LegacyRule, Node } from '../../../types';

type CharacterClass = import('@eslint-community/regexpp').AST.CharacterClass;
type ExpressionCharacterClass =
    import('@eslint-community/regexpp').AST.ExpressionCharacterClass;

const astUtils = dependency0;
const { RegExpParser, visitRegExpAST } = dependency1;

/**
 */
//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/**
 * Returns the union of two sets.
 * @param setA The first set
 * @param setB The second set
 * @returns The union of the two sets
 */
function union(setA: Set<string>, setB: Set<string>) {
    return new Set(
        (function* visitValue() {
            yield* setA;
            yield* setB;
        }()),
    );
}

const VALID_STRING_ESCAPES = union(new Set('\\nrvtbfux'), astUtils.LINEBREAKS);
const REGEX_GENERAL_ESCAPES = new Set('\\bcdDfnpPrsStvwWxu0123456789]');
const REGEX_NON_CHARCLASS_ESCAPES = union(REGEX_GENERAL_ESCAPES, new Set('^/.$*+?[{}|()Bk'));

/**
 * Set of characters that require escaping in character classes in `unicodeSets` mode.
 * ( ) [ ] { } / - \ | are ClassSetSyntaxCharacter
 */
const REGEX_CLASSSET_CHARACTER_ESCAPES = union(REGEX_GENERAL_ESCAPES, new Set('q/[{}|()-'));

/**
 * A single character set of ClassSetReservedDoublePunctuator.
 * && !! ## $$ %% ** ++ ,, .. :: ;; << == >> ?? @@ ^^ `` ~~ are ClassSetReservedDoublePunctuator
 */
const REGEX_CLASS_SET_RESERVED_DOUBLE_PUNCTUATOR = new Set('!#$%&*+,.:;<=>?@^`~');

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow unnecessary escape characters',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-useless-escape',
        },

        hasSuggestions: true,

        messages: {
            unnecessaryEscape: 'Unnecessary escape character: \\{{character}}.',
            removeEscape: 'Remove the `\\`. This maintains the current functionality.',
            removeEscapeDoNotKeepSemantics: 'Remove the `\\` if it was inserted by mistake.',
            escapeBackslash:
                'Replace the `\\` with `\\\\` to include the actual backslash character.',
        },

        schema: [],
    },

    create(context) {
        const { sourceCode } = context;
        const parser = new RegExpParser();

        /**
         * Reports a node
         * @param node The node to report
         * @param startOffset The backslash's offset from the start of the node
         * @param character The uselessly escaped character (not including the backslash)
         * @param [disableEscapeBackslashSuggest] `true` if escapeBackslash suggestion should be turned off.
         */
        function report(
            node: Node<'Literal' | 'TemplateElement'>,
            startOffset: number,
            character: string,
            disableEscapeBackslashSuggest?: boolean,
        ) {
            const rangeStart = node.range[0] + startOffset;
            const range: [number, number] = [rangeStart, rangeStart + 1];
            const start = sourceCode.getLocFromIndex(rangeStart);

            context.report({
                node,
                loc: {
                    start,
                    end: { line: start.line, column: start.column + 1 },
                },
                messageId: 'unnecessaryEscape',
                data: { character },
                suggest: [
                    {
                        // Removing unnecessary `\` characters in a directive is not guaranteed to maintain
                        // functionality.
                        messageId: astUtils.isDirective(node.parent)
                            ? 'removeEscapeDoNotKeepSemantics'
                            : 'removeEscape',
                        fix(fixer: Fixer) {
                            return fixer.removeRange(range);
                        },
                    },
                    ...(disableEscapeBackslashSuggest
                        ? []
                        : [
                            {
                                messageId: 'escapeBackslash',
                                fix(fixer: Fixer) {
                                    return fixer.insertTextBeforeRange(range, '\\');
                                },
                            },
                        ]),
                ],
            });
        }

        /**
         * Checks if the escape character in given string slice is unnecessary.
         * @param node node to validate.
         * @param match string slice to validate.
         */
        function validateString(
            node: Node<'Literal' | 'TemplateElement'>,
            match: RegExpExecArray,
        ) {
            const isTemplateElement = node.type === 'TemplateElement';
            const escapedChar = match![0]![1];
            let isUnnecessaryEscape = !VALID_STRING_ESCAPES.has(escapedChar!);
            let isQuoteEscape;

            if (isTemplateElement) {
                isQuoteEscape = escapedChar === '`';

                if (escapedChar === '$') {
                    // Warn if `\$` is not followed by `{`
                    isUnnecessaryEscape = match.input[match.index + 2] !== '{';
                } else if (escapedChar === '{') {
                    /**
                     * Warn if `\{` is not preceded by `$`. If preceded by `$`, escaping
                     * is necessary and the rule should not warn. If preceded by `/$`, the rule
                     * will warn for the `/$` instead, as it is the first unnecessarily escaped character.
                     */
                    isUnnecessaryEscape = match.input[match.index - 1] !== '$';
                }
            } else {
                isQuoteEscape = escapedChar === node.raw![0];
            }

            if (isUnnecessaryEscape && !isQuoteEscape) {
                report(node, match.index, match![0]!.slice(1));
            }
        }

        /**
         * Checks if the escape character in given regexp is unnecessary.
         * @param node node to validate.
         */
        function validateRegExp(node: Node<'Literal'>) {
            const { pattern, flags } = node.regex!;
            let patternNode;
            const unicode = flags.includes('u');
            const unicodeSets = flags.includes('v');

            try {
                patternNode = parser.parsePattern(pattern, 0, pattern.length, {
                    unicode,
                    unicodeSets,
                });
            } catch {
                // Ignore regular expressions with syntax errors
                return;
            }

            const characterClassStack: (CharacterClass | ExpressionCharacterClass)[] = [];

            visitRegExpAST(patternNode, {
                onCharacterClassEnter: (characterClassNode) => characterClassStack.unshift(characterClassNode),
                onCharacterClassLeave: () => characterClassStack.shift(),
                onExpressionCharacterClassEnter: (characterClassNode) => {
                    characterClassStack.unshift(characterClassNode);
                },
                onExpressionCharacterClassLeave: () => characterClassStack.shift(),
                onCharacterEnter(characterNode) {
                    if (!characterNode.raw.startsWith('\\')) {
                        // It's not an escaped character.
                        return;
                    }

                    const escapedChar = characterNode.raw.slice(1);

                    if (escapedChar !== String.fromCodePoint(characterNode.value)) {
                        // It's a valid escape.
                        return;
                    }
                    let allowedEscapes;

                    if (characterClassStack.length) {
                        allowedEscapes = unicodeSets
                            ? REGEX_CLASSSET_CHARACTER_ESCAPES
                            : REGEX_GENERAL_ESCAPES;
                    } else {
                        allowedEscapes = REGEX_NON_CHARCLASS_ESCAPES;
                    }
                    if (allowedEscapes.has(escapedChar)) {
                        return;
                    }

                    const reportedIndex = characterNode.start + 1;
                    let disableEscapeBackslashSuggest = false;

                    if (characterClassStack.length) {
                        const characterClassNode = characterClassStack[0];

                        if (escapedChar === '^') {
                            /**
                             * The '^' character is also a special case; it must always be escaped outside of
                             * character classes, but
                             * it only needs to be escaped in character classes if it's at the beginning of the
                             * character class. To
                             * account for this, consider it to be a valid escape character outside of character
                             * classes, and filter
                             * out '^' characters that appear at the start of a character class.
                             */
                            if (characterClassNode!.start + 1 === characterNode.start) {
                                return;
                            }
                        }
                        if (!unicodeSets) {
                            if (escapedChar === '-') {
                                /**
                                 * The '-' character is a special case, because it's only valid to escape it if it's
                                 * in a character
                                 * class, and is not at either edge of the character class. To account for this,
                                 * don't consider '-'
                                 * characters to be valid in general, and filter out '-' characters that appear in
                                 * the middle of a
                                 * character class.
                                 */
                                if (
                                    characterClassNode!.start + 1 !== characterNode.start
                                    && characterNode.end !== characterClassNode!.end - 1
                                ) {
                                    return;
                                }
                            }
                        } else {
                            // unicodeSets mode
                            if (REGEX_CLASS_SET_RESERVED_DOUBLE_PUNCTUATOR.has(escapedChar)) {
                                // Escaping is valid if it is a ClassSetReservedDoublePunctuator.
                                if (pattern[characterNode.end] === escapedChar) {
                                    return;
                                }
                                if (pattern[characterNode.start - 1] === escapedChar) {
                                    if (escapedChar !== '^') {
                                        return;
                                    }

                                    // If the previous character is a `negate` caret(`^`), escape to caret is
                                    // unnecessary.

                                    if (!characterClassNode!.negate) {
                                        return;
                                    }
                                    const negateCaretIndex = characterClassNode!.start + 1;

                                    if (negateCaretIndex < characterNode.start - 1) {
                                        return;
                                    }
                                }
                            }

                            if (
                                characterNode.parent.type === 'ClassIntersection'
                                || characterNode.parent.type === 'ClassSubtraction'
                            ) {
                                disableEscapeBackslashSuggest = true;
                            }
                        }
                    }

                    report(node, reportedIndex, escapedChar, disableEscapeBackslashSuggest);
                },
            });
        }

        /**
         * Checks if a node has an escape.
         * @param node node to check.
         */
        function check(node: Node<'Literal' | 'TemplateElement'>) {
            const isTemplateElement = node.type === 'TemplateElement';

            if (
                isTemplateElement
                && node.parent
                && node.parent.parent
                && node.parent.parent.type === 'TaggedTemplateExpression'
                && node.parent === node.parent.parent.quasi
            ) {
                // Don't report tagged template literals, because the backslash character is accessible to the tag
                // function.
                return;
            }

            if (typeof node.value === 'string' || isTemplateElement) {
                /**
                 * JSXAttribute doesn't have any escape sequence: https://facebook.github.io/jsx/.
                 * In addition, backticks are not supported by JSX yet: https://github.com/facebook/jsx/issues/25.
                 */
                if (
                    node.parent.type === 'JSXAttribute'
                    || node.parent.type === 'JSXElement'
                    || node.parent.type === 'JSXFragment'
                ) {
                    return;
                }

                const value = isTemplateElement ? sourceCode.getText(node) : node.raw;
                const pattern = /\\[^\d]/gu;
                let match;

                for (match = pattern.exec(value!); match; match = pattern.exec(value!)) {
                    validateString(node, match);
                }
            } else if (node.regex) {
                validateRegExp(node);
            }
        }

        return {
            Literal: check,
            TemplateElement: check,
        };
    },
};

export default rule;
