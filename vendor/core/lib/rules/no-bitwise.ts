/**
 * @file Rule to flag bitwise identifiers
 * @author Nicholas C. Zakas
 */
import type { LegacyRule, Node } from '../../../types';

/**
 *
 * Set of bitwise operators.
 *
 */
const BITWISE_OPERATORS = [
    '^',
    '|',
    '&',
    '<<',
    '>>',
    '>>>',
    '^=',
    '|=',
    '&=',
    '<<=',
    '>>=',
    '>>>=',
    '~',
];

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        {
            allow?: (
                | '^'
                | '|'
                | '&'
                | '<<'
                | '>>'
                | '>>>'
                | '^='
                | '|='
                | '&='
                | '<<='
                | '>>='
                | '>>>='
                | '~'
            )[];
            int32Hint?: boolean;
        }?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow bitwise operators',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-bitwise',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    allow: {
                        type: 'array',
                        items: {
                            enum: BITWISE_OPERATORS,
                        },
                        uniqueItems: true,
                    },
                    int32Hint: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            unexpected: "Unexpected use of '{{operator}}'.",
        },
    },

    create(context) {
        const options = context.options[0] || {};
        const allowed = options.allow || [];
        const int32Hint = options.int32Hint === true;

        /**
         * Reports an unexpected use of a bitwise operator.
         * @param node Node which contains the bitwise operator.
         */
        function report(
            node: Node<'AssignmentExpression' | 'BinaryExpression' | 'UnaryExpression'>,
        ) {
            context.report({
                node,
                messageId: 'unexpected',
                data: { operator: node.operator },
            });
        }

        /**
         * Checks if the given node has a bitwise operator.
         * @param node The node to check.
         * @returns Whether or not the node has a bitwise operator.
         */
        function hasBitwiseOperator(
            node: Node<'AssignmentExpression' | 'BinaryExpression' | 'UnaryExpression'>,
        ) {
            return BITWISE_OPERATORS.includes(node.operator);
        }

        /**
         * Checks if exceptions were provided, e.g. `{ allow: ['~', '|'] }`.
         * @param node The node to check.
         * @returns Whether or not the node has a bitwise operator.
         */
        function allowedOperator(
            node: Node<'AssignmentExpression' | 'BinaryExpression' | 'UnaryExpression'>,
        ) {
            return allowed.some((operator) => operator === node.operator);
        }

        /**
         * Checks if the given bitwise operator is used for integer typecasting, i.e. "|0"
         * @param node The node to check.
         * @returns whether the node is used in integer typecasting.
         */
        function isInt32Hint(
            node: Node<'AssignmentExpression' | 'BinaryExpression' | 'UnaryExpression'>,
        ) {
            return (
                int32Hint
                && node.operator === '|'
                && node.right
                && node.right.type === 'Literal'
                && node.right.value === 0
            );
        }

        /**
         * Report if the given node contains a bitwise operator.
         * @param node The node to check.
         */
        function checkNodeForBitwiseOperator(
            node: Node<'AssignmentExpression' | 'BinaryExpression' | 'UnaryExpression'>,
        ) {
            if (hasBitwiseOperator(node) && !allowedOperator(node) && !isInt32Hint(node)) {
                report(node);
            }
        }

        return {
            AssignmentExpression: checkNodeForBitwiseOperator,
            BinaryExpression: checkNodeForBitwiseOperator,
            UnaryExpression: checkNodeForBitwiseOperator,
        };
    },
};

export default rule;
