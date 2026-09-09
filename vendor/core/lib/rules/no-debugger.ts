/**
 * @file Rule to flag use of a debugger statement
 * @author Nicholas C. Zakas
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow the use of `debugger`',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-debugger',
        },

        fixable: null,
        schema: [],

        messages: {
            unexpected: "Unexpected 'debugger' statement.",
        },
    },

    create(context) {
        return {
            DebuggerStatement(node: Node<'DebuggerStatement'>) {
                context.report({
                    node,
                    messageId: 'unexpected',
                });
            },
        };
    },
};

export default rule;
