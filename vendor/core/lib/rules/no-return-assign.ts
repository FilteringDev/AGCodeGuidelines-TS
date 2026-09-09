/**
 * @file Rule to flag when return statement contains assignment
 * @author Ilya Volodin
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

const SENTINEL_TYPE = /^(?:[a-zA-Z]+?Statement|ArrowFunctionExpression|FunctionExpression|ClassExpression)$/u;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[('except-parens' | 'always')?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow assignment operators in `return` statements',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-return-assign',
        },

        schema: [
            {
                enum: ['except-parens', 'always'],
            },
        ],

        messages: {
            returnAssignment: 'Return statement should not contain assignment.',
            arrowAssignment: 'Arrow function should not return assignment.',
        },
    },

    create(context) {
        const always = (context.options[0] || 'except-parens') !== 'except-parens';
        const { sourceCode } = context;

        return {
            AssignmentExpression(node: Node<'AssignmentExpression'>) {
                if (!always && astUtils.isParenthesised(sourceCode, node)) {
                    return;
                }

                let currentChild: Node = node;
                let { parent } = currentChild;

                // Find ReturnStatement or ArrowFunctionExpression in ancestors.
                while (parent && !SENTINEL_TYPE.test(parent.type)) {
                    currentChild = parent;
                    parent = parent.parent;
                }

                // Reports.
                if (parent && parent.type === 'ReturnStatement') {
                    context.report({
                        node: parent,
                        messageId: 'returnAssignment',
                    });
                } else if (
                    parent
                    && parent.type === 'ArrowFunctionExpression'
                    && parent.body === currentChild
                ) {
                    context.report({
                        node: parent,
                        messageId: 'arrowAssignment',
                    });
                }
            },
        };
    },
};

export default rule;
