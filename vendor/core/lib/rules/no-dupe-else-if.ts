/**
 * @file Rule to disallow duplicate conditions in if-else-if chains
 * @author Milos Djermanovic
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Determines whether the first given array is a subset of the second given array.
 * @param comparator A function to compare two elements, should return `true` if they are equal.
 * @param arrA The array to compare from.
 * @param arrB The array to compare against.
 * @returns `true` if the array `arrA` is a subset of the array `arrB`.
 */
function isSubsetByComparator<T>(comparator: (a: T, b: T) => boolean, arrA: T[], arrB: T[]) {
    return arrA.every((a) => arrB.some((b) => comparator(a, b)));
}

/**
 * Splits the given node by the given logical operator.
 * @param operator Logical operator `||` or `&&`.
 * @param node The node to split.
 * @returns Array of conditions that makes the node when joined by the operator.
 */
function splitByLogicalOperator(operator: string, node: Node): Node[] {
    if (node.type === 'LogicalExpression' && node.operator === operator) {
        return [
            ...splitByLogicalOperator(operator, node.left),
            ...splitByLogicalOperator(operator, node.right),
        ];
    }
    return [node];
}

const splitByOr = splitByLogicalOperator.bind(null, '||');
const splitByAnd = splitByLogicalOperator.bind(null, '&&');

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow duplicate conditions in if-else-if chains',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-dupe-else-if',
        },

        schema: [],

        messages: {
            unexpected:
                'This branch can never execute. Its condition is a duplicate or covered by previous conditions in the if-else-if chain.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * Determines whether the two given nodes are considered to be equal. In particular, given that the nodes
         * represent expressions in a boolean context, `||` and `&&` can be considered as commutative operators.
         * @param a First node.
         * @param b Second node.
         * @returns `true` if the nodes are considered to be equal.
         */
        function equal(a: Node, b: Node): boolean {
            if (a.type !== b.type) {
                return false;
            }

            if (
                a.type === 'LogicalExpression'
                && (a.operator === '||' || a.operator === '&&')
                && a.operator === b.operator
            ) {
                return (
                    (equal(a.left, b.left) && equal(a.right, b.right))
                    || (equal(a.left, b.right) && equal(a.right, b.left))
                );
            }

            return astUtils.equalTokens(a, b, sourceCode);
        }

        const isSubset = (arrA: Node[], arrB: Node[]) => isSubsetByComparator(equal, arrA, arrB);

        return {
            IfStatement(node: Node<'IfStatement'>) {
                const { test } = node;
                const conditionsToCheck = test.type === 'LogicalExpression' && test.operator === '&&'
                    ? [test, ...splitByAnd(test)]
                    : [test];
                let current = node;
                let listToCheck = conditionsToCheck.map((c) => splitByOr(c).map(splitByAnd));

                while (
                    current.parent
                    && current.parent.type === 'IfStatement'
                    && current.parent.alternate === current
                ) {
                    current = current.parent;

                    const currentOrOperands = splitByOr(current.test).map(splitByAnd);

                    listToCheck = listToCheck.map((orOperands) => orOperands.filter(
                        (orOperand) => !currentOrOperands.some((other) => isSubset(other, orOperand)),
                    ));

                    if (listToCheck.some((orOperands) => orOperands.length === 0)) {
                        context.report({ node: test, messageId: 'unexpected' });
                        break;
                    }
                }
            },
        };
    },
};

export default rule;
