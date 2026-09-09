/**
 * @file Rule to disallow negating the left operand of relational operators
 * @author Toru Nagashima
 */
import dependency0 from './utils/ast-utils';
import type { Fixer, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks whether the given operator is `in` or `instanceof`
 * @param op The operator type to check.
 * @returns `true` if the operator is `in` or `instanceof`
 */
function isInOrInstanceOfOperator(op: string) {
    return op === 'in' || op === 'instanceof';
}

/**
 * Checks whether the given operator is an ordering relational operator or not.
 * @param op The operator type to check.
 * @returns `true` if the operator is an ordering relational operator.
 */
function isOrderingRelationalOperator(op: string) {
    return op === '<' || op === '>' || op === '>=' || op === '<=';
}

/**
 * Checks whether the given node is a logical negation expression or not.
 * @param node The node to check.
 * @returns `true` if the node is a logical negation expression.
 */
function isNegation(node: Node) {
    return node.type === 'UnaryExpression' && node.operator === '!';
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ enforceForOrderingRelations?: boolean }?]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow negating the left operand of relational operators',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-unsafe-negation',
        },

        hasSuggestions: true,

        schema: [
            {
                type: 'object',
                properties: {
                    enforceForOrderingRelations: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        fixable: null,

        messages: {
            unexpected: "Unexpected negating the left operand of '{{operator}}' operator.",
            suggestNegatedExpression:
                "Negate '{{operator}}' expression instead of its left operand. This changes the current behavior.",
            suggestParenthesisedNegation:
                "Wrap negation in '()' to make the intention explicit. This preserves the current behavior.",
        },
    },

    create(context) {
        const { sourceCode } = context;
        const options = context.options[0] || {};
        const enforceForOrderingRelations = options.enforceForOrderingRelations === true;

        return {
            BinaryExpression(node: Node<'BinaryExpression'>) {
                const { operator } = node;
                const checksOrdering = enforceForOrderingRelations && isOrderingRelationalOperator(operator);

                if (
                    (isInOrInstanceOfOperator(operator) || checksOrdering)
                    && isNegation(node.left)
                    && !astUtils.isParenthesised(sourceCode, node.left)
                ) {
                    context.report({
                        node,
                        loc: node.left.loc,
                        messageId: 'unexpected',
                        data: { operator },
                        suggest: [
                            {
                                messageId: 'suggestNegatedExpression',
                                data: { operator },
                                fix(fixer: Fixer) {
                                    const negationToken = sourceCode.getFirstToken(node.left);
                                    const fixRange: [number, number] = [
                                        negationToken!.range[1],
                                        node.range[1],
                                    ];
                                    const text = sourceCode.text.slice(
                                        fixRange[0],
                                        fixRange[1],
                                    );

                                    return fixer.replaceTextRange(fixRange, `(${text})`);
                                },
                            },
                            {
                                messageId: 'suggestParenthesisedNegation',
                                fix(fixer: Fixer) {
                                    return fixer.replaceText(
                                        node.left,
                                        `(${sourceCode.getText(node.left)})`,
                                    );
                                },
                            },
                        ],
                    });
                }
            },
        };
    },
};

export default rule;
