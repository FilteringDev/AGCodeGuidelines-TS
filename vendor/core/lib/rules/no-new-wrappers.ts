/**
 * @file Rule to flag when using constructor for wrapper objects
 * @author Ilya Volodin
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const { getVariableByName } = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description:
                'Disallow `new` operators with the `String`, `Number`, and `Boolean` objects',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-new-wrappers',
        },

        schema: [],

        messages: {
            noConstructor: 'Do not use {{fn}} as a constructor.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        return {
            NewExpression(node: Node<'NewExpression'>) {
                const wrapperObjects = ['String', 'Number', 'Boolean'];
                const { name } = node.callee;

                if (wrapperObjects.includes(name!)) {
                    const variable = getVariableByName(sourceCode.getScope(node), name!);

                    if (variable && variable.identifiers.length === 0) {
                        context.report({
                            node,
                            messageId: 'noConstructor',
                            data: { fn: name },
                        });
                    }
                }
            },
        };
    },
};

export default rule;
