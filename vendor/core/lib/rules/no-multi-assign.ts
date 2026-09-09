/**
 * @file Rule to check use of chained assignment expressions
 * @author Stewart Rand
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ ignoreNonDeclaration?: boolean }?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow use of chained assignment expressions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-multi-assign',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    ignoreNonDeclaration: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            unexpectedChain: 'Unexpected chained assignment.',
        },
    },

    create(context) {
        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------
        const options = context.options[0] || {
            ignoreNonDeclaration: false,
        };
        const selectors = [
            'VariableDeclarator > AssignmentExpression.init',
            'PropertyDefinition > AssignmentExpression.value',
        ];

        if (!options.ignoreNonDeclaration) {
            selectors.push('AssignmentExpression > AssignmentExpression.right');
        }

        return {
            [selectors.join(',')](node: Node) {
                context.report({
                    node,
                    messageId: 'unexpectedChain',
                });
            },
        };
    },
};

export default rule;
