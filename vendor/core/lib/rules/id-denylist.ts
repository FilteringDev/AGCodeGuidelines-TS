/**
 * @file Rule that warns when identifier names that are
 * specified in the configuration are used.
 * @author Keith Cirkel (http://keithcirkel.co.uk)
 */

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks whether the given node represents assignment target in a normal assignment or destructuring.
 * @param node The node to check.
 * @returns `true` if the node is assignment target.
 */

import type { Scope, LegacyRule, Node } from '../../../types';

/**
 *
 * @param node The node to inspect.
 * @returns Whether this member is an assignment target.
 */
function isAssignmentTarget(node: Node<'MemberExpression'>) {
    const { parent } = node;

    return (
        // normal assignment
        (parent.type === 'AssignmentExpression' && parent.left === node)
        // destructuring
        || parent.type === 'ArrayPattern'
        || parent.type === 'RestElement'
        || (parent.type === 'Property'
            && parent.value === node
            && parent.parent.type === 'ObjectPattern')
        || (parent.type === 'AssignmentPattern' && parent.left === node)
    );
}

/**
 * Checks whether the given node represents an imported name that is renamed in the same import/export specifier.
 *
 * Examples:
 * import { a as b } from 'mod'; // node `a` is renamed import
 * export { a as b } from 'mod'; // node `a` is renamed import
 * @param node `Identifier` node to check.
 * @returns `true` if the node is a renamed import.
 */
function isRenamedImport(node: Node<'Identifier' | 'PrivateIdentifier'>) {
    const { parent } = node;

    return (
        (parent.type === 'ImportSpecifier'
            && parent.imported !== parent.local
            && parent.imported === node)
        || (parent.type === 'ExportSpecifier'
            && 'source' in parent.parent
            && parent.parent.source // re-export
            && parent.local !== parent.exported
            && parent.local === node)
    );
}

/**
 * Checks whether the given node is an ObjectPattern destructuring.
 *
 * Examples:
 * const { a : b } = foo;
 * @param node `Identifier` node to check.
 * @returns `true` if the node is in an ObjectPattern destructuring.
 */
function isPropertyNameInDestructuring(node: Node<'Identifier' | 'PrivateIdentifier'>) {
    const { parent } = node;

    return (
        !parent.computed
        && parent.type === 'Property'
        && parent.parent.type === 'ObjectPattern'
        && parent.key === node
    );
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<string[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow specified identifiers',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/id-denylist',
        },

        schema: {
            type: 'array',
            items: {
                type: 'string',
            },
            uniqueItems: true,
        },
        messages: {
            restricted: "Identifier '{{name}}' is restricted.",
            restrictedPrivate: "Identifier '#{{name}}' is restricted.",
        },
    },

    create(context) {
        const denyList = new Set(context.options);
        const reportedNodes: Set<string> = new Set();
        const { sourceCode } = context;

        let globalScope: Scope;

        /**
         * Checks whether the given name is restricted.
         * @param name The name to check.
         * @returns `true` if the name is restricted.
         */
        function isRestricted(name: string) {
            return denyList.has(name);
        }

        /**
         * Checks whether the given node represents a reference to a global variable that is not declared in the
         * source code.
         * These identifiers will be allowed, as it is assumed that user has no control over the names of external
         * global variables.
         * @param node `Identifier` node to check.
         * @returns `true` if the node is a reference to a global variable.
         */
        function isReferenceToGlobalVariable(node: Node<'Identifier' | 'PrivateIdentifier'>) {
            const variable = globalScope.set.get(node.name);

            return (
                variable
                && variable.defs.length === 0
                && variable.references.some((ref) => ref.identifier === node)
            );
        }

        /**
         * Determines whether the given node should be checked.
         * @param node `Identifier` node.
         * @returns `true` if the node should be checked.
         */
        function shouldCheck(node: Node<'Identifier' | 'PrivateIdentifier'>) {
            const { parent } = node;

            /**
             * Member access has special rules for checking property names.
             * Read access to a property with a restricted name is allowed, because it can be on an object that user
             * has no control over.
             * Write access isn't allowed, because it potentially creates a new property with a restricted name.
             */
            if (
                parent.type === 'MemberExpression'
                && parent.property === node
                && !parent.computed
            ) {
                return isAssignmentTarget(parent);
            }

            return (
                parent.type !== 'CallExpression'
                && parent.type !== 'NewExpression'
                && !isRenamedImport(node)
                && !isPropertyNameInDestructuring(node)
                && !isReferenceToGlobalVariable(node)
            );
        }

        /**
         * Reports an AST node as a rule violation.
         * @param node The node to report.
         */
        function report(node: Node<'Identifier' | 'PrivateIdentifier'>) {
            /**
             * We used the range instead of the node because it's possible
             * for the same identifier to be represented by two different
             * nodes, with the most clear example being shorthand properties:
             * { foo }
             * In this case, "foo" is represented by one node for the name
             * and one for the value. The only way to know they are the same
             * is to look at the range.
             */
            if (!reportedNodes.has(node.range.toString())) {
                const isPrivate = node.type === 'PrivateIdentifier';

                context.report({
                    node,
                    messageId: isPrivate ? 'restrictedPrivate' : 'restricted',
                    data: {
                        name: node.name,
                    },
                });
                reportedNodes.add(node.range.toString());
            }
        }

        return {
            Program(node: Node<'Program'>) {
                globalScope = sourceCode.getScope(node);
            },

            [['Identifier', 'PrivateIdentifier'].join(',')](
                node: Node<'Identifier' | 'PrivateIdentifier'>,
            ) {
                if (isRestricted(node.name) && shouldCheck(node)) {
                    report(node);
                }
            },
        };
    },
};

export default rule;
