/**
 * @file Rule to flag use of with statement
 * @author Nicholas C. Zakas
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow `with` statements',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-with',
        },

        schema: [],

        messages: {
            unexpectedWith: "Unexpected use of 'with' statement.",
        },
    },

    create(context) {
        return {
            WithStatement(node: Node<'WithStatement'>) {
                context.report({ node, messageId: 'unexpectedWith' });
            },
        };
    },
};

export default rule;
