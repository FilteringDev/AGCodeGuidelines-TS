/**
 * @file A rule to disallow modifying variables that are declared using `const`
 * @author Toru Nagashima
 */
import dependency0 from './utils/ast-utils';
import type {
    LegacyRule, Node, Reference, Variable,
} from '../../../types';

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow reassigning `const` variables',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-const-assign',
        },

        schema: [],

        messages: {
            const: "'{{name}}' is constant.",
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * Finds and reports references that are non initializer and writable.
         * @param variable A variable to check.
         */
        function checkVariable(variable: Variable) {
            astUtils
                .getModifyingReferences(variable.references)
                .forEach((reference: Reference) => {
                    context.report({
                        node: reference.identifier,
                        messageId: 'const',
                        data: { name: reference.identifier.name },
                    });
                });
        }

        return {
            VariableDeclaration(node: Node<'VariableDeclaration'>) {
                if (node.kind === 'const') {
                    sourceCode.getDeclaredVariables(node).forEach(checkVariable);
                }
            },
        };
    },
};

export default rule;
