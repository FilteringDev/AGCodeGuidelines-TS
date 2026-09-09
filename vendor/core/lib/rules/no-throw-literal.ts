/**
 * @file Rule to restrict what can be thrown as an exception.
 * @author Dieter Oberkofler
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow throwing literals as exceptions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-throw-literal',
        },

        schema: [],

        messages: {
            object: 'Expected an error object to be thrown.',
            undef: 'Do not throw undefined.',
        },
    },

    create(context) {
        return {
            ThrowStatement(node: Node<'ThrowStatement'>) {
                if (!astUtils.couldBeError(node.argument)) {
                    context.report({ node, messageId: 'object' });
                } else if (node.argument.type === 'Identifier') {
                    if (node.argument.name === 'undefined') {
                        context.report({ node, messageId: 'undef' });
                    }
                }
            },
        };
    },
};

export default rule;
