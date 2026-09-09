/**
 * @file Ensure handling of errors when we know they exist.
 * @author Jamund Ferguson
 * @deprecated in ESLint v7.0.0
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

import type {
    Scope, LegacyRule, Node, Variable,
} from '../../../types';

const rule: LegacyRule<[string?]> = {
    meta: {
        deprecated: true,

        replacedBy: [],

        type: 'suggestion',

        docs: {
            description: 'Require error handling in callbacks',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/handle-callback-err',
        },

        schema: [
            {
                type: 'string',
            },
        ],
        messages: {
            expected: 'Expected error to be handled.',
        },
    },

    create(context) {
        const errorArgument = context.options[0] || 'err';
        const { sourceCode } = context;

        /**
         * Checks if the given argument should be interpreted as a regexp pattern.
         * @param stringToCheck The string which should be checked.
         * @returns Whether or not the string should be interpreted as a pattern.
         */
        function isPattern(stringToCheck: string) {
            const firstChar = stringToCheck[0];

            return firstChar === '^';
        }

        /**
         * Checks if the given name matches the configured error argument.
         * @param name The name which should be compared.
         * @returns Whether or not the given name matches the configured error variable name.
         */
        function matchesConfiguredErrorName(name: string) {
            if (isPattern(errorArgument)) {
                const regexp = new RegExp(errorArgument, 'u');

                return regexp.test(name);
            }
            return name === errorArgument;
        }

        /**
         * Get the parameters of a given function scope.
         * @param scope The function scope.
         * @returns All parameters of the given scope.
         */
        function getParameters(scope: Scope) {
            return scope.variables.filter(
                (variable: Variable) => variable.defs[0] && variable.defs[0].type === 'Parameter',
            );
        }

        /**
         * Check to see if we're handling the error object properly.
         * @param node The AST node to check.
         */
        function checkForError(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
        ) {
            const scope = sourceCode.getScope(node);
            const parameters = getParameters(scope);
            const firstParameter = parameters[0];

            if (firstParameter && matchesConfiguredErrorName(firstParameter.name)) {
                if (firstParameter.references.length === 0) {
                    context.report({ node, messageId: 'expected' });
                }
            }
        }

        return {
            FunctionDeclaration: checkForError,
            FunctionExpression: checkForError,
            ArrowFunctionExpression: checkForError,
        };
    },
};

export default rule;
