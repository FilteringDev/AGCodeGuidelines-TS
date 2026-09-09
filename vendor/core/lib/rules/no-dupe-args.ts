/**
 * @file Rule to flag duplicate arguments
 * @author Jamund Ferguson
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

import type { Definition, LegacyRule, Node } from '../../../types';

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow duplicate arguments in `function` definitions',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-dupe-args',
        },

        schema: [],

        messages: {
            unexpected: "Duplicate param '{{name}}'.",
        },
    },

    create(context) {
        const { sourceCode } = context;

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Checks whether or not a given definition is a parameter's.
         * @param def A definition to check.
         * @returns `true` if the definition is a parameter's.
         */
        function isParameter(def: Definition) {
            return def.type === 'Parameter';
        }

        /**
         * Determines if a given node has duplicate parameters.
         * @param node The node to check.
         */
        function checkParams(node: Node<'FunctionDeclaration' | 'FunctionExpression'>) {
            const variables = sourceCode.getDeclaredVariables(node);

            for (let i = 0; i < variables.length; i += 1) {
                const variable = variables[i];

                // Checks and reports duplications.
                const defs = variable!.defs.filter(isParameter);

                if (defs.length >= 2) {
                    context.report({
                        node,
                        messageId: 'unexpected',
                        data: { name: variable!.name },
                    });
                }
            }
        }

        //--------------------------------------------------------------------------
        // Public API
        //--------------------------------------------------------------------------

        return {
            FunctionDeclaration: checkParams,
            FunctionExpression: checkParams,
        };
    },
};

export default rule;
