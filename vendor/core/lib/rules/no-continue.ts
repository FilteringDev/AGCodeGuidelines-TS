/**
 * @file Rule to flag use of continue statement
 * @author Borislav Zhivkov
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow `continue` statements',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-continue',
        },

        schema: [],

        messages: {
            unexpected: 'Unexpected use of continue statement.',
        },
    },

    create(context) {
        return {
            ContinueStatement(node: Node<'ContinueStatement'>) {
                context.report({ node, messageId: 'unexpected' });
            },
        };
    },
};

export default rule;
