/**
 * @file Rule to flag when a function has too many parameters
 * @author Ilya Volodin
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

const rule: LegacyRule<[(number | { maximum?: number; max?: number })?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Enforce a maximum number of parameters in function definitions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/max-params',
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
            exceed: '{{name}} has too many parameters ({{count}}). Maximum allowed is {{max}}.',
        },
    },

    create(context) {
        const { sourceCode } = context;
        const option = context.options[0];
        let numParams: number | number | undefined = 3;

        if (
            typeof option === 'object'
            && (Object.prototype.hasOwnProperty.call(option, 'maximum')
                || Object.prototype.hasOwnProperty.call(option, 'max'))
        ) {
            numParams = option.maximum || option.max;
        }
        if (typeof option === 'number') {
            numParams = option;
        }

        /**
         * Checks a function to see if it has too many parameters.
         * @param node The node to check.
         */
        function checkFunction(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
        ) {
            if (node.params.length > numParams!) {
                context.report({
                    loc: astUtils.getFunctionHeadLoc(node, sourceCode),
                    node,
                    messageId: 'exceed',
                    data: {
                        name: upperCaseFirst(astUtils.getFunctionNameWithKind(node)),
                        count: node.params.length,
                        max: numParams,
                    },
                });
            }
        }

        return {
            FunctionDeclaration: checkFunction,
            ArrowFunctionExpression: checkFunction,
            FunctionExpression: checkFunction,
        };
    },
};

export default rule;
