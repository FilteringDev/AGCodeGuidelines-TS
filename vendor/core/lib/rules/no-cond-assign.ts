/**
 * @file Rule to flag assignment in a conditional statement's test expression
 * @author Stephen Murray <spmurrayzzz>
 */
import dependency0 from './utils/ast-utils';
import type { Node, LegacyRule } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const TEST_CONDITION_PARENT_TYPES = new Set([
    'IfStatement',
    'WhileStatement',
    'DoWhileStatement',
    'ForStatement',
    'ConditionalExpression',
]);

const NODE_DESCRIPTIONS: Record<string, string> = {
    DoWhileStatement: "a 'do...while' statement",
    ForStatement: "a 'for' statement",
    IfStatement: "an 'if' statement",
    WhileStatement: "a 'while' statement",
};

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[('except-parens' | 'always')?]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow assignment operators in conditional expressions',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-cond-assign',
        },

        schema: [
            {
                enum: ['except-parens', 'always'],
            },
        ],

        messages: {
            unexpected: 'Unexpected assignment within {{type}}.',

            // must match JSHint's error message
            missing: 'Expected a conditional expression and instead saw an assignment.',
        },
    },

    create(context) {
        const prohibitAssign = context.options[0] || 'except-parens';

        const { sourceCode } = context;

        /**
         * Check whether an AST node is the test expression for a conditional statement.
         * @param node The node to test.
         * @returns `true` if the node is the text expression for a conditional statement; otherwise, `false`.
         */
        function isConditionalTestExpression(node: Node) {
            return (
                node.parent
                && TEST_CONDITION_PARENT_TYPES.has(node.parent.type)
                && 'test' in node.parent
                && node === node.parent.test
            );
        }

        /**
         * Given an AST node, perform a bottom-up search for the first ancestor that represents a conditional
         * statement.
         * @param node The node to use at the start of the search.
         * @returns The closest ancestor node that represents a conditional statement.
         */
        function findConditionalAncestor(node: Node) {
            let currentAncestor = node;

            for (
                let first = true;
                currentAncestor && (first || !astUtils.isFunction(currentAncestor));
                currentAncestor = currentAncestor.parent, first = false
            ) {
                if (isConditionalTestExpression(currentAncestor)) {
                    return currentAncestor.parent;
                }
            }

            return null;
        }

        /**
         * Check whether the code represented by an AST node is enclosed in two sets of parentheses.
         * @param node The node to test.
         * @returns `true` if the code is enclosed in two sets of parentheses; otherwise, `false`.
         */
        function isParenthesisedTwice(node: Node) {
            const previousToken = sourceCode.getTokenBefore(node, 1);
            const nextToken = sourceCode.getTokenAfter(node, 1);

            return (
                astUtils.isParenthesised(sourceCode, node)
                && previousToken
                && astUtils.isOpeningParenToken(previousToken)
                && previousToken.range[1] <= node.range[0]
                && astUtils.isClosingParenToken(nextToken!)
                && nextToken!.range[0] >= node.range[1]
            );
        }

        /**
         * Check a conditional statement's test expression for top-level assignments that are not enclosed in
         * parentheses.
         * @param node The node for the conditional statement.
         */
        function testForAssign(
            node: Node<
                | 'DoWhileStatement'
                | 'ForStatement'
                | 'IfStatement'
                | 'WhileStatement'
                | 'ConditionalExpression'
            >,
        ) {
            if (
                node.test
                && node.test.type === 'AssignmentExpression'
                && (node.type === 'ForStatement'
                    ? !astUtils.isParenthesised(sourceCode, node.test)
                    : !isParenthesisedTwice(node.test))
            ) {
                context.report({
                    node: node.test,
                    messageId: 'missing',
                });
            }
        }

        /**
         * Check whether an assignment expression is descended from a conditional statement's test expression.
         * @param node The node for the assignment expression.
         */
        function testForConditionalAncestor(node: Node) {
            const ancestor = findConditionalAncestor(node);

            if (ancestor) {
                context.report({
                    node,
                    messageId: 'unexpected',
                    data: {
                        type: NODE_DESCRIPTIONS[ancestor.type] || ancestor.type,
                    },
                });
            }
        }

        if (prohibitAssign === 'always') {
            return {
                AssignmentExpression: testForConditionalAncestor,
            };
        }

        return {
            DoWhileStatement: testForAssign,
            ForStatement: testForAssign,
            IfStatement: testForAssign,
            WhileStatement: testForAssign,
            ConditionalExpression: testForAssign,
        };
    },
};

export default rule;
