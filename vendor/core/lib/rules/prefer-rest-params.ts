/**
 * @file Rule to
 * @author Toru Nagashima
 */

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Gets the variable object of `arguments` which is defined implicitly.
 * @param scope A scope to get.
 * @returns The found variable object.
 */

import type {
    Scope, LegacyRule, Node, Reference,
} from '../../../types';

/**
 *
 * @param scope The lexical scope.
 * @returns The implicit arguments variable, when available.
 */
function getVariableOfArguments(scope: Scope) {
    const { variables } = scope;

    for (let i = 0; i < variables.length; i += 1) {
        const variable = variables[i];

        if (variable!.name === 'arguments') {
            /**
             * If there was a parameter which is named "arguments", the implicit "arguments" is not defined.
             * So does fast return with null.
             */
            return variable!.identifiers.length === 0 ? variable : null;
        }
    }

    /* c8 ignore next */
    return null;
}

/**
 * Checks if the given reference is not normal member access.
 *
 * - arguments         .... true    // not member access
 * - arguments[i]      .... true    // computed member access
 * - arguments[0]      .... true    // computed member access
 * - arguments.length  .... false   // normal member access
 * @param reference The reference to check.
 * @returns `true` if the reference is not normal member access.
 */
function isNotNormalMemberAccess(reference: Reference) {
    const id = reference.identifier;
    const { parent } = id;

    return !(parent.type === 'MemberExpression' && parent.object === id && !parent.computed);
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Require rest parameters instead of `arguments`',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/prefer-rest-params',
        },

        schema: [],

        messages: {
            preferRestParams: "Use the rest parameters instead of 'arguments'.",
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * Reports a given reference.
         * @param reference A reference to report.
         */
        function report(reference: Reference) {
            context.report({
                node: reference.identifier,
                loc: reference.identifier.loc,
                messageId: 'preferRestParams',
            });
        }

        /**
         * Reports references of the implicit `arguments` variable if exist.
         * @param node The node representing the function.
         */
        function checkForArguments(node: Node<'FunctionDeclaration' | 'FunctionExpression'>) {
            const argumentsVar = getVariableOfArguments(sourceCode.getScope(node));

            if (argumentsVar) {
                argumentsVar.references.filter(isNotNormalMemberAccess).forEach(report);
            }
        }

        return {
            'FunctionDeclaration:exit': checkForArguments,
            'FunctionExpression:exit': checkForArguments,
        };
    },
};

export default rule;
