/**
 * @file Rule to disallow `\8` and `\9` escape sequences in string literals.
 * @author Milos Djermanovic
 */
import type { Fixer, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const QUICK_TEST_REGEX = /\\[89]/u;

/**
 * Returns unicode escape sequence that represents the given character.
 * @param character A single code unit.
 * @returns "\uXXXX" sequence.
 */
function getUnicodeEscape(character: string) {
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow `\\8` and `\\9` escape sequences in string literals',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-nonoctal-decimal-escape',
        },

        hasSuggestions: true,

        schema: [],

        messages: {
            decimalEscape: "Don't use '{{decimalEscape}}' escape sequence.",

            // suggestions
            refactor:
                "Replace '{{original}}' with '{{replacement}}'. This maintains the current functionality.",
            escapeBackslash:
                "Replace '{{original}}' with '{{replacement}}' to include the actual backslash character.",
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * Creates a new Suggestion object.
         * @param messageId "refactor" or "escapeBackslash".
         * @param range The range to replace.
         * @param replacement New text for the range.
         * @returns Suggestion
         */
        function createSuggestion(
            messageId: string,
            range: [number, number],
            replacement: string,
        ) {
            return {
                messageId,
                data: {
                    original: sourceCode.getText().slice(...range),
                    replacement,
                },
                fix(fixer: Fixer) {
                    return fixer.replaceTextRange(range, replacement);
                },
            };
        }

        return {
            Literal(node: Node<'Literal'>) {
                if (typeof node.value !== 'string') {
                    return;
                }

                if (!QUICK_TEST_REGEX.test(node.raw!)) {
                    return;
                }

                const regex = /(?:[^\\]|(?<previousEscape>\\.))*?(?<decimalEscape>\\[89])/suy;
                let match;

                for (match = regex.exec(node.raw!); match; match = regex.exec(node.raw!)) {
                    const { previousEscape, decimalEscape } = match.groups!;
                    const decimalEscapeRangeEnd = node.range[0] + match.index + match[0].length;
                    const decimalEscapeRangeStart = decimalEscapeRangeEnd - decimalEscape!.length;
                    const decimalEscapeRange: [number, number] = [
                        decimalEscapeRangeStart,
                        decimalEscapeRangeEnd,
                    ];
                    const suggest: {
                        messageId: string;
                        data: { original: string; replacement: string };
                        fix(fixer: Fixer): { range: [number, number]; text: string };
                    }[] = [];

                    // When `regex` is matched, `previousEscape` can only capture characters adjacent to
                    // `decimalEscape`
                    if (previousEscape === '\\0') {
                        /**
                         * Now we have a NULL escape "\0" immediately followed by a decimal escape, e.g.: "\0\8".
                         * Fixing this to "\08" would turn "\0" into a legacy octal escape. To avoid producing
                         * an octal escape while fixing a decimal escape, we provide different suggestions.
                         */
                        suggest.push(
                            createSuggestion(
                                // "\0\8" -> "\u00008"
                                'refactor',
                                [
                                    decimalEscapeRangeStart - previousEscape.length,
                                    decimalEscapeRangeEnd,
                                ],
                                `${getUnicodeEscape('\0')}${decimalEscape![1]}`,
                            ),
                            createSuggestion(
                                // "\8" -> "\u0038"
                                'refactor',
                                decimalEscapeRange,
                                getUnicodeEscape(decimalEscape![1]!),
                            ),
                        );
                    } else {
                        suggest.push(
                            createSuggestion(
                                // "\8" -> "8"
                                'refactor',
                                decimalEscapeRange,
                                decimalEscape![1]!,
                            ),
                        );
                    }

                    suggest.push(
                        createSuggestion(
                            // "\8" -> "\\8"
                            'escapeBackslash',
                            decimalEscapeRange,
                            `\\${decimalEscape}`,
                        ),
                    );

                    context.report({
                        node,
                        loc: {
                            start: sourceCode.getLocFromIndex(decimalEscapeRangeStart),
                            end: sourceCode.getLocFromIndex(decimalEscapeRangeEnd),
                        },
                        messageId: 'decimalEscape',
                        data: {
                            decimalEscape,
                        },
                        suggest,
                    });
                }
            },
        };
    },
};

export default rule;
