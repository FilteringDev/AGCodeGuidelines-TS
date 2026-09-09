/**
 * @file Disallow sparse arrays
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
            description: 'Disallow sparse arrays',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-sparse-arrays',
        },

        schema: [],

        messages: {
            unexpectedSparseArray: 'Unexpected comma in middle of array.',
        },
    },

    create(context) {
        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            ArrayExpression(node: Node<'ArrayExpression'>) {
                const emptySpot = node.elements.includes(null);

                if (emptySpot) {
                    context.report({ node, messageId: 'unexpectedSparseArray' });
                }
            },
        };
    },
};

export default rule;
