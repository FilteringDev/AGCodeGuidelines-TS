/**
 * @file A rule to ensure whitespace before blocks.
 * @author Mathias Schreck <https://github.com/lo1tuma>
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import type {
    Fixer, LegacyRule, Node, Token,
} from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks whether the given node represents the body of a function.
 * @param node the node to check.
 * @returns `true` if the node is function body.
 */
function isFunctionBody(node: Node | Token) {
    const parent = 'parent' in node ? node.parent : null;

    return (
        node.type === 'BlockStatement' && astUtils.isFunction(parent) && parent.body === node
    );
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        (
            | 'always'
            | 'never'
            | {
                keywords?: 'always' | 'never' | 'off';
                functions?: 'always' | 'never' | 'off';
                classes?: 'always' | 'never' | 'off';
            }
        )?,
    ]
> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Enforce consistent spacing before blocks',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/space-before-blocks',
        },

        fixable: 'whitespace',

        schema: [
            {
                oneOf: [
                    {
                        enum: ['always', 'never'],
                    },
                    {
                        type: 'object',
                        properties: {
                            keywords: {
                                enum: ['always', 'never', 'off'],
                            },
                            functions: {
                                enum: ['always', 'never', 'off'],
                            },
                            classes: {
                                enum: ['always', 'never', 'off'],
                            },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        ],

        messages: {
            unexpectedSpace: 'Unexpected space before opening brace.',
            missingSpace: 'Missing space before opening brace.',
        },
    },

    create(context) {
        const config = context.options[0];
        const { sourceCode } = context;
        let alwaysFunctions = true;
        let alwaysKeywords = true;
        let alwaysClasses = true;
        let neverFunctions = false;
        let neverKeywords = false;
        let neverClasses = false;

        if (typeof config === 'object') {
            alwaysFunctions = config.functions === 'always';
            alwaysKeywords = config.keywords === 'always';
            alwaysClasses = config.classes === 'always';
            neverFunctions = config.functions === 'never';
            neverKeywords = config.keywords === 'never';
            neverClasses = config.classes === 'never';
        } else if (config === 'never') {
            alwaysFunctions = false;
            alwaysKeywords = false;
            alwaysClasses = false;
            neverFunctions = true;
            neverKeywords = true;
            neverClasses = true;
        }

        /**
         * Checks whether the spacing before the given block is already controlled by another rule:
         * - `arrow-spacing` checks spaces after `=>`.
         * - `keyword-spacing` checks spaces after keywords in certain contexts.
         * - `switch-colon-spacing` checks spaces after `:` of switch cases.
         * @param precedingToken first token before the block.
         * @param node `BlockStatement` node or `{` token of a `SwitchStatement` node.
         * @returns `true` if requiring or disallowing spaces before the given block could produce conflicts with
         * other rules.
         */
        function isConflicted(precedingToken: Token, node: Node | Token) {
            return (
                astUtils.isArrowToken(precedingToken)
                || (astUtils.isKeywordToken(precedingToken) && !isFunctionBody(node))
                || (astUtils.isColonToken(precedingToken)
                    && 'parent' in node
                    && node.parent
                    && node.parent.type === 'SwitchCase'
                    && precedingToken
                        === astUtils.getSwitchCaseColonToken(node.parent, sourceCode))
            );
        }

        /**
         * Checks the given BlockStatement node has a preceding space if it doesn’t start on a new line.
         * @param node The AST node of a BlockStatement.
         */
        function checkPrecedingSpace(node: Node | Token) {
            const precedingToken = sourceCode.getTokenBefore(node);

            if (
                precedingToken
                && !isConflicted(precedingToken, node)
                && astUtils.isTokenOnSameLine(precedingToken, node)
            ) {
                const hasSpace = sourceCode.isSpaceBetweenTokens(precedingToken, node);
                let requireSpace;
                let requireNoSpace;

                if (isFunctionBody(node)) {
                    requireSpace = alwaysFunctions;
                    requireNoSpace = neverFunctions;
                } else if (node.type === 'ClassBody') {
                    requireSpace = alwaysClasses;
                    requireNoSpace = neverClasses;
                } else {
                    requireSpace = alwaysKeywords;
                    requireNoSpace = neverKeywords;
                }

                if (requireSpace && !hasSpace) {
                    context.report({
                        node,
                        messageId: 'missingSpace',
                        fix(fixer: Fixer) {
                            return fixer.insertTextBefore(node, ' ');
                        },
                    });
                } else if (requireNoSpace && hasSpace) {
                    context.report({
                        node,
                        messageId: 'unexpectedSpace',
                        fix(fixer: Fixer) {
                            return fixer.removeRange([precedingToken.range[1], node.range[0]]);
                        },
                    });
                }
            }
        }

        /**
         * Checks if the CaseBlock of an given SwitchStatement node has a preceding space.
         * @param node The node of a SwitchStatement.
         */
        function checkSpaceBeforeCaseBlock(node: Node<'SwitchStatement'>) {
            const { cases } = node;
            let openingBrace;

            if (cases.length > 0) {
                openingBrace = sourceCode.getTokenBefore(cases[0]!);
            } else {
                openingBrace = sourceCode.getLastToken(node, 1);
            }

            checkPrecedingSpace(openingBrace!);
        }

        return {
            BlockStatement: checkPrecedingSpace,
            ClassBody: checkPrecedingSpace,
            SwitchStatement: checkSpaceBeforeCaseBlock,
        };
    },
};

export default rule;
