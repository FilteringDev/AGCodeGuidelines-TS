/**
 * @file Rule to enforce a maximum number of nested callbacks.
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
            description: 'Enforce a maximum depth that callbacks can be nested',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/max-nested-callbacks',
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
            exceed: 'Too many nested callbacks ({{num}}). Maximum allowed is {{max}}.',
        },
    },

    create(context) {
        //--------------------------------------------------------------------------
        // Constants
        //--------------------------------------------------------------------------
        const option = context.options[0];
        let THRESHOLD: number | number | undefined = 10;

        if (
            typeof option === 'object'
            && (Object.prototype.hasOwnProperty.call(option, 'maximum')
                || Object.prototype.hasOwnProperty.call(option, 'max'))
        ) {
            THRESHOLD = option.maximum || option.max;
        } else if (typeof option === 'number') {
            THRESHOLD = option;
        }

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        const callbackStack: Node<'ArrowFunctionExpression' | 'FunctionExpression'>[] = [];

        /**
         * Checks a given function node for too many callbacks.
         * @param node The node to check.
         */
        function checkFunction(node: Node<'ArrowFunctionExpression' | 'FunctionExpression'>) {
            const { parent } = node;

            if (parent.type === 'CallExpression') {
                callbackStack.push(node);
            }

            if (callbackStack.length > THRESHOLD!) {
                const opts = { num: callbackStack.length, max: THRESHOLD };

                context.report({ node, messageId: 'exceed', data: opts });
            }
        }

        /**
         * Pops the call stack.
         */
        function popStack() {
            callbackStack.pop();
        }

        //--------------------------------------------------------------------------
        // Public API
        //--------------------------------------------------------------------------

        return {
            ArrowFunctionExpression: checkFunction,
            'ArrowFunctionExpression:exit': popStack,

            FunctionExpression: checkFunction,
            'FunctionExpression:exit': popStack,
        };
    },
};

export default rule;
