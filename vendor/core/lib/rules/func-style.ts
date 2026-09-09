/**
 * @file Rule to enforce a particular function style
 * @author Nicholas C. Zakas
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

import type { LegacyListener, LegacyRule, Node } from '../../../types';

const rule: LegacyRule<[('declaration' | 'expression')?, { allowArrowFunctions?: boolean }?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description:
                    'Enforce the consistent use of either `function` declarations or expressions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/func-style',
        },

        schema: [
            {
                enum: ['declaration', 'expression'],
            },
            {
                type: 'object',
                properties: {
                    allowArrowFunctions: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            expression: 'Expected a function expression.',
            declaration: 'Expected a function declaration.',
        },
    },

    create(context) {
        const style = context.options[0];
        const allowArrowFunctions = context.options[1] && context.options[1].allowArrowFunctions;
        const enforceDeclarations = style === 'declaration';
        const stack: boolean[] = [];

        const nodesToCheck: LegacyListener = {
            FunctionDeclaration(node: Node<'FunctionDeclaration'>) {
                stack.push(false);

                if (
                    !enforceDeclarations
                        && node.parent.type !== 'ExportDefaultDeclaration'
                ) {
                    context.report({ node, messageId: 'expression' });
                }
            },
            'FunctionDeclaration:exit': function onFunctionDeclarationExit() {
                stack.pop();
            },

            FunctionExpression(node: Node<'FunctionExpression'>) {
                stack.push(false);

                if (enforceDeclarations && node.parent.type === 'VariableDeclarator') {
                    context.report({ node: node.parent, messageId: 'declaration' });
                }
            },
            'FunctionExpression:exit': function onFunctionExpressionExit() {
                stack.pop();
            },

            ThisExpression() {
                if (stack.length > 0) {
                    stack[stack.length - 1] = true;
                }
            },
        };

        if (!allowArrowFunctions) {
            nodesToCheck.ArrowFunctionExpression = function nodesToCheckArrowFunctionExpression() {
                stack.push(false);
            };

            nodesToCheck['ArrowFunctionExpression:exit'] = function nodesToCheckArrowFunctionExpressionExit(node: Node) {
                const hasThisExpr = stack.pop();

                if (
                    enforceDeclarations
                            && !hasThisExpr
                            && node.parent.type === 'VariableDeclarator'
                ) {
                    context.report({ node: node.parent, messageId: 'declaration' });
                }
            };
        }

        return nodesToCheck;
    },
};

export default rule;
