/**
 * @file A rule to disallow calls to the Object constructor
 * @author Matt DuVall <http://www.mattduvall.com/>
 * @deprecated in ESLint v8.50.0
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow `Object` constructors',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-new-object',
        },

        deprecated: true,

        replacedBy: ['no-object-constructor'],

        schema: [],

        messages: {
            preferLiteral: 'The object literal notation {} is preferable.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        return {
            NewExpression(node: Node<'NewExpression'>) {
                const variable = astUtils.getVariableByName(
                    sourceCode.getScope(node),
                    node.callee.name!,
                );

                if (variable && variable.identifiers.length > 0) {
                    return;
                }

                if (node.callee.name === 'Object') {
                    context.report({
                        node,
                        messageId: 'preferLiteral',
                    });
                }
            },
        };
    },
};

export default rule;
