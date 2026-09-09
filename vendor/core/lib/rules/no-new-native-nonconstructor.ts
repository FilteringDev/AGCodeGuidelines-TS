/**
 * @file Rule to disallow use of the new operator with global non-constructor functions
 * @author Sosuke Suzuki
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const nonConstructorGlobalFunctionNames = ['Symbol', 'BigInt'];

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow `new` operators with global non-constructor functions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-new-native-nonconstructor',
        },

        schema: [],

        messages: {
            noNewNonconstructor: '`{{name}}` cannot be called as a constructor.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        return {
            'Program:exit': function onProgramExit(node: Node<'Program'>) {
                const globalScope = sourceCode.getScope(node);

                nonConstructorGlobalFunctionNames.forEach((nonConstructorName) => {
                    const variable = globalScope.set.get(nonConstructorName);

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
                                    messageId: 'noNewNonconstructor',
                                    data: { name: nonConstructorName },
                                });
                            }
                        });
                    }
                });
            },
        };
    },
};

export default rule;
