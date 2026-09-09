/**
 * @file Rule to disallow unsafe optional chaining
 * @author Yeon JuAn
 */
import type { LegacyRule, Node } from '../../../types';

const UNSAFE_ARITHMETIC_OPERATORS = new Set(['+', '-', '/', '*', '%', '**']);
const UNSAFE_ASSIGNMENT_OPERATORS = new Set(['+=', '-=', '/=', '*=', '%=', '**=']);
const UNSAFE_RELATIONAL_OPERATORS = new Set(['in', 'instanceof']);

/**
 * Checks whether a node is a destructuring pattern or not
 * @param node node to check
 * @returns `true` if a node is a destructuring pattern, otherwise `false`
 */
function isDestructuringPattern(
    node: Node<
        | 'ArrayPattern'
        | 'AssignmentPattern'
        | 'Identifier'
        | 'MemberExpression'
        | 'ObjectPattern'
        | 'RestElement'
    >,
) {
    return node.type === 'ObjectPattern' || node.type === 'ArrayPattern';
}

const rule: LegacyRule<[{ disallowArithmeticOperators?: boolean }?]> = {
    meta: {
        type: 'problem',

        docs: {
            description:
                'Disallow use of optional chaining in contexts where the `undefined` value is not allowed',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-unsafe-optional-chaining',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    disallowArithmeticOperators: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],
        fixable: null,
        messages: {
            unsafeOptionalChain:
                "Unsafe usage of optional chaining. If it short-circuits with 'undefined' the evaluation will throw TypeError.",
            unsafeArithmetic:
                'Unsafe arithmetic operation on optional chaining. It can result in NaN.',
        },
    },

    create(context) {
        const options = context.options[0] || {};
        const disallowArithmeticOperators = options.disallowArithmeticOperators || false;

        /**
         * Reports unsafe usage of optional chaining
         * @param node node to report
         */
        function reportUnsafeUsage(node: Node) {
            context.report({
                messageId: 'unsafeOptionalChain',
                node,
            });
        }

        /**
         * Reports unsafe arithmetic operation on optional chaining
         * @param node node to report
         */
        function reportUnsafeArithmetic(node: Node) {
            context.report({
                messageId: 'unsafeArithmetic',
                node,
            });
        }

        /**
         * Checks and reports if a node can short-circuit with `undefined` by optional chaining.
         * @param [node] node to check
         * @param reportFunc report function
         */
        function checkUndefinedShortCircuit(
            node: Node | null | undefined,
            reportFunc: (node: Node<'ChainExpression'>) => void,
        ) {
            if (!node) {
                return;
            }
            switch (node.type) {
                case 'LogicalExpression':
                    if (node.operator === '||' || node.operator === '??') {
                        checkUndefinedShortCircuit(node.right, reportFunc);
                    } else if (node.operator === '&&') {
                        checkUndefinedShortCircuit(node.left, reportFunc);
                        checkUndefinedShortCircuit(node.right, reportFunc);
                    }
                    break;
                case 'SequenceExpression':
                    checkUndefinedShortCircuit(
                        node.expressions[node.expressions.length - 1],
                        reportFunc,
                    );
                    break;
                case 'ConditionalExpression':
                    checkUndefinedShortCircuit(node.consequent, reportFunc);
                    checkUndefinedShortCircuit(node.alternate, reportFunc);
                    break;
                case 'AwaitExpression':
                    checkUndefinedShortCircuit(node.argument, reportFunc);
                    break;
                case 'ChainExpression':
                    reportFunc(node);
                    break;
                default:
                    break;
            }
        }

        /**
         * Checks unsafe usage of optional chaining
         * @param node node to check
         */
        function checkUnsafeUsage(node: Node) {
            checkUndefinedShortCircuit(node, reportUnsafeUsage);
        }

        /**
         * Checks unsafe arithmetic operations on optional chaining
         * @param node node to check
         */
        function checkUnsafeArithmetic(node: Node) {
            checkUndefinedShortCircuit(node, reportUnsafeArithmetic);
        }

        return {
            'AssignmentExpression, AssignmentPattern':
                function onAssignmentExpressionAssignmentPattern(
                    node: Node<'AssignmentExpression' | 'AssignmentPattern'>,
                ) {
                    if (isDestructuringPattern(node.left)) {
                        checkUnsafeUsage(node.right);
                    }
                },
            'ClassDeclaration, ClassExpression': function onClassDeclarationClassExpression(
                node: Node<'ClassDeclaration' | 'ClassExpression'>,
            ) {
                checkUnsafeUsage(node.superClass!);
            },
            CallExpression(node: Node<'CallExpression'>) {
                if (!node.optional) {
                    checkUnsafeUsage(node.callee);
                }
            },
            NewExpression(node: Node<'NewExpression'>) {
                checkUnsafeUsage(node.callee);
            },
            VariableDeclarator(node: Node<'VariableDeclarator'>) {
                if (isDestructuringPattern(node.id)) {
                    checkUnsafeUsage(node.init!);
                }
            },
            MemberExpression(node: Node<'MemberExpression'>) {
                if (!node.optional) {
                    checkUnsafeUsage(node.object);
                }
            },
            TaggedTemplateExpression(node: Node<'TaggedTemplateExpression'>) {
                checkUnsafeUsage(node.tag);
            },
            ForOfStatement(node: Node<'ForOfStatement'>) {
                checkUnsafeUsage(node.right);
            },
            SpreadElement(node: Node<'SpreadElement'>) {
                if (node.parent && node.parent.type !== 'ObjectExpression') {
                    checkUnsafeUsage(node.argument);
                }
            },
            BinaryExpression(node: Node<'BinaryExpression'>) {
                if (UNSAFE_RELATIONAL_OPERATORS.has(node.operator)) {
                    checkUnsafeUsage(node.right);
                }
                if (
                    disallowArithmeticOperators
                    && UNSAFE_ARITHMETIC_OPERATORS.has(node.operator)
                ) {
                    checkUnsafeArithmetic(node.right);
                    checkUnsafeArithmetic(node.left);
                }
            },
            WithStatement(node: Node<'WithStatement'>) {
                checkUnsafeUsage(node.object);
            },
            UnaryExpression(node: Node<'UnaryExpression'>) {
                if (
                    disallowArithmeticOperators
                    && UNSAFE_ARITHMETIC_OPERATORS.has(node.operator)
                ) {
                    checkUnsafeArithmetic(node.argument);
                }
            },
            AssignmentExpression(node: Node<'AssignmentExpression'>) {
                if (
                    disallowArithmeticOperators
                    && UNSAFE_ASSIGNMENT_OPERATORS.has(node.operator)
                ) {
                    checkUnsafeArithmetic(node.right);
                }
            },
        };
    },
};

export default rule;
