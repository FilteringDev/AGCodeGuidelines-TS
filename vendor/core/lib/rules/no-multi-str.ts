/**
 * @file Rule to flag when using multiline strings
 * @author Ilya Volodin
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow multiline strings',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-multi-str',
        },

        schema: [],

        messages: {
            multilineString: 'Multiline support is limited to browsers supporting ES5 only.',
        },
    },

    create(context) {
        /**
         * Determines if a given node is part of JSX syntax.
         * @param node The node to check.
         * @returns True if the node is a JSX node, false if not.
         */
        function isJSXElement(node: Node) {
            return node.type.indexOf('JSX') === 0;
        }

        //--------------------------------------------------------------------------
        // Public API
        //--------------------------------------------------------------------------

        return {
            Literal(node: Node<'Literal'>) {
                if (astUtils.LINEBREAK_MATCHER.test(node.raw!) && !isJSXElement(node.parent)) {
                    context.report({
                        node,
                        messageId: 'multilineString',
                    });
                }
            },
        };
    },
};

export default rule;
