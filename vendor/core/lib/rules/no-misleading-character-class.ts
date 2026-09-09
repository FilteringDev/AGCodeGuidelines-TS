import { CALL, CONSTRUCT } from '@eslint-community/eslint-utils';
/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 */
import * as dependency1 from '@eslint-community/regexpp';
import dependency0 from '../../compat/eslint-utils';
import dependency2 from './utils/unicode';
import dependency3 from './utils/ast-utils';
import dependency4 from './utils/regular-expressions';
import type { Fixer, LegacyRule, Node } from '../../../types';

type Character = import('@eslint-community/regexpp').AST.Character;
type CharacterClassElement = import('@eslint-community/regexpp').AST.CharacterClassElement;

const { ReferenceTracker, getStringIfConstant } = dependency0;
const { RegExpParser, visitRegExpAST } = dependency1;
const {
    isCombiningCharacter, isEmojiModifier, isRegionalIndicatorSymbol, isSurrogatePair,
} = dependency2;
const astUtils = dependency3;
const { isValidWithUnicodeFlag } = dependency4;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 */

/**
 * Iterate character sequences of a given nodes.
 *
 * CharacterClassRange syntax can steal a part of character sequence,
 * so this function reverts CharacterClassRange syntax and restore the sequence.
 * @param nodes The node list to iterate character sequences.
 * @yields The list of character sequences.
 */
function* iterateCharacterSequence(nodes: CharacterClassElement[]) {
    let seq: Character[] = [];

    const characterNodes = nodes;
    for (let characterNodesIndex = 0; characterNodesIndex < characterNodes.length; characterNodesIndex += 1) {
        const node = characterNodes[characterNodesIndex]!;
        switch (node.type) {
            case 'Character':
                seq.push(node);
                break;

            case 'CharacterClassRange':
                seq.push(node.min);
                yield seq;
                seq = [node.max];
                break;

            case 'CharacterSet':
            case 'CharacterClass': // [[]] nesting character class
            case 'ClassStringDisjunction': // \q{...}
            case 'ExpressionCharacterClass': // [A--B]
                if (seq.length > 0) {
                    yield seq;
                    seq = [];
                }
                break;

            // no default
        }
    }

    if (seq.length > 0) {
        yield seq;
    }
}

/**
 * Checks whether the given character node is a Unicode code point escape or not.
 * @param char the character node to check.
 * @returns `true` if the character node is a Unicode code point escape.
 */
function isUnicodeCodePointEscape(char: Character) {
    return /^\\u\{[\da-f]+\}$/iu.test(char.raw);
}

/**
 * Each function returns `true` if it detects that kind of problem.
 */
const hasCharacterSequence: Record<string, (chars: Character[]) => boolean> = {
    surrogatePairWithoutUFlag(chars) {
        return chars.some((c, i) => {
            if (i === 0) {
                return false;
            }
            const c1 = chars[i - 1];

            return (
                isSurrogatePair(c1!.value, c.value)
                && !isUnicodeCodePointEscape(c1!)
                && !isUnicodeCodePointEscape(c)
            );
        });
    },

    surrogatePair(chars) {
        return chars.some((c, i) => {
            if (i === 0) {
                return false;
            }
            const c1 = chars[i - 1];

            return (
                isSurrogatePair(c1!.value, c.value)
                && (isUnicodeCodePointEscape(c1!) || isUnicodeCodePointEscape(c))
            );
        });
    },

    combiningClass(chars) {
        return chars.some(
            (c, i) => i !== 0
                && isCombiningCharacter(c.value)
                && !isCombiningCharacter(chars![i - 1]!.value),
        );
    },

    emojiModifier(chars) {
        return chars.some(
            (c, i) => i !== 0 && isEmojiModifier(c.value) && !isEmojiModifier(chars![i - 1]!.value),
        );
    },

    regionalIndicatorSymbol(chars) {
        return chars.some(
            (c, i) => i !== 0
                && isRegionalIndicatorSymbol(c.value)
                && isRegionalIndicatorSymbol(chars![i - 1]!.value),
        );
    },

    zwj(chars) {
        const lastIndex = chars.length - 1;

        return chars.some(
            (c, i) => i !== 0
                && i !== lastIndex
                && c.value === 0x200d
                && chars![i - 1]!.value !== 0x200d
                && chars![i + 1]!.value !== 0x200d,
        );
    },
};

const kinds = Object.keys(hasCharacterSequence);

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description:
                'Disallow characters which are made with multiple code points in character class syntax',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-misleading-character-class',
        },

        hasSuggestions: true,

        schema: [],

        messages: {
            surrogatePairWithoutUFlag:
                "Unexpected surrogate pair in character class. Use 'u' flag.",
            surrogatePair: 'Unexpected surrogate pair in character class.',
            combiningClass: 'Unexpected combined character in character class.',
            emojiModifier: 'Unexpected modified Emoji in character class.',
            regionalIndicatorSymbol: 'Unexpected national flag in character class.',
            zwj: 'Unexpected joined character sequence in character class.',
            suggestUnicodeFlag: "Add unicode 'u' flag to regex.",
        },
    },
    create(context) {
        const { sourceCode } = context;
        const parser = new RegExpParser();

        /**
         * Verify a given regular expression.
         * @param node The node to report.
         * @param pattern The regular expression pattern to verify.
         * @param flags The flags of the regular expression.
         * @param unicodeFixer Fixer for missing "u" flag.
         */
        function verify(
            node: Node,
            pattern: string,
            flags: string,
            unicodeFixer: (fixer: Fixer) => { range: [number, number]; text: string } | null,
        ) {
            let patternNode;

            try {
                patternNode = parser.parsePattern(pattern, 0, pattern.length, {
                    unicode: flags.includes('u'),
                    unicodeSets: flags.includes('v'),
                });
            } catch {
                // Ignore regular expressions with syntax errors
                return;
            }

            const foundKinds: Set<string> = new Set();

            visitRegExpAST(patternNode, {
                onCharacterClassEnter(ccNode) {
                    Array.from(iterateCharacterSequence(ccNode.elements)).forEach((chars) => {
                        kinds.forEach((kind) => {
                            if (hasCharacterSequence[kind]!(chars)) {
                                foundKinds.add(kind);
                            }
                        });
                    });
                },
            });

            Array.from(foundKinds).forEach((kind) => {
                let suggest;

                if (kind === 'surrogatePairWithoutUFlag') {
                    suggest = [
                        {
                            messageId: 'suggestUnicodeFlag',
                            fix: unicodeFixer,
                        },
                    ];
                }

                context.report({
                    node,
                    messageId: kind,
                    suggest,
                });
            });
        }

        return {
            'Literal[regex]': function onLiteralRegex(node: Node<'Literal'>) {
                verify(node, node.regex!.pattern, node.regex!.flags, (fixer: Fixer) => {
                    if (
                        !isValidWithUnicodeFlag(
                            context.languageOptions.ecmaVersion,
                            node.regex!.pattern,
                        )
                    ) {
                        return null;
                    }

                    return fixer.insertTextAfter(node, 'u');
                });
            },
            Program(node: Node<'Program'>) {
                const scope = sourceCode.getScope(node);
                const tracker = new ReferenceTracker(scope);

                /**
                 * Iterate calls of RegExp.
                 * E.g., `new RegExp()`, `RegExp()`, `new window.RegExp()`,
                 *       `const {RegExp: a} = window; new a()`, etc...
                 */
                Array.from(
                    tracker.iterateGlobalReferences({
                        RegExp: { [CALL]: true, [CONSTRUCT]: true },
                    }),
                ).forEach(({ node: refNode }) => {
                    const [patternNode, flagsNode] = refNode.arguments;
                    const pattern = getStringIfConstant(patternNode!, scope);
                    const flags = getStringIfConstant(flagsNode!, scope);

                    if (typeof pattern === 'string') {
                        verify(refNode, pattern, flags || '', (fixer: Fixer) => {
                            if (
                                !isValidWithUnicodeFlag(
                                    context.languageOptions.ecmaVersion,
                                    pattern,
                                )
                            ) {
                                return null;
                            }

                            if (refNode.arguments.length === 1) {
                                const penultimateToken = sourceCode.getLastToken(refNode, {
                                    skip: 1,
                                }); // skip closing parenthesis

                                return fixer.insertTextAfter(
                                    penultimateToken!,
                                    astUtils.isCommaToken(penultimateToken!)
                                        ? ' "u",'
                                        : ', "u"',
                                );
                            }

                            if (
                                (flagsNode!.type === 'Literal'
                                    && typeof flagsNode!.value === 'string')
                                || flagsNode!.type === 'TemplateLiteral'
                            ) {
                                const range: [number, number] = [
                                    flagsNode!.range[0],
                                    flagsNode!.range[1] - 1,
                                ];

                                return fixer.insertTextAfterRange(range, 'u');
                            }

                            return null;
                        });
                    }
                });
            },
        };
    },
};

export default rule;
