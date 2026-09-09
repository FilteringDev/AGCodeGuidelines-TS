/**
 * @file Rule to disallow empty static blocks.
 * @author Sosuke Suzuki
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow empty static blocks',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-empty-static-block',
        },

        schema: [],

        messages: {
            unexpected: 'Unexpected empty static block.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        return {
            StaticBlock(node: Node<'StaticBlock'>) {
                if (node.body.length === 0) {
                    const closingBrace = sourceCode.getLastToken(node);

                    if (sourceCode.getCommentsBefore(closingBrace).length === 0) {
                        context.report({
                            node,
                            messageId: 'unexpected',
                        });
                    }
                }
            },
        };
    },
};

export default rule;
