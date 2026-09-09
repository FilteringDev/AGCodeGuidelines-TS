/**
 * @file A rule to set the maximum depth block can be nested in a function.
 * @author Ian Christian Myers
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[(number | { maximum?: number; max?: number })?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Enforce a maximum depth that blocks can be nested',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/max-depth',
        },

        schema: [
            {
                oneOf: [
                    {
                        type: 'integer',
                        minimum: 0,
                    },
                    {
                        type: 'object',
                        properties: {
                            maximum: {
                                type: 'integer',
                                minimum: 0,
                            },
                            max: {
                                type: 'integer',
                                minimum: 0,
                            },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        ],
        messages: {
            tooDeeply:
                'Blocks are nested too deeply ({{depth}}). Maximum allowed is {{maxDepth}}.',
        },
    },

    create(context) {
        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        const functionStack: number[] = [];
        const option = context.options[0];
        let maxDepth: number | number | undefined = 4;

        if (
            typeof option === 'object'
            && (Object.prototype.hasOwnProperty.call(option, 'maximum')
                || Object.prototype.hasOwnProperty.call(option, 'max'))
        ) {
            maxDepth = option.maximum || option.max;
        }
        if (typeof option === 'number') {
            maxDepth = option;
        }

        /**
         * When parsing a new function, store it in our function stack
         */
        function startFunction() {
            functionStack.push(0);
        }

        /**
         * When parsing is done then pop out the reference
         */
        function endFunction() {
            functionStack.pop();
        }

        /**
         * Save the block and Evaluate the node
         * @param node node to evaluate
         */
        function pushBlock(
            node: Node<
                | 'IfStatement'
                | 'DoWhileStatement'
                | 'ForInStatement'
                | 'ForOfStatement'
                | 'ForStatement'
                | 'SwitchStatement'
                | 'TryStatement'
                | 'WhileStatement'
                | 'WithStatement'
            >,
        ) {
            functionStack[functionStack.length - 1]! += 1;
            const len = functionStack[functionStack.length - 1]!;

            if (len > maxDepth!) {
                context.report({
                    node,
                    messageId: 'tooDeeply',
                    data: { depth: len, maxDepth },
                });
            }
        }

        /**
         * Pop the saved block
         */
        function popBlock() {
            functionStack[functionStack.length - 1]! -= 1;
        }

        //--------------------------------------------------------------------------
        // Public API
        //--------------------------------------------------------------------------

        return {
            Program: startFunction,
            FunctionDeclaration: startFunction,
            FunctionExpression: startFunction,
            ArrowFunctionExpression: startFunction,
            StaticBlock: startFunction,

            IfStatement(node: Node<'IfStatement'>) {
                if (node.parent.type !== 'IfStatement') {
                    pushBlock(node);
                }
            },
            SwitchStatement: pushBlock,
            TryStatement: pushBlock,
            DoWhileStatement: pushBlock,
            WhileStatement: pushBlock,
            WithStatement: pushBlock,
            ForStatement: pushBlock,
            ForInStatement: pushBlock,
            ForOfStatement: pushBlock,

            'IfStatement:exit': popBlock,
            'SwitchStatement:exit': popBlock,
            'TryStatement:exit': popBlock,
            'DoWhileStatement:exit': popBlock,
            'WhileStatement:exit': popBlock,
            'WithStatement:exit': popBlock,
            'ForStatement:exit': popBlock,
            'ForInStatement:exit': popBlock,
            'ForOfStatement:exit': popBlock,

            'FunctionDeclaration:exit': endFunction,
            'FunctionExpression:exit': endFunction,
            'ArrowFunctionExpression:exit': endFunction,
            'StaticBlock:exit': endFunction,
            'Program:exit': endFunction,
        };
    },
};

export default rule;
