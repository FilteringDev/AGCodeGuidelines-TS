/**
 * @file Rule to flag labels that are the same as an identifier
 * @author Ian Christian Myers
 */
import dependency0 from './utils/ast-utils';
import type { Scope, LegacyRule, Node } from '../../../types';

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
            description: 'Disallow labels that share a name with a variable',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-label-var',
        },

        schema: [],

        messages: {
            identifierClashWithLabel: 'Found identifier with same name as label.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Check if the identifier is present inside current scope
         * @param scope current scope
         * @param name To evaluate
         * @returns True if its present
         */
        function findIdentifier(scope: Scope, name: string) {
            return astUtils.getVariableByName(scope, name) !== null;
        }

        //--------------------------------------------------------------------------
        // Public API
        //--------------------------------------------------------------------------

        return {
            LabeledStatement(node: Node<'LabeledStatement'>) {
                // Fetch the innermost scope.
                const scope = sourceCode.getScope(node);

                /**
                 * Recursively find the identifier walking up the scope, starting
                 * with the innermost scope.
                 */
                if (findIdentifier(scope, node.label.name)) {
                    context.report({
                        node,
                        messageId: 'identifierClashWithLabel',
                    });
                }
            },
        };
    },
};

export default rule;
