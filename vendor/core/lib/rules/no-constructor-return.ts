/**
 * @file Rule to disallow returning value from constructor.
 * @author Pig Fang <https://github.com/g-plane>
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow returning value from constructor',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-constructor-return',
        },

        schema: {},

        fixable: null,

        messages: {
            unexpected: 'Unexpected return statement in constructor.',
        },
    },

    create(context) {
        const stack: Node[] = [];

        return {
            onCodePathStart(_, node: Node) {
                stack.push(node);
            },
            onCodePathEnd() {
                stack.pop();
            },
            ReturnStatement(node: Node<'ReturnStatement'>) {
                const last = stack[stack.length - 1];

                if (!last!.parent) {
                    return;
                }

                if (
                    last!.parent.type === 'MethodDefinition'
                    && last!.parent.kind === 'constructor'
                    && (node.parent.parent === last || node.argument)
                ) {
                    context.report({
                        node,
                        messageId: 'unexpected',
                    });
                }
            },
        };
    },
};

export default rule;
