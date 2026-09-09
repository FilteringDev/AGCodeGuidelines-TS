/**
 * @file Rule to flag use of alert, confirm, prompt
 * @author Nicholas C. Zakas
 */
import dependency0 from './utils/ast-utils';
import type {
    Scope, LegacyRule, Node, Reference,
} from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const {
    getStaticPropertyName: getPropertyName,
    getVariableByName,
    skipChainExpression,
} = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks if the given name is a prohibited identifier.
 * @param name The name to check
 * @returns Whether or not the name is prohibited.
 */
function isProhibitedIdentifier(name: string) {
    return /^(alert|confirm|prompt)$/u.test(name);
}

/**
 * Finds the eslint-scope reference in the given scope.
 * @param scope The scope to search.
 * @param node The identifier node.
 * @returns Returns the found reference or null if none were found.
 */
function findReference(scope: Scope, node: Node) {
    const references = scope.references.filter(
        (reference: Reference) => reference.identifier.range[0] === node.range[0]
            && reference.identifier.range[1] === node.range[1],
    );

    if (references.length === 1) {
        return references[0];
    }
    return null;
}

/**
 * Checks if the given identifier node is shadowed in the given scope.
 * @param scope The current scope.
 * @param node The identifier node to check
 * @returns Whether or not the name is shadowed.
 */
function isShadowed(scope: Scope, node: Node) {
    const reference = findReference(scope, node);

    return reference && reference.resolved && reference.resolved.defs.length > 0;
}

/**
 * Checks if the given identifier node is a ThisExpression in the global scope or the global window property.
 * @param scope The current scope.
 * @param node The identifier node to check
 * @returns Whether or not the node is a reference to the global object.
 */
function isGlobalThisReferenceOrGlobalWindow(scope: Scope, node: Node) {
    if (scope.type === 'global' && node.type === 'ThisExpression') {
        return true;
    }
    if (
        node.type === 'Identifier'
        && (node.name === 'window'
            || (node.name === 'globalThis' && getVariableByName(scope, 'globalThis')))
    ) {
        return !isShadowed(scope, node);
    }

    return false;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow the use of `alert`, `confirm`, and `prompt`',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-alert',
        },

        schema: [],

        messages: {
            unexpected: 'Unexpected {{name}}.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        return {
            CallExpression(node: Node<'CallExpression'>) {
                const callee = skipChainExpression(node.callee);
                const currentScope = sourceCode.getScope(node);

                // without window.
                if (callee.type === 'Identifier') {
                    const { name } = callee;

                    if (
                        !isShadowed(currentScope, callee)
                        && isProhibitedIdentifier(callee.name)
                    ) {
                        context.report({
                            node,
                            messageId: 'unexpected',
                            data: { name },
                        });
                    }
                } else if (
                    callee.type === 'MemberExpression'
                    && isGlobalThisReferenceOrGlobalWindow(currentScope, callee.object)
                ) {
                    const name = getPropertyName(callee);

                    if (isProhibitedIdentifier(name!)) {
                        context.report({
                            node,
                            messageId: 'unexpected',
                            data: { name },
                        });
                    }
                }
            },
        };
    },
};

export default rule;
