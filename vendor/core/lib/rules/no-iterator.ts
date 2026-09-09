/**
 * @file Rule to flag usage of __iterator__ property
 * @author Ian Christian Myers
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const { getStaticPropertyName } = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow the use of the `__iterator__` property',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-iterator',
        },

        schema: [],

        messages: {
            noIterator: "Reserved name '__iterator__'.",
        },
    },

    create(context) {
        return {
            MemberExpression(node: Node<'MemberExpression'>) {
                if (getStaticPropertyName(node) === '__iterator__') {
                    context.report({
                        node,
                        messageId: 'noIterator',
                    });
                }
            },
        };
    },
};

export default rule;
