/**
 * @file Rule to flag use of function declaration identifiers as variables.
 * @author Ian Christian Myers
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
            description: 'Disallow reassigning `function` declarations',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-func-assign',
        },

        schema: [],

        messages: {
            isAFunction: "'{{name}}' is a function.",
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * Reports a reference if is non initializer and writable.
         * @param references Collection of reference to check.
         */
        function checkReference(references: Reference[]) {
            astUtils.getModifyingReferences(references).forEach((reference: Reference) => {
                context.report({
                    node: reference.identifier,
                    messageId: 'isAFunction',
                    data: {
                        name: reference.identifier.name,
                    },
                });
            });
        }

        /**
         * Finds and reports references that are non initializer and writable.
         * @param variable A variable to check.
         */
        function checkVariable(variable: Variable) {
            if (variable!.defs[0]!.type === 'FunctionName') {
                checkReference(variable.references);
            }
        }

        /**
         * Checks parameters of a given function node.
         * @param node A function node to check.
         */
        function checkForFunction(node: Node<'FunctionDeclaration' | 'FunctionExpression'>) {
            sourceCode.getDeclaredVariables(node).forEach(checkVariable);
        }

        return {
            FunctionDeclaration: checkForFunction,
            FunctionExpression: checkForFunction,
        };
    },
};

export default rule;
