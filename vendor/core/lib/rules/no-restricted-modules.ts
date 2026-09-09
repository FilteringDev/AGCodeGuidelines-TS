/**
 * @file Restrict usage of specified node modules.
 * @author Christian Schulz
 * @deprecated in ESLint v7.0.0
 */
import dependency1 from 'ignore';
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

type JSONSchema4 = Exclude<
    NonNullable<NonNullable<LegacyRule['meta']>['schema']>,
    false | unknown[]
>;
type PathRestriction = string | { name: string; message?: string };
type PatternRestrictions = { paths?: PathRestriction[]; patterns?: string[] };

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const ignore = dependency1;

const arrayOfStrings: JSONSchema4 = {
    type: 'array',
    items: { type: 'string' },
    uniqueItems: true,
};

const arrayOfStringsOrObjects: JSONSchema4 = {
    type: 'array',
    items: {
        anyOf: [
            { type: 'string' },
            {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    message: {
                        type: 'string',
                        minLength: 1,
                    },
                },
                additionalProperties: false,
                required: ['name'],
            },
        ],
    },
    uniqueItems: true,
};

const rule: LegacyRule<
    | (string | { name: string; message?: string })[]
    | { paths?: (string | { name: string; message?: string })[]; patterns?: string[] }[]
> = {
    meta: {
        deprecated: true,

        replacedBy: [],

        type: 'suggestion',

        docs: {
            description: 'Disallow specified modules when loaded by `require`',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-restricted-modules',
        },

        schema: {
            anyOf: [
                arrayOfStringsOrObjects,
                {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            paths: arrayOfStringsOrObjects,
                            patterns: arrayOfStrings,
                        },
                        additionalProperties: false,
                    },
                    additionalItems: false,
                },
            ],
        },

        messages: {
            defaultMessage: "'{{name}}' module is restricted from being used.",
            // eslint-disable-next-line eslint-plugin/report-message-format -- Custom message might not end in a
            // period
            customMessage: "'{{name}}' module is restricted from being used. {{customMessage}}",
            patternMessage: "'{{name}}' module is restricted from being used by a pattern.",
        },
    },

    create(context) {
        const options = Array.isArray(context.options) ? context.options : [];
        const isPathAndPatternsObject = typeof options[0] === 'object'
            && (Object.prototype.hasOwnProperty.call(options[0], 'paths')
                || Object.prototype.hasOwnProperty.call(options[0], 'patterns'));

        // Schema validation and the own-property check distinguish these two option forms.
        const patternOptions = options[0] as PatternRestrictions | undefined;
        const restrictedPaths = (isPathAndPatternsObject
            ? patternOptions!.paths
            : (context.options as PathRestriction[])) || [];
        const restrictedPatterns = (isPathAndPatternsObject ? patternOptions!.patterns : []) || [];

        const restrictedPathMessages = restrictedPaths.reduce<
            Record<string, string | null | undefined>
        >((memo, importName) => {
            if (typeof importName === 'string') {
                Object.assign(memo, { [importName]: null });
            } else {
                Object.assign(memo, { [importName.name]: importName.message });
            }
            return memo;
        }, {});

        // if no imports are restricted we don't need to check
        if (Object.keys(restrictedPaths).length === 0 && restrictedPatterns.length === 0) {
            return {};
        }

        // relative paths are supported for this rule
        const ig = ignore({ allowRelativePaths: true }).add(restrictedPatterns);

        /**
         * Function to check if a node is a string literal.
         * @param node The node to check.
         * @returns If the node is a string literal.
         */
        function isStringLiteral(node: Node): node is Node<'Literal'> & { value: string } {
            return node && node.type === 'Literal' && typeof node.value === 'string';
        }

        /**
         * Function to check if a node is a require call.
         * @param node The node to check.
         * @returns If the node is a require call.
         */
        function isRequireCall(node: Node<'CallExpression'>) {
            return node.callee.type === 'Identifier' && node.callee.name === 'require';
        }

        /**
         * Extract string from Literal or TemplateLiteral node
         * @param node The node to extract from
         * @returns Extracted string or null if node doesn't represent a string
         */
        function getFirstArgumentString(node: Node) {
            if (isStringLiteral(node)) {
                return node.value!.trim();
            }

            if (astUtils.isStaticTemplateLiteral(node)) {
                return node.quasis[0]!.value.cooked!.trim();
            }

            return null;
        }

        /**
         * Report a restricted path.
         * @param node representing the restricted path reference
         * @param name restricted path
         */
        function reportPath(node: Node<'CallExpression'>, name: string) {
            const customMessage = restrictedPathMessages[name];
            const messageId = customMessage ? 'customMessage' : 'defaultMessage';

            context.report({
                node,
                messageId,
                data: {
                    name,
                    customMessage,
                },
            });
        }

        /**
         * Check if the given name is a restricted path name
         * @param name name of a variable
         * @returns whether the variable is a restricted path or not
         */
        function isRestrictedPath(name: string) {
            return Object.prototype.hasOwnProperty.call(restrictedPathMessages, name);
        }

        return {
            CallExpression(node: Node<'CallExpression'>) {
                if (isRequireCall(node)) {
                    // node has arguments
                    if (node.arguments.length) {
                        const name = getFirstArgumentString(node.arguments[0]!);

                        // if first argument is a string literal or a static string template literal
                        if (name) {
                            // check if argument value is in restricted modules array
                            if (isRestrictedPath(name)) {
                                reportPath(node, name);
                            }

                            if (restrictedPatterns.length > 0 && ig.ignores(name)) {
                                context.report({
                                    node,
                                    messageId: 'patternMessage',
                                    data: { name },
                                });
                            }
                        }
                    }
                }
            },
        };
    },
};

export default rule;
