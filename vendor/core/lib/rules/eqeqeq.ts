/**
 * @file Rule to flag statements that use != and == instead of !== and ===
 * @author Nicholas C. Zakas
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
    ['always'?, { null?: 'always' | 'never' | 'ignore' }?] | [('smart' | 'allow-null')?]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Require the use of `===` and `!==`',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/eqeqeq',
        },

        schema: {
            anyOf: [
                {
                    type: 'array',
                    items: [
                        {
                            enum: ['always'],
                        },
                        {
                            type: 'object',
                            properties: {
                                null: {
                                    enum: ['always', 'never', 'ignore'],
                                },
                            },
                            additionalProperties: false,
                        },
                    ],
                    additionalItems: false,
                },
                {
                    type: 'array',
                    items: [
                        {
                            enum: ['smart', 'allow-null'],
                        },
                    ],
                    additionalItems: false,
                },
            ],
        },

        fixable: 'code',

        messages: {
            unexpected: "Expected '{{expectedOperator}}' and instead saw '{{actualOperator}}'.",
        },
    },

    create(context) {
        const config = context.options[0] || 'always';
        const options = context.options[1] || {};
        const { sourceCode } = context;

        const nullOption = config === 'always' ? options.null || 'always' : 'ignore';
        const enforceRuleForNull = nullOption === 'always';
        const enforceInverseRuleForNull = nullOption === 'never';

        /**
         * Checks if an expression is a typeof expression
         * @param node The node to check
         * @returns if the node is a typeof expression
         */
        function isTypeOf(node: Node) {
            return node.type === 'UnaryExpression' && node.operator === 'typeof';
        }

        /**
         * Checks if either operand of a binary expression is a typeof operation
         * @param node The node to check
         * @returns if one of the operands is typeof
         */
        function isTypeOfBinary(node: Node<'BinaryExpression'>) {
            return isTypeOf(node.left) || isTypeOf(node.right);
        }

        /**
         * Checks if operands are literals of the same type (via typeof)
         * @param node The node to check
         * @returns if operands are of same type
         */
        function areLiteralsAndSameType(node: Node<'BinaryExpression'>) {
            return (
                node.left.type === 'Literal'
                && node.right.type === 'Literal'
                && typeof node.left.value === typeof node.right.value
            );
        }

        /**
         * Checks if one of the operands is a literal null
         * @param node The node to check
         * @returns if operands are null
         */
        function isNullCheck(node: Node<'BinaryExpression'>) {
            return astUtils.isNullLiteral(node.right) || astUtils.isNullLiteral(node.left);
        }

        /**
         * Reports a message for this rule.
         * @param node The binary expression node that was checked
         * @param expectedOperator The operator that was expected (either '==', '!=', '===', or '!==')
         */
        function report(node: Node<'BinaryExpression'>, expectedOperator: string) {
            const operatorToken = sourceCode.getFirstTokenBetween(
                node.left,
                node.right,
                (token: Token) => token.value === node.operator,
            );

            context.report({
                node,
                loc: operatorToken!.loc,
                messageId: 'unexpected',
                data: { expectedOperator, actualOperator: node.operator },
                fix(fixer: Fixer) {
                    // If the comparison is a `typeof` comparison or both sides are literals with the same type,
                    // then it's safe to fix.
                    if (isTypeOfBinary(node) || areLiteralsAndSameType(node)) {
                        return fixer.replaceText(operatorToken!, expectedOperator);
                    }
                    return null;
                },
            });
        }

        return {
            BinaryExpression(node: Node<'BinaryExpression'>) {
                const isNull = isNullCheck(node);

                if (node.operator !== '==' && node.operator !== '!=') {
                    if (enforceInverseRuleForNull && isNull) {
                        report(node, node.operator.slice(0, -1));
                    }
                    return;
                }

                if (
                    config === 'smart'
                    && (isTypeOfBinary(node) || areLiteralsAndSameType(node) || isNull)
                ) {
                    return;
                }

                if (!enforceRuleForNull && isNull) {
                    return;
                }

                report(node, `${node.operator}=`);
            },
        };
    },
};

export default rule;
