/**
 * @file Rule to enforce description with the `Symbol` object
 * @author Jarek Rencz
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node, Reference } from '../../../types';

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
            description: 'Require symbol descriptions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/symbol-description',
        },
        fixable: null,
        schema: [],
        messages: {
            expected: 'Expected Symbol to have a description.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * Reports if node does not conform the rule in case rule is set to
         * report missing description
         * @param node A CallExpression node to check.
         */
        function checkArgument(node: Node<'CallExpression'>) {
            if (node.arguments.length === 0) {
                context.report({
                    node,
                    messageId: 'expected',
                });
            }
        }

        return {
            'Program:exit': function onProgramExit(node: Node<'Program'>) {
                const scope = sourceCode.getScope(node);
                const variable = astUtils.getVariableByName(scope, 'Symbol');

                if (variable && variable.defs.length === 0) {
                    variable.references.forEach((reference: Reference) => {
                        const idNode = reference.identifier;

                        if (astUtils.isCallee(idNode)) {
                            checkArgument(idNode.parent);
                        }
                    });
                }
            },
        };
    },
};

export default rule;
