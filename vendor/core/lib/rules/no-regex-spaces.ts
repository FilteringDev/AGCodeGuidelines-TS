/**
 * @file Rule to count multiple spaces in regular expressions
 * @author Matt DuVall <http://www.mattduvall.com/>
 */
import * as dependency1 from '@eslint-community/regexpp';
import dependency0 from './utils/ast-utils';
import type { Fixer, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;
const regexpp = dependency1;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const regExpParser = new regexpp.RegExpParser();
const DOUBLE_SPACE = / {2}/u;

/**
 * Check if node is a string
 * @param node node to evaluate
 * @returns True if its a string
 */
function isString(node: Node): node is Node<'Literal'> & { value: string } {
    return node && node.type === 'Literal' && typeof node.value === 'string';
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow multiple spaces in regular expressions',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-regex-spaces',
        },

        schema: [],
        fixable: 'code',

        messages: {
            multipleSpaces: 'Spaces are hard to count. Use {{{length}}}.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * Validate regular expression
         * @param nodeToReport Node to report.
         * @param pattern Regular expression pattern to validate.
         * @param rawPattern Raw representation of the pattern in the source code.
         * @param rawPatternStartRange Start range of the pattern in the source code.
         * @param flags Regular expression flags.
         */
        function checkRegex(
            nodeToReport: Node<'CallExpression' | 'Literal' | 'NewExpression'>,
            pattern: string,
            rawPattern: string,
            rawPatternStartRange: number,
            flags: string,
        ) {
            // Skip if there are no consecutive spaces in the source code, to avoid reporting e.g., RegExp(' \ ').
            if (!DOUBLE_SPACE.test(rawPattern)) {
                return;
            }

            const characterClassNodes: dependency1.AST.CharacterClass[] = [];
            let regExpAST;

            try {
                regExpAST = regExpParser.parsePattern(pattern, 0, pattern.length, {
                    unicode: flags.includes('u'),
                    unicodeSets: flags.includes('v'),
                });
            } catch {
                // Ignore regular expressions with syntax errors
                return;
            }

            regexpp.visitRegExpAST(regExpAST, {
                onCharacterClassEnter(ccNode) {
                    characterClassNodes.push(ccNode);
                },
            });

            const spacesPattern = /( {2,})(?: [+*{?]|[^+*{?]|$)/gu;
            let match;

            for (
                match = spacesPattern.exec(pattern);
                match;
                match = spacesPattern.exec(pattern)
            ) {
                const { index } = match;
                const { length } = match[1]!;

                // Report only consecutive spaces that are not in character classes.
                if (
                    characterClassNodes.every(({ start, end }) => index < start || end <= index)
                ) {
                    context.report({
                        node: nodeToReport,
                        messageId: 'multipleSpaces',
                        data: { length },
                        fix(fixer: Fixer) {
                            if (pattern !== rawPattern) {
                                return null;
                            }
                            return fixer.replaceTextRange(
                                [
                                    rawPatternStartRange + index,
                                    rawPatternStartRange + index + length,
                                ],
                                ` {${length}}`,
                            );
                        },
                    });

                    // Report only the first occurrence of consecutive spaces
                    return;
                }
            }
        }

        /**
         * Validate regular expression literals
         * @param node node to validate
         */
        function checkLiteral(node: Node<'Literal'>) {
            if (node.regex) {
                const { pattern } = node.regex;
                const rawPattern = node!.raw!.slice(1, node!.raw!.lastIndexOf('/'));
                const rawPatternStartRange = node.range[0] + 1;
                const { flags } = node.regex;

                checkRegex(node, pattern, rawPattern, rawPatternStartRange, flags);
            }
        }

        /**
         * Validate strings passed to the RegExp constructor
         * @param node node to validate
         */
        function checkFunction(node: Node<'CallExpression' | 'NewExpression'>) {
            const scope = sourceCode.getScope(node);
            const regExpVar = astUtils.getVariableByName(scope, 'RegExp');
            const shadowed = regExpVar && regExpVar.defs.length > 0;
            const patternNode = node.arguments[0];

            if (
                node.callee.type === 'Identifier'
                && node.callee.name === 'RegExp'
                && isString(patternNode!)
                && !shadowed
            ) {
                const pattern = patternNode!.value;
                const rawPattern = patternNode!.raw!.slice(1, -1);
                const rawPatternStartRange = patternNode!.range[0] + 1;
                let flags;

                if (node.arguments.length < 2) {
                    // It has no flags.
                    flags = '';
                } else {
                    const flagsNode = node.arguments[1];

                    if (isString(flagsNode!)) {
                        flags = flagsNode!.value;
                    } else {
                        // The flags cannot be determined.
                        return;
                    }
                }

                checkRegex(node, pattern, rawPattern, rawPatternStartRange, flags);
            }
        }

        return {
            Literal: checkLiteral,
            CallExpression: checkFunction,
            NewExpression: checkFunction,
        };
    },
};

export default rule;
