/**
 * @file Disallows or enforces spaces inside computed properties.
 * @author Jamund Ferguson
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

const rule: LegacyRule<[('always' | 'never')?, { enforceForClassMembers?: boolean }?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Enforce consistent spacing inside computed property brackets',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/computed-property-spacing',
        },

        fixable: 'whitespace',

        schema: [
            {
                enum: ['always', 'never'],
            },
            {
                type: 'object',
                properties: {
                    enforceForClassMembers: {
                        type: 'boolean',
                        default: true,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            unexpectedSpaceBefore: "There should be no space before '{{tokenValue}}'.",
            unexpectedSpaceAfter: "There should be no space after '{{tokenValue}}'.",

            missingSpaceBefore: "A space is required before '{{tokenValue}}'.",
            missingSpaceAfter: "A space is required after '{{tokenValue}}'.",
        },
    },

    create(context) {
        const { sourceCode } = context;
        const propertyNameMustBeSpaced = context.options[0] === 'always'; // default is "never"
        const enforceForClassMembers = !context.options[1] || context.options[1].enforceForClassMembers;

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Reports that there shouldn't be a space after the first token
         * @param node The node to report in the event of an error.
         * @param token The token to use for the report.
         * @param tokenAfter The token after `token`.
         */
        function reportNoBeginningSpace(
            node: Node<
                'MemberExpression' | 'MethodDefinition' | 'Property' | 'PropertyDefinition'
            >,
            token: Token,
            tokenAfter: Token,
        ) {
            context.report({
                node,
                loc: { start: token.loc.end, end: tokenAfter.loc.start },
                messageId: 'unexpectedSpaceAfter',
                data: {
                    tokenValue: token.value,
                },
                fix(fixer: Fixer) {
                    return fixer.removeRange([token.range[1], tokenAfter.range[0]]);
                },
            });
        }

        /**
         * Reports that there shouldn't be a space before the last token
         * @param node The node to report in the event of an error.
         * @param token The token to use for the report.
         * @param tokenBefore The token before `token`.
         */
        function reportNoEndingSpace(
            node: Node<
                'MemberExpression' | 'MethodDefinition' | 'Property' | 'PropertyDefinition'
            >,
            token: Token,
            tokenBefore: Token,
        ) {
            context.report({
                node,
                loc: { start: tokenBefore.loc.end, end: token.loc.start },
                messageId: 'unexpectedSpaceBefore',
                data: {
                    tokenValue: token.value,
                },
                fix(fixer: Fixer) {
                    return fixer.removeRange([tokenBefore.range[1], token.range[0]]);
                },
            });
        }

        /**
         * Reports that there should be a space after the first token
         * @param node The node to report in the event of an error.
         * @param token The token to use for the report.
         */
        function reportRequiredBeginningSpace(
            node: Node<
                'MemberExpression' | 'MethodDefinition' | 'Property' | 'PropertyDefinition'
            >,
            token: Token,
        ) {
            context.report({
                node,
                loc: token.loc,
                messageId: 'missingSpaceAfter',
                data: {
                    tokenValue: token.value,
                },
                fix(fixer: Fixer) {
                    return fixer.insertTextAfter(token, ' ');
                },
            });
        }

        /**
         * Reports that there should be a space before the last token
         * @param node The node to report in the event of an error.
         * @param token The token to use for the report.
         */
        function reportRequiredEndingSpace(
            node: Node<
                'MemberExpression' | 'MethodDefinition' | 'Property' | 'PropertyDefinition'
            >,
            token: Token,
        ) {
            context.report({
                node,
                loc: token.loc,
                messageId: 'missingSpaceBefore',
                data: {
                    tokenValue: token.value,
                },
                fix(fixer: Fixer) {
                    return fixer.insertTextBefore(token, ' ');
                },
            });
        }

        /**
         * Returns a function that checks the spacing of a node on the property name
         * that was passed in.
         * @param propertyName The property on the node to check for spacing
         * @returns A function that will check spacing on a node
         */
        function checkSpacing<Key extends string>(propertyName: Key) {
            return function checkNodeSpacing(node: Node & Record<Key, Node>) {
                if (!node.computed) {
                    return;
                }

                const property = node[propertyName];

                const before = sourceCode.getTokenBefore(
                    property,
                    astUtils.isOpeningBracketToken,
                );
                const first = sourceCode.getTokenAfter(before!, { includeComments: true });
                const after = sourceCode.getTokenAfter(
                    property,
                    astUtils.isClosingBracketToken,
                );
                const last = sourceCode.getTokenBefore(after!, { includeComments: true });

                if (astUtils.isTokenOnSameLine(before!, first!)) {
                    if (propertyNameMustBeSpaced) {
                        if (
                            !sourceCode.isSpaceBetweenTokens(before!, first!)
                            && astUtils.isTokenOnSameLine(before!, first!)
                        ) {
                            reportRequiredBeginningSpace(node, before!);
                        }
                    } else if (sourceCode.isSpaceBetweenTokens(before!, first!)) {
                        reportNoBeginningSpace(node, before!, first!);
                    }
                }

                if (astUtils.isTokenOnSameLine(last!, after!)) {
                    if (propertyNameMustBeSpaced) {
                        if (
                            !sourceCode.isSpaceBetweenTokens(last!, after!)
                            && astUtils.isTokenOnSameLine(last!, after!)
                        ) {
                            reportRequiredEndingSpace(node, after!);
                        }
                    } else if (sourceCode.isSpaceBetweenTokens(last!, after!)) {
                        reportNoEndingSpace(node, after!, last!);
                    }
                }
            };
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        const listeners: LegacyListener = {
            Property: checkSpacing('key'),
            MemberExpression: checkSpacing('property'),
        };

        if (enforceForClassMembers) {
            listeners.MethodDefinition = checkSpacing('key');
            listeners.PropertyDefinition = checkSpacing('key');
        }

        return listeners;
    },
};

export default rule;
