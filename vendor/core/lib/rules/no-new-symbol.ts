/**
 * @file Rule to disallow use of the new operator with the `Symbol` object
 * @author Alberto Rodríguez
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow `new` operators with the `Symbol` object',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-new-symbol',
        },

        schema: [],

        messages: {
            noNewSymbol: '`Symbol` cannot be called as a constructor.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        return {
            'Program:exit': function onProgramExit(node: Node<'Program'>) {
                const globalScope = sourceCode.getScope(node);
                const variable = globalScope.set.get('Symbol');

                if (variable && variable.defs.length === 0) {
                    variable.references.forEach((ref) => {
                        const idNode = ref.identifier;
                        const { parent } = idNode;

                        if (
                            parent
                            && parent.type === 'NewExpression'
                            && parent.callee === idNode
                        ) {
                            context.report({
                                node: idNode,
                                messageId: 'noNewSymbol',
                            });
                        }
                    });
                }
            },
        };
    },
};

export default rule;
