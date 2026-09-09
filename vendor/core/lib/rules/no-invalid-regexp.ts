/**
 * @file Validate strings passed to the RegExp constructor
 * @author Michael Ficarra
 */
import * as dependency0 from '@eslint-community/regexpp';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const { RegExpValidator } = dependency0;
const validator = new RegExpValidator();
const validFlags = /[dgimsuvy]/gu;
const undefined1 = undefined;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ allowConstructorFlags?: string[] }?]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow invalid regular expression strings in `RegExp` constructors',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-invalid-regexp',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    allowConstructorFlags: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            regexMessage: '{{message}}.',
        },
    },

    create(context) {
        const options = context.options[0];
        let allowedFlags = null;

        if (options && options.allowConstructorFlags) {
            const temp = options.allowConstructorFlags.join('').replace(validFlags, '');

            if (temp) {
                allowedFlags = new RegExp(`[${temp}]`, 'giu');
            }
        }

        /**
         * Reports error with the provided message.
         * @param node The node holding the invalid RegExp
         * @param message The message to report.
         */
        function report(node: Node<'CallExpression' | 'NewExpression'>, message: string) {
            context.report({
                node,
                messageId: 'regexMessage',
                data: { message },
            });
        }

        /**
         * Check if node is a string
         * @param node node to evaluate
         * @returns True if its a string
         */
        function isString(node: Node | undefined): node is Node<'Literal'> & { value: string } {
            return !!node && node.type === 'Literal' && typeof node.value === 'string';
        }

        /**
         * Gets flags of a regular expression created by the given `RegExp()` or `new RegExp()` call
         * Examples:
         *     new RegExp(".")         // => ""
         *     new RegExp(".", "gu")   // => "gu"
         *     new RegExp(".", flags)  // => null
         * @param node `CallExpression` or `NewExpression` node
         * @returns flags if they can be determined, `null` otherwise
         */
        function getFlags(node: Node<'CallExpression' | 'NewExpression'>) {
            if (node.arguments.length < 2) {
                return '';
            }

            if (isString(node.arguments[1]!)) {
                return node.arguments[1]!.value;
            }

            return null;
        }

        /**
         * Check syntax error in a given pattern.
         * @param pattern The RegExp pattern to validate.
         * @param flags The RegExp flags to validate.
         * @param [flags.unicode] The Unicode flag.
         * @param [flags.unicodeSets] The UnicodeSets flag.
         * @returns The syntax error.
         */
        function validateRegExpPattern(
            pattern: string,
            flags: { unicode?: boolean; unicodeSets?: boolean },
        ) {
            try {
                validator.validatePattern(pattern, undefined1, undefined1, flags);
                return null;
            } catch (err) {
                if (!(err instanceof Error)) {
                    throw err;
                }
                return err.message;
            }
        }

        /**
         * Check syntax error in a given flags.
         * @param flags The RegExp flags to validate.
         * @returns The syntax error.
         */
        function validateRegExpFlags(flags: string | null) {
            if (!flags) {
                return null;
            }
            try {
                validator.validateFlags(flags);
            } catch {
                return `Invalid flags supplied to RegExp constructor '${flags}'`;
            }

            /**
             * `regexpp` checks the combination of `u` and `v` flags when parsing `Pattern` according to `ecma262`,
             * but this rule may check only the flag when the pattern is unidentifiable, so check it here.
             * https://tc39.es/ecma262/multipage/text-processing.html#sec-parsepattern
             */
            if (flags.includes('u') && flags.includes('v')) {
                return "Regex 'u' and 'v' flags cannot be used together";
            }
            return null;
        }

        return {
            'CallExpression, NewExpression': function onCallExpressionNewExpression(
                node: Node<'CallExpression' | 'NewExpression'>,
            ) {
                if (node.callee.type !== 'Identifier' || node.callee.name !== 'RegExp') {
                    return;
                }

                let flags = getFlags(node);

                if (flags && allowedFlags) {
                    flags = flags.replace(allowedFlags, '');
                }

                let message = validateRegExpFlags(flags);

                if (message) {
                    report(node, message);
                    return;
                }

                if (!isString(node.arguments[0]!)) {
                    return;
                }

                const pattern = node!.arguments[0]!.value;
                // If flags are unknown, report the regex only if its pattern is invalid both with and without
                // the "u" flag

                message = flags === null
                    ? validateRegExpPattern(pattern, {
                        unicode: true,
                        unicodeSets: false,
                    })
                          && validateRegExpPattern(pattern, {
                              unicode: false,
                              unicodeSets: true,
                          })
                          && validateRegExpPattern(pattern, { unicode: false, unicodeSets: false })
                    : validateRegExpPattern(pattern, {
                        unicode: flags!.includes('u'),
                        unicodeSets: flags!.includes('v'),
                    });

                if (message) {
                    report(node, message);
                }
            },
        };
    },
};

export default rule;
