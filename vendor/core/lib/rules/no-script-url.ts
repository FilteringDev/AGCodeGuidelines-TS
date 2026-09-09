/**
 * @file Rule to flag when using javascript: urls
 * @author Ilya Volodin
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

/* eslint no-script-url: 0 -- Code is checking to report such URLs */

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow `javascript:` urls',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-script-url',
        },

        schema: [],

        messages: {
            unexpectedScriptURL: 'Script URL is a form of eval.',
        },
    },

    create(context) {
        /**
         * Check whether a node's static value starts with "javascript:" or not.
         * And report an error for unexpected script URL.
         * @param node node to check
         */
        function check(node: Node<'Literal' | 'TemplateLiteral'>) {
            const value = astUtils.getStaticStringValue(node);

            if (typeof value === 'string' && /^javascript:/u.test(value.toLowerCase())) {
                context.report({ node, messageId: 'unexpectedScriptURL' });
            }
        }
        return {
            Literal(node: Node<'Literal'>) {
                if (node.value && typeof node.value === 'string') {
                    check(node);
                }
            },
            TemplateLiteral(node: Node<'TemplateLiteral'>) {
                if (!(node.parent && node.parent.type === 'TaggedTemplateExpression')) {
                    check(node);
                }
            },
        };
    },
};

export default rule;
