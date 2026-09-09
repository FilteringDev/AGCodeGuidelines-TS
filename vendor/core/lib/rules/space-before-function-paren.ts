/**
 * @file Rule to validate spacing before function paren.
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
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        (
            | 'always'
            | 'never'
            | {
                anonymous?: 'always' | 'never' | 'ignore';
                named?: 'always' | 'never' | 'ignore';
                asyncArrow?: 'always' | 'never' | 'ignore';
            }
        )?,
    ]
> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description:
                'Enforce consistent spacing before `function` definition opening parenthesis',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/space-before-function-paren',
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
                            anonymous: {
                                enum: ['always', 'never', 'ignore'],
                            },
                            named: {
                                enum: ['always', 'never', 'ignore'],
                            },
                            asyncArrow: {
                                enum: ['always', 'never', 'ignore'],
                            },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        ],

        messages: {
            unexpectedSpace: 'Unexpected space before function parentheses.',
            missingSpace: 'Missing space before function parentheses.',
        },
    },

    create(context) {
        const { sourceCode } = context;
        const baseConfig = typeof context.options[0] === 'string' ? context.options[0] : 'always';
        const overrideConfig = typeof context.options[0] === 'object' ? context.options[0] : {};

        /**
         * Determines whether a function has a name.
         * @param node The function node.
         * @returns Whether the function has a name.
         */
        function isNamedFunction(node: Node<'FunctionDeclaration' | 'FunctionExpression'>) {
            if (node.id) {
                return true;
            }

            const { parent } = node;

            return (
                parent.type === 'MethodDefinition'
                || (parent.type === 'Property'
                    && (parent.kind === 'get' || parent.kind === 'set' || parent.method))
            );
        }

        /**
         * Gets the config for a given function
         * @param node The function node
         * @returns "always", "never", or "ignore"
         */
        function getConfigForFunction(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
        ) {
            if (node.type === 'ArrowFunctionExpression') {
                // Always ignore non-async functions and arrow functions without parens, e.g. async foo => bar
                if (
                    node.async
                    && astUtils.isOpeningParenToken(sourceCode.getFirstToken(node, { skip: 1 })!)
                ) {
                    return overrideConfig.asyncArrow || baseConfig;
                }
            } else if (isNamedFunction(node)) {
                return overrideConfig.named || baseConfig;

                // `generator-star-spacing` should warn anonymous generators. E.g. `function* () {}`
            } else if (!node.generator) {
                return overrideConfig.anonymous || baseConfig;
            }

            return 'ignore';
        }

        /**
         * Checks the parens of a function node
         * @param node A function node
         */
        function checkFunction(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
        ) {
            const functionConfig = getConfigForFunction(node);

            if (functionConfig === 'ignore') {
                return;
            }

            const rightToken = sourceCode.getFirstToken(node, astUtils.isOpeningParenToken);
            const leftToken = sourceCode.getTokenBefore(rightToken!);
            const hasSpacing = sourceCode.isSpaceBetweenTokens(leftToken!, rightToken!);

            if (hasSpacing && functionConfig === 'never') {
                context.report({
                    node,
                    loc: {
                        start: leftToken!.loc.end,
                        end: rightToken!.loc.start,
                    },
                    messageId: 'unexpectedSpace',
                    fix(fixer: Fixer) {
                        const comments = sourceCode.getCommentsBefore(rightToken!);

                        // Don't fix anything if there's a single line comment between the left and the right token
                        if (comments.some((comment: Token) => comment.type === 'Line')) {
                            return null;
                        }
                        return fixer.replaceTextRange(
                            [leftToken!.range[1], rightToken!.range[0]],
                            comments.reduce(
                                (text, comment: Token) => text + sourceCode.getText(comment),
                                '',
                            ),
                        );
                    },
                });
            } else if (!hasSpacing && functionConfig === 'always') {
                context.report({
                    node,
                    loc: rightToken!.loc,
                    messageId: 'missingSpace',
                    fix: (fixer: Fixer) => fixer.insertTextAfter(leftToken!, ' '),
                });
            }
        }

        return {
            ArrowFunctionExpression: checkFunction,
            FunctionDeclaration: checkFunction,
            FunctionExpression: checkFunction,
        };
    },
};

export default rule;
