import astUtils from './utils/ast-utils';
/**
 * @file Rule to flag creation of function inside a loop
 * @author Ilya Volodin
 */
import type { LegacyRule, Node, Reference } from '../../../types';

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Gets the containing loop node of a specified node.
 *
 * We don't need to check nested functions, so this ignores those.
 * `Scope.through` contains references of nested functions.
 * @param node An AST node to get.
 * @returns The containing loop node of the specified node, or
 *      `null`.
 */
function getContainingLoopNode(
    node: Node<
        | 'ArrowFunctionExpression'
        | 'DoWhileStatement'
        | 'ForInStatement'
        | 'ForOfStatement'
        | 'ForStatement'
        | 'FunctionDeclaration'
        | 'FunctionExpression'
        | 'WhileStatement'
    >,
) {
    for (let currentNode: Node = node; currentNode.parent; currentNode = currentNode.parent) {
        const parent: Node = astUtils.getParent(currentNode);

        switch (parent.type) {
            case 'WhileStatement':
            case 'DoWhileStatement':
                return parent;

            case 'ForStatement':
                // `init` is outside of the loop.
                if (parent.init !== currentNode) {
                    return parent;
                }
                break;

            case 'ForInStatement':
            case 'ForOfStatement':
                // `right` is outside of the loop.
                if (parent.right !== currentNode) {
                    return parent;
                }
                break;

            case 'ArrowFunctionExpression':
            case 'FunctionExpression':
            case 'FunctionDeclaration':
                // We don't need to check nested functions.
                return null;

            default:
                break;
        }
    }

    return null;
}

/**
 * Gets the containing loop node of a given node.
 * If the loop was nested, this returns the most outer loop.
 * @param node A node to get. This is a loop node.
 * @param excludedNode A node that the result node should not
 *      include.
 * @returns The most outer loop node.
 */
function getTopLoopNode(
    node: Node<
        | 'DoWhileStatement'
        | 'ForInStatement'
        | 'ForOfStatement'
        | 'ForStatement'
        | 'WhileStatement'
    >,
    excludedNode: Node | null,
) {
    const border = excludedNode ? excludedNode.range[1] : 0;
    let retv = node;
    let containingLoopNode:
        | Node<
              | 'WhileStatement'
              | 'DoWhileStatement'
              | 'ForStatement'
              | 'ForInStatement'
              | 'ForOfStatement'
        >
        | Node<'WhileStatement'>
        | Node<'DoWhileStatement'>
        | Node<'ForStatement'>
        | Node<'ForInStatement'>
        | Node<'ForOfStatement'>
        | null = node;

    while (containingLoopNode && containingLoopNode.range[0] >= border) {
        retv = containingLoopNode;
        containingLoopNode = getContainingLoopNode(containingLoopNode);
    }

    return retv;
}

/**
 * Checks whether a given reference which refers to an upper scope's variable is
 * safe or not.
 * @param loopNode A containing loop node.
 * @param reference A reference to check.
 * @returns `true` if the reference is safe or not.
 */
function isSafe(
    loopNode: Node<
        | 'DoWhileStatement'
        | 'ForInStatement'
        | 'ForOfStatement'
        | 'ForStatement'
        | 'WhileStatement'
    >,
    reference: Reference,
) {
    const variable = reference.resolved;
    const definition = variable && variable.defs[0];
    const declaration = definition && definition.parent;
    const kind = declaration && declaration.type === 'VariableDeclaration' ? declaration.kind : '';

    // Variables which are declared by `const` is safe.
    if (kind === 'const') {
        return true;
    }

    /**
     * Variables which are declared by `let` in the loop is safe.
     * It's a different instance from the next loop step's.
     */
    if (
        kind === 'let'
        && declaration!.range[0] > loopNode.range[0]
        && declaration!.range[1] < loopNode.range[1]
    ) {
        return true;
    }

    /**
     * WriteReferences which exist after this border are unsafe because those
     * can modify the variable.
     */
    const border = getTopLoopNode(loopNode, (kind === 'let' ? declaration : null)!).range[0];

    /**
     * Checks whether a given reference is safe or not.
     * The reference is every reference of the upper scope's variable we are
     * looking now.
     *
     * It's safe if the reference matches one of the following condition.
     * - is readonly.
     * - doesn't exist inside a local function and after the border.
     * @param upperRef A reference to check.
     * @returns `true` if the reference is safe.
     */
    function isSafeReference(upperRef: Reference) {
        const id = upperRef.identifier;

        return (
            !upperRef.isWrite()
            || (variable!.scope.variableScope === upperRef.from.variableScope
                && id.range[0] < border)
        );
    }

    return Boolean(variable) && variable!.references.every(isSafeReference);
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description:
                'Disallow function declarations that contain unsafe references inside loop statements',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-loop-func',
        },

        schema: [],

        messages: {
            unsafeRefs:
                'Function declared in a loop contains unsafe references to variable(s) {{ varNames }}.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * Reports functions which match the following condition:
         *
         * - has a loop node in ancestors.
         * - has any references which refers to an unsafe variable.
         * @param node The AST node to check.
         */
        function checkForLoops(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
        ) {
            const loopNode = getContainingLoopNode(node);

            if (!loopNode) {
                return;
            }

            const references = sourceCode.getScope(node).through;
            const unsafeRefs = references
                .filter((r) => r.resolved && !isSafe(loopNode, r))
                .map((r) => r.identifier.name);

            if (unsafeRefs.length > 0) {
                context.report({
                    node,
                    messageId: 'unsafeRefs',
                    data: { varNames: `'${unsafeRefs.join("', '")}'` },
                });
            }
        }

        return {
            ArrowFunctionExpression: checkForLoops,
            FunctionExpression: checkForLoops,
            FunctionDeclaration: checkForLoops,
        };
    },
};

export default rule;
