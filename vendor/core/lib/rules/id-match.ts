/**
 * @file Rule to flag non-matching identifiers
 * @author Matthieu Larcher
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

import type { Scope, LegacyRule, Node } from '../../../types';

const rule: LegacyRule<
    [
        string?,
        {
            properties?: boolean;
            classFields?: boolean;
            onlyDeclarations?: boolean;
            ignoreDestructuring?: boolean;
        }?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Require identifiers to match a specified regular expression',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/id-match',
        },

        schema: [
            {
                type: 'string',
            },
            {
                type: 'object',
                properties: {
                    properties: {
                        type: 'boolean',
                        default: false,
                    },
                    classFields: {
                        type: 'boolean',
                        default: false,
                    },
                    onlyDeclarations: {
                        type: 'boolean',
                        default: false,
                    },
                    ignoreDestructuring: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            notMatch: "Identifier '{{name}}' does not match the pattern '{{pattern}}'.",
            notMatchPrivate: "Identifier '#{{name}}' does not match the pattern '{{pattern}}'.",
        },
    },

    create(context) {
        //--------------------------------------------------------------------------
        // Options
        //--------------------------------------------------------------------------
        const pattern = context.options[0] || '^.+$';
        const regexp = new RegExp(pattern, 'u');

        const options = context.options[1] || {};
        const checkProperties = !!options.properties;
        const checkClassFields = !!options.classFields;
        const onlyDeclarations = !!options.onlyDeclarations;
        const ignoreDestructuring = !!options.ignoreDestructuring;

        const { sourceCode } = context;
        let globalScope: Scope;

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        // contains reported nodes to avoid reporting twice on destructuring with shorthand notation
        const reportedNodes: Set<string> = new Set();
        const ALLOWED_PARENT_TYPES = new Set(['CallExpression', 'NewExpression']);
        const DECLARATION_TYPES = new Set(['FunctionDeclaration', 'VariableDeclarator']);
        const IMPORT_TYPES = new Set([
            'ImportSpecifier',
            'ImportNamespaceSpecifier',
            'ImportDefaultSpecifier',
        ]);

        /**
         * Checks whether the given node represents a reference to a global variable that is not declared in the
         * source code.
         * These identifiers will be allowed, as it is assumed that user has no control over the names of external
         * global variables.
         * @param node `Identifier` node to check.
         * @returns `true` if the node is a reference to a global variable.
         */
        function isReferenceToGlobalVariable(node: Node<'Identifier'>) {
            const variable = globalScope.set.get(node.name);

            return (
                variable
                && variable.defs.length === 0
                && variable.references.some((ref) => ref.identifier === node)
            );
        }

        /**
         * Checks if a string matches the provided pattern
         * @param name The string to check.
         * @returns if the string is a match
         */
        function isInvalid(name: string) {
            return !regexp.test(name);
        }

        /**
         * Checks if a parent of a node is an ObjectPattern.
         * @param node The node to check.
         * @returns if the node is inside an ObjectPattern
         */
        function isInsideObjectPattern(node: Node<'Identifier'>) {
            let { parent } = node;

            while (parent) {
                if (parent.type === 'ObjectPattern') {
                    return true;
                }

                parent = parent.parent;
            }

            return false;
        }

        /**
         * Verifies if we should report an error or not based on the effective
         * parent node and the identifier name.
         * @param effectiveParent The effective parent node of the node to be reported
         * @param name The identifier name of the identifier node
         * @returns whether an error should be reported or not
         */
        function shouldReport(effectiveParent: Node, name: string) {
            return (
                (!onlyDeclarations || DECLARATION_TYPES.has(effectiveParent.type))
                && !ALLOWED_PARENT_TYPES.has(effectiveParent.type)
                && isInvalid(name)
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
                const messageId = node.type === 'PrivateIdentifier' ? 'notMatchPrivate' : 'notMatch';

                context.report({
                    node,
                    messageId,
                    data: {
                        name: node.name,
                        pattern,
                    },
                });
                reportedNodes.add(node.range.toString());
            }
        }

        return {
            Program(node: Node<'Program'>) {
                globalScope = sourceCode.getScope(node);
            },

            Identifier(node: Node<'Identifier'>) {
                const { name } = node;
                const { parent } = node;
                const effectiveParent = parent.type === 'MemberExpression' ? parent.parent : parent;

                if (isReferenceToGlobalVariable(node)) {
                    return;
                }

                if (parent.type === 'MemberExpression') {
                    if (!checkProperties) {
                        return;
                    }

                    // Always check object names
                    if (parent.object.type === 'Identifier' && parent.object.name === name) {
                        if (isInvalid(name)) {
                            report(node);
                        }

                        // Report AssignmentExpressions left side's assigned variable id
                    } else if (
                        effectiveParent.type === 'AssignmentExpression'
                        && effectiveParent.left.type === 'MemberExpression'
                        && effectiveParent.left.property.name === node.name
                    ) {
                        if (isInvalid(name)) {
                            report(node);
                        }

                        // Report AssignmentExpressions only if they are the left side of the assignment
                    } else if (
                        effectiveParent.type === 'AssignmentExpression'
                        && effectiveParent.right.type !== 'MemberExpression'
                    ) {
                        if (isInvalid(name)) {
                            report(node);
                        }
                    }

                    // For https://github.com/eslint/eslint/issues/15123
                } else if (
                    parent.type === 'Property'
                    && parent.parent.type === 'ObjectExpression'
                    && parent.key === node
                    && !parent.computed
                ) {
                    if (checkProperties && isInvalid(name)) {
                        report(node);
                    }

                    /**
                     * Properties have their own rules, and
                     * AssignmentPattern nodes can be treated like Properties:
                     * e.g.: const { no_camelcased = false } = bar;
                     */
                } else if (parent.type === 'Property' || parent.type === 'AssignmentPattern') {
                    if (
                        parent.type === 'Property'
                        && parent.parent
                        && parent.parent.type === 'ObjectPattern'
                    ) {
                        if (
                            !ignoreDestructuring
                            && parent.shorthand
                            && 'left' in parent.value
                            && parent.value.left
                            && isInvalid(name)
                        ) {
                            report(node);
                        }

                        const assignmentKeyEqualsValue = parent.key.name === parent.value!.name;

                        // prevent checking righthand side of destructured object
                        if (!assignmentKeyEqualsValue && parent.key === node) {
                            return;
                        }

                        const valueIsInvalid = parent.value!.name && isInvalid(name);

                        // ignore destructuring if the option is set, unless a new identifier is created
                        if (
                            valueIsInvalid
                            && !(assignmentKeyEqualsValue && ignoreDestructuring)
                        ) {
                            report(node);
                        }
                    }

                    // never check properties or always ignore destructuring
                    if (
                        (!checkProperties && !parent.computed)
                        || (ignoreDestructuring && isInsideObjectPattern(node))
                    ) {
                        return;
                    }

                    // don't check right hand side of AssignmentExpression to prevent duplicate warnings
                    if (
                        (!('right' in parent) || parent.right !== node)
                        && shouldReport(effectiveParent, name)
                    ) {
                        report(node);
                    }

                    // Check if it's an import specifier
                } else if (IMPORT_TYPES.has(parent.type)) {
                    // Report only if the local imported identifier is invalid
                    if (
                        'local' in parent
                        && parent.local
                        && parent.local.name === node.name
                        && isInvalid(name)
                    ) {
                        report(node);
                    }
                } else if (parent.type === 'PropertyDefinition') {
                    if (checkClassFields && isInvalid(name)) {
                        report(node);
                    }

                    // Report anything that is invalid that isn't a CallExpression
                } else if (shouldReport(effectiveParent, name)) {
                    report(node);
                }
            },

            PrivateIdentifier(node: Node<'PrivateIdentifier'>) {
                const isClassField = node.parent.type === 'PropertyDefinition';

                if (isClassField && !checkClassFields) {
                    return;
                }

                if (isInvalid(node.name)) {
                    report(node);
                }
            },
        };
    },
};

export default rule;
