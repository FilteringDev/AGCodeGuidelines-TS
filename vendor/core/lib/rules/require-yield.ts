/**
 * @file Rule to flag the generator functions that does not have yield.
 * @author Toru Nagashima
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Require generator functions to contain `yield`',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/require-yield',
        },

        schema: [],

        messages: {
            missingYield: "This generator function does not have 'yield'.",
        },
    },

    create(context) {
        const stack: number[] = [];

        /**
         * If the node is a generator function, start counting `yield` keywords.
         * @param node A function node to check.
         */
        function beginChecking(node: Node<'FunctionDeclaration' | 'FunctionExpression'>) {
            if (node.generator) {
                stack.push(0);
            }
        }

        /**
         * If the node is a generator function, end counting `yield` keywords, then
         * reports result.
         * @param node A function node to check.
         */
        function endChecking(node: Node<'FunctionDeclaration' | 'FunctionExpression'>) {
            if (!node.generator) {
                return;
            }

            const countYield = stack.pop();

            if (countYield === 0 && node.body.body.length > 0) {
                context.report({ node, messageId: 'missingYield' });
            }
        }

        return {
            FunctionDeclaration: beginChecking,
            'FunctionDeclaration:exit': endChecking,
            FunctionExpression: beginChecking,
            'FunctionExpression:exit': endChecking,

            // Increases the count of `yield` keyword.
            YieldExpression() {
                if (stack.length > 0) {
                    stack[stack.length - 1]! += 1;
                }
            },
        };
    },
};

export default rule;
