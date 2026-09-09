/**
 * @file Require spaces around infix operators
 * @author Michael Ficarra
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import type {
    Fixer, LegacyRule, Node, Token,
} from '../../../types';

const { isEqToken } = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ int32Hint?: boolean }?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Require spacing around infix operators',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/space-infix-ops',
        },

        fixable: 'whitespace',

        schema: [
            {
                type: 'object',
                properties: {
                    int32Hint: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            missingSpace: "Operator '{{operator}}' must be spaced.",
        },
    },

    create(context) {
        const int32Hint = context.options[0] ? context.options[0].int32Hint === true : false;
        const { sourceCode } = context;

        /**
         * Returns the first token which violates the rule
         * @param left The left node of the main node
         * @param right The right node of the main node
         * @param op The operator of the main node
         * @returns The violator token or null
         */
        function getFirstNonSpacedToken(left: Node, right: Node, op: string) {
            const operator = sourceCode.getFirstTokenBetween(
                left,
                right,
                (token: Token) => token.value === op,
            );
            const prev = sourceCode.getTokenBefore(operator!);
            const next = sourceCode.getTokenAfter(operator!);

            if (
                !sourceCode.isSpaceBetweenTokens(prev!, operator!)
                || !sourceCode.isSpaceBetweenTokens(operator!, next!)
            ) {
                return operator;
            }

            return null;
        }

        /**
         * Reports an AST node as a rule violation
         * @param mainNode The node to report
         * @param culpritToken The token which has a problem
         */
        function report(
            mainNode: Node<
                | 'AssignmentExpression'
                | 'AssignmentPattern'
                | 'BinaryExpression'
                | 'ConditionalExpression'
                | 'LogicalExpression'
                | 'PropertyDefinition'
                | 'VariableDeclarator'
            >,
            culpritToken: Token | Token | null,
        ) {
            context.report({
                node: mainNode,
                loc: culpritToken!.loc,
                messageId: 'missingSpace',
                data: {
                    operator: culpritToken!.value,
                },
                fix(fixer: Fixer) {
                    const previousToken = sourceCode.getTokenBefore(culpritToken!);
                    const afterToken = sourceCode.getTokenAfter(culpritToken!);
                    let fixString = '';

                    if (culpritToken!.range[0] - previousToken!.range[1] === 0) {
                        fixString = ' ';
                    }

                    fixString += culpritToken!.value;

                    if (afterToken!.range[0] - culpritToken!.range[1] === 0) {
                        fixString += ' ';
                    }

                    return fixer.replaceText(culpritToken!, fixString);
                },
            });
        }

        /**
         * Check if the node is binary then report
         * @param node node to evaluate
         */
        function checkBinary(
            node: Node<
                | 'AssignmentExpression'
                | 'AssignmentPattern'
                | 'BinaryExpression'
                | 'LogicalExpression'
            >,
        ) {
            const leftNode = node.left.typeAnnotation ? node.left.typeAnnotation : node.left;
            const rightNode = node.right;

            // search for = in AssignmentPattern nodes
            const operator = node.operator || '=';

            const nonSpacedNode = getFirstNonSpacedToken(leftNode, rightNode, operator);

            if (nonSpacedNode) {
                if (!(int32Hint && sourceCode.getText(node).endsWith('|0'))) {
                    report(node, nonSpacedNode);
                }
            }
        }

        /**
         * Check if the node is conditional
         * @param node node to evaluate
         */
        function checkConditional(node: Node<'ConditionalExpression'>) {
            const nonSpacedConsequentNode = getFirstNonSpacedToken(
                node.test,
                node.consequent,
                '?',
            );
            const nonSpacedAlternateNode = getFirstNonSpacedToken(
                node.consequent,
                node.alternate,
                ':',
            );

            if (nonSpacedConsequentNode) {
                report(node, nonSpacedConsequentNode);
            }

            if (nonSpacedAlternateNode) {
                report(node, nonSpacedAlternateNode);
            }
        }

        /**
         * Check if the node is a variable
         * @param node node to evaluate
         */
        function checkVar(node: Node<'VariableDeclarator'>) {
            const leftNode = node.id.typeAnnotation ? node.id.typeAnnotation : node.id;
            const rightNode = node.init;

            if (rightNode) {
                const nonSpacedNode = getFirstNonSpacedToken(leftNode, rightNode, '=');

                if (nonSpacedNode) {
                    report(node, nonSpacedNode);
                }
            }
        }

        return {
            AssignmentExpression: checkBinary,
            AssignmentPattern: checkBinary,
            BinaryExpression: checkBinary,
            LogicalExpression: checkBinary,
            ConditionalExpression: checkConditional,
            VariableDeclarator: checkVar,

            PropertyDefinition(node: Node<'PropertyDefinition'>) {
                if (!node.value) {
                    return;
                }

                /**
                 * Because of computed properties and type annotations, some
                 * tokens may exist between `node.key` and `=`.
                 * Therefore, find the `=` from the right.
                 */
                const operatorToken = sourceCode.getTokenBefore(node.value, isEqToken);
                const leftToken = sourceCode.getTokenBefore(operatorToken!);
                const rightToken = sourceCode.getTokenAfter(operatorToken!);

                if (
                    !sourceCode.isSpaceBetweenTokens(leftToken!, operatorToken!)
                    || !sourceCode.isSpaceBetweenTokens(operatorToken!, rightToken!)
                ) {
                    report(node, operatorToken);
                }
            },
        };
    },
};

export default rule;
