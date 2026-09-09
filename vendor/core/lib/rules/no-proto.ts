/**
 * @file Rule to flag usage of __proto__ property
 * @author Ilya Volodin
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
            description: 'Disallow the use of the `__proto__` property',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-proto',
        },

        schema: [],

        messages: {
            unexpectedProto: "The '__proto__' property is deprecated.",
        },
    },

    create(context) {
        return {
            MemberExpression(node: Node<'MemberExpression'>) {
                if (getStaticPropertyName(node) === '__proto__') {
                    context.report({ node, messageId: 'unexpectedProto' });
                }
            },
        };
    },
};

export default rule;
