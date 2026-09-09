/**
 * @file Enforce return after a callback.
 * @author Jamund Ferguson
 * @deprecated in ESLint v7.0.0
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[string[]?]> = {
    meta: {
        deprecated: true,

        replacedBy: [],

        type: 'suggestion',

        docs: {
            description: 'Require `return` statements after callbacks',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/callback-return',
        },

        schema: [
            {
                type: 'array',
                items: { type: 'string' },
            },
        ],

        messages: {
            missingReturn: 'Expected return with your callback function.',
        },
    },

    create(context) {
        const callbacks = context.options[0] || ['callback', 'cb', 'next'];
        const { sourceCode } = context;

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Find the closest parent matching a list of types.
         * @param node The node whose parents we are searching
         * @param types The node types to match
         * @returns The matched node or undefined.
         */
        function findClosestParentOfType(node: Node, types: Node['type'][]): Node | null {
            if (!node.parent) {
                return null;
            }
            if (!types.includes(node.parent.type)) {
                return findClosestParentOfType(node.parent, types);
            }
            return node.parent;
        }

        /**
         * Check to see if a node contains only identifiers
         * @param node The node to check
         * @returns Whether or not the node contains only identifiers
         */
        function containsOnlyIdentifiers(node: Node): boolean {
            if (node.type === 'Identifier') {
                return true;
            }

            if (node.type === 'MemberExpression') {
                if (node.object.type === 'Identifier') {
                    return true;
                }
                if (node.object.type === 'MemberExpression') {
                    return containsOnlyIdentifiers(node.object);
                }
            }

            return false;
        }

        /**
         * Check to see if a CallExpression is in our callback list.
         * @param node The node to check against our callback names list.
         * @returns Whether or not this function matches our callback name.
         */
        function isCallback(node: Node<'CallExpression'>) {
            return (
                containsOnlyIdentifiers(node.callee)
                && callbacks.includes(sourceCode.getText(node.callee))
            );
        }

        /**
         * Determines whether or not the callback is part of a callback expression.
         * @param node The callback node
         * @param parentNode The expression node
         * @returns Whether or not this is part of a callback expression
         */
        function isCallbackExpression(node: Node<'CallExpression'>, parentNode: Node) {
            // ensure the parent node exists and is an expression
            if (!parentNode || parentNode.type !== 'ExpressionStatement') {
                return false;
            }

            // cb()
            if (parentNode.expression === node) {
                return true;
            }

            // special case for cb && cb() and similar
            if (
                parentNode.expression.type === 'BinaryExpression'
                || parentNode.expression.type === 'LogicalExpression'
            ) {
                if (parentNode.expression.right === node) {
                    return true;
                }
            }

            return false;
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            CallExpression(node: Node<'CallExpression'>) {
                // if we're not a callback we can return
                if (!isCallback(node)) {
                    return;
                }

                // find the closest block, return or loop
                const closestBlock = findClosestParentOfType(node, [
                    'BlockStatement',
                    'ReturnStatement',
                    'ArrowFunctionExpression',
                ]);

                // if our parent is a return we know we're ok
                if (closestBlock?.type === 'ReturnStatement') {
                    return;
                }

                // arrow functions don't always have blocks and implicitly return
                if (closestBlock?.type === 'ArrowFunctionExpression') {
                    return;
                }

                // block statements are part of functions and most if statements
                if (closestBlock?.type === 'BlockStatement') {
                    // find the last item in the block
                    const lastItem = closestBlock.body[closestBlock.body.length - 1];

                    // if the callback is the last thing in a block that might be ok
                    if (isCallbackExpression(node, lastItem!)) {
                        const parentType = closestBlock.parent.type;

                        // but only if the block is part of a function
                        if (
                            parentType === 'FunctionExpression'
                            || parentType === 'FunctionDeclaration'
                            || parentType === 'ArrowFunctionExpression'
                        ) {
                            return;
                        }
                    }

                    // ending a block with a return is also ok
                    if (lastItem!.type === 'ReturnStatement') {
                        // but only if the callback is immediately before
                        if (
                            isCallbackExpression(
                                node,
                                closestBlock.body[closestBlock.body.length - 2]!,
                            )
                        ) {
                            return;
                        }
                    }
                }

                // as long as you're the child of a function at this point you should be asked to return
                if (
                    findClosestParentOfType(node, [
                        'FunctionDeclaration',
                        'FunctionExpression',
                        'ArrowFunctionExpression',
                    ])
                ) {
                    context.report({ node, messageId: 'missingReturn' });
                }
            },
        };
    },
};

export default rule;
