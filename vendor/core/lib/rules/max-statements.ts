/**
 * @file A rule to set the maximum number of statements in a function.
 * @author Ian Christian Myers
 */
import dependency0 from './utils/ast-utils';
import dependency1 from '../shared/string-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;
const { upperCaseFirst } = dependency1;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [(number | { maximum?: number; max?: number })?, { ignoreTopLevelFunctions?: boolean }?]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Enforce a maximum number of statements allowed in function blocks',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/max-statements',
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
            {
                type: 'object',
                properties: {
                    ignoreTopLevelFunctions: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            exceed: '{{name}} has too many statements ({{count}}). Maximum allowed is {{max}}.',
        },
    },

    create(context) {
        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        const functionStack: number[] = [];
        const option = context.options[0];
        const ignoreTopLevelFunctions = (context.options[1] && context.options[1].ignoreTopLevelFunctions) || false;
        const topLevelFunctions: {
            node:
                | Node<'FunctionDeclaration'>
                | Node<'ArrowFunctionExpression'>
                | Node<'FunctionExpression'>;
            count: number | undefined;
        }[] = [];
        let maxStatements: number | number | undefined = 10;

        if (
            typeof option === 'object'
            && (Object.prototype.hasOwnProperty.call(option, 'maximum')
                || Object.prototype.hasOwnProperty.call(option, 'max'))
        ) {
            maxStatements = option.maximum || option.max;
        } else if (typeof option === 'number') {
            maxStatements = option;
        }

        /**
         * Reports a node if it has too many statements
         * @param node node to evaluate
         * @param count Number of statements in node
         * @param max Maximum number of statements allowed
         */
        function reportIfTooManyStatements(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
            count: number,
            max: number,
        ) {
            if (count > max) {
                const name = upperCaseFirst(astUtils.getFunctionNameWithKind(node));

                context.report({
                    node,
                    messageId: 'exceed',
                    data: { name, count, max },
                });
            }
        }

        /**
         * When parsing a new function, store it in our function stack
         */
        function startFunction() {
            functionStack.push(0);
        }

        /**
         * Evaluate the node at the end of function
         * @param node node to evaluate
         */
        function endFunction(
            node: Node<
                | 'ArrowFunctionExpression'
                | 'FunctionDeclaration'
                | 'FunctionExpression'
                | 'StaticBlock'
            >,
        ) {
            const count = functionStack.pop();

            /**
             * This rule does not apply to class static blocks, but we have to track them so
             * that statements in them do not count as statements in the enclosing function.
             */
            if (node.type === 'StaticBlock') {
                return;
            }

            if (ignoreTopLevelFunctions && functionStack.length === 0) {
                topLevelFunctions.push({ node, count });
            } else {
                reportIfTooManyStatements(node, count!, maxStatements!);
            }
        }

        /**
         * Increment the count of the functions
         * @param node node to evaluate
         */
        function countStatements(node: Node<'BlockStatement'>) {
            functionStack[functionStack.length - 1]! += node.body.length;
        }

        //--------------------------------------------------------------------------
        // Public API
        //--------------------------------------------------------------------------

        return {
            FunctionDeclaration: startFunction,
            FunctionExpression: startFunction,
            ArrowFunctionExpression: startFunction,
            StaticBlock: startFunction,

            BlockStatement: countStatements,

            'FunctionDeclaration:exit': endFunction,
            'FunctionExpression:exit': endFunction,
            'ArrowFunctionExpression:exit': endFunction,
            'StaticBlock:exit': endFunction,

            'Program:exit': function onProgramExit() {
                if (topLevelFunctions.length === 1) {
                    return;
                }

                topLevelFunctions.forEach((element) => {
                    const { count } = element;
                    const { node } = element;

                    reportIfTooManyStatements(node, count!, maxStatements!);
                });
            },
        };
    },
};

export default rule;
