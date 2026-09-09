/**
 * @file Rule to flag when initializing octal literal
 * @author Ilya Volodin
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow octal literals',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-octal',
        },

        schema: [],

        messages: {
            noOctal: 'Octal literals should not be used.',
        },
    },

    create(context) {
        return {
            Literal(node: Node<'Literal'>) {
                if (typeof node.value === 'number' && /^0[0-9]/u.test(node.raw!)) {
                    context.report({
                        node,
                        messageId: 'noOctal',
                    });
                }
            },
        };
    },
};

export default rule;
