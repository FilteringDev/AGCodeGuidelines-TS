/**
 * @file Rule to enforce consistent naming of "this" context variables
 * @author Raphael Pigulla
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

import type {
    Scope, LegacyRule, Node, Reference,
} from '../../../types';

const rule: LegacyRule<string[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description:
                'Enforce consistent naming when capturing the current execution context',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/consistent-this',
        },

        schema: {
            type: 'array',
            items: {
                type: 'string',
                minLength: 1,
            },
            uniqueItems: true,
        },

        messages: {
            aliasNotAssignedToThis: "Designated alias '{{name}}' is not assigned to 'this'.",
            unexpectedAlias: "Unexpected alias '{{name}}' for 'this'.",
        },
    },

    create(context) {
        let aliases: string[] = [];
        const { sourceCode } = context;

        if (context.options.length === 0) {
            aliases.push('that');
        } else {
            aliases = context.options;
        }

        /**
         * Reports that a variable declarator or assignment expression is assigning
         * a non-'this' value to the specified alias.
         * @param node The assigning node.
         * @param name the name of the alias that was incorrectly used.
         */
        function reportBadAssignment(node: Node, name: string) {
            context.report({ node, messageId: 'aliasNotAssignedToThis', data: { name } });
        }

        /**
         * Checks that an assignment to an identifier only assigns 'this' to the
         * appropriate alias, and the alias is only assigned to 'this'.
         * @param node The assigning node.
         * @param name The name of the variable assigned to.
         * @param value The value of the assignment.
         */
        function checkAssignment(
            node: Node<'AssignmentExpression' | 'VariableDeclarator'>,
            name: string,
            value: Node,
        ) {
            const isThis = value.type === 'ThisExpression';

            if (aliases.includes(name)) {
                if (!isThis || (node.operator && node.operator !== '=')) {
                    reportBadAssignment(node, name);
                }
            } else if (isThis) {
                context.report({ node, messageId: 'unexpectedAlias', data: { name } });
            }
        }

        /**
         * Ensures that a variable declaration of the alias in a program or function
         * is assigned to the correct value.
         * @param alias alias the check the assignment of.
         * @param scope scope of the current code we are checking.
         */
        function checkWasAssigned(alias: string, scope: Scope) {
            const variable = scope.set.get(alias);

            if (!variable) {
                return;
            }

            if (
                variable.defs.some(
                    (def) => def.node.type === 'VariableDeclarator' && def.node.init !== null,
                )
            ) {
                return;
            }

            /**
             * The alias has been declared and not assigned: check it was
             * assigned later in the same scope.
             */
            if (
                !variable.references.some((reference: Reference) => {
                    const write = reference.writeExpr;

                    return (
                        reference.from === scope
                        && write
                        && write.type === 'ThisExpression'
                        && write.parent.operator === '='
                    );
                })
            ) {
                variable.defs
                    .map((def) => def.node)
                    .forEach((node: Node) => {
                        reportBadAssignment(node, alias);
                    });
            }
        }

        /**
         * Check each alias to ensure that is was assigned to the correct value.
         * @param node The node that represents the scope to check.
         */
        function ensureWasAssigned(
            node: Node<'FunctionDeclaration' | 'FunctionExpression' | 'Program'>,
        ) {
            const scope = sourceCode.getScope(node);

            aliases.forEach((alias) => {
                checkWasAssigned(alias, scope);
            });
        }

        return {
            'Program:exit': ensureWasAssigned,
            'FunctionExpression:exit': ensureWasAssigned,
            'FunctionDeclaration:exit': ensureWasAssigned,

            VariableDeclarator(node: Node<'VariableDeclarator'>) {
                const { id } = node;
                const isDestructuring = id.type === 'ArrayPattern' || id.type === 'ObjectPattern';

                if (node.init !== null && !isDestructuring) {
                    checkAssignment(node, id.name!, node.init!);
                }
            },

            AssignmentExpression(node: Node<'AssignmentExpression'>) {
                if (node.left.type === 'Identifier') {
                    checkAssignment(node, node.left.name, node.right);
                }
            },
        };
    },
};

export default rule;
