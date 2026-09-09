/**
 * @file Rule to flag non-camelcased identifiers
 * @author Nicholas C. Zakas
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        {
            ignoreDestructuring?: boolean;
            ignoreImports?: boolean;
            ignoreGlobals?: boolean;
            properties?: 'always' | 'never';
            allow?: [string?];
        }?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Enforce camelcase naming convention',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/camelcase',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    ignoreDestructuring: {
                        type: 'boolean',
                        default: false,
                    },
                    ignoreImports: {
                        type: 'boolean',
                        default: false,
                    },
                    ignoreGlobals: {
                        type: 'boolean',
                        default: false,
                    },
                    properties: {
                        enum: ['always', 'never'],
                    },
                    allow: {
                        type: 'array',
                        items: [
                            {
                                type: 'string',
                            },
                        ],
                        minItems: 0,
                        uniqueItems: true,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            notCamelCase: "Identifier '{{name}}' is not in camel case.",
            notCamelCasePrivate: '#{{name}} is not in camel case.',
        },
    },

    create(context) {
        const options = context.options[0] || {};
        const properties = options.properties === 'never' ? 'never' : 'always';
        const { ignoreDestructuring } = options;
        const { ignoreImports } = options;
        const { ignoreGlobals } = options;
        const allow = options.allow || [];
        const { sourceCode } = context;

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        // contains reported nodes to avoid reporting twice on destructuring with shorthand notation
        const reported: Set<number> = new Set();

        /**
         * Checks if a string contains an underscore and isn't all upper-case
         * @param name The string to check.
         * @returns if the string is underscored
         */
        function isUnderscored(name: string) {
            const nameBody = name.replace(/^_+|_+$/gu, '');

            // if there's an underscore, it might be A_CONSTANT, which is okay
            return nameBody.includes('_') && nameBody !== nameBody.toUpperCase();
        }

        /**
         * Checks if a string match the ignore list
         * @param name The string to check.
         * @returns if the string is ignored
         */
        function isAllowed(name: string) {
            return allow.some((entry) => name === entry || name.match(new RegExp(entry!, 'u')));
        }

        /**
         * Checks if a given name is good or not.
         * @param name The name to check.
         * @returns `true` if the name is good.
         */
        function isGoodName(name: string) {
            return !isUnderscored(name) || isAllowed(name);
        }

        /**
         * Checks if a given identifier reference or member expression is an assignment
         * target.
         * @param node The node to check.
         * @returns `true` if the node is an assignment target.
         */
        function isAssignmentTarget(node: Node) {
            const { parent } = node;

            switch (parent.type) {
                case 'AssignmentExpression':
                case 'AssignmentPattern':
                    return parent.left === node;

                case 'Property':
                    return parent.parent.type === 'ObjectPattern' && parent.value === node;
                case 'ArrayPattern':
                case 'RestElement':
                    return true;

                default:
                    return false;
            }
        }

        /**
         * Checks if a given binding identifier uses the original name as-is.
         * - If it's in object destructuring or object expression, the original name is its property name.
         * - If it's in import declaration, the original name is its exported name.
         * @param node The `Identifier` node to check.
         * @returns `true` if the identifier uses the original name as-is.
         */
        function equalsToOriginalName(node: Node<'Identifier'>) {
            const localName = node.name;
            const valueNode = node.parent.type === 'AssignmentPattern' ? node.parent : node;
            const { parent } = valueNode;

            switch (parent.type) {
                case 'Property':
                    return (
                        (parent.parent.type === 'ObjectPattern'
                            || parent.parent.type === 'ObjectExpression')
                        && parent.value === valueNode
                        && !parent.computed
                        && parent.key.type === 'Identifier'
                        && parent.key.name === localName
                    );

                case 'ImportSpecifier':
                    return (
                        parent.local === node
                        && astUtils.getModuleExportName(parent.imported) === localName
                    );

                default:
                    return false;
            }
        }

        /**
         * Reports an AST node as a rule violation.
         * @param node The node to report.
         */
        function report(
            node: Node<
                | 'BreakStatement'
                | 'ContinueStatement'
                | 'ExportAllDeclaration'
                | 'ExportSpecifier'
                | 'Identifier'
                | 'LabeledStatement'
                | 'MemberExpression'
                | 'MethodDefinition'
                | 'ObjectExpression'
                | 'PrivateIdentifier'
                | 'Property'
                | 'PropertyDefinition'
            >,
        ) {
            if (reported.has(node.range[0])) {
                return;
            }
            reported.add(node.range[0]);

            // Report it.
            context.report({
                node,
                messageId:
                    node.type === 'PrivateIdentifier' ? 'notCamelCasePrivate' : 'notCamelCase',
                data: { name: node.name },
            });
        }

        /**
         * Reports an identifier reference or a binding identifier.
         * @param node The `Identifier` node to report.
         */
        function reportReferenceId(node: Node<'Identifier'>) {
            /**
             * For backward compatibility, if it's in callings then ignore it.
             * Not sure why it is.
             */
            if (node.parent.type === 'CallExpression' || node.parent.type === 'NewExpression') {
                return;
            }

            /**
             * For backward compatibility, if it's a default value of
             * destructuring/parameters then ignore it.
             * Not sure why it is.
             */
            if (node.parent.type === 'AssignmentPattern' && node.parent.right === node) {
                return;
            }

            /**
             * The `ignoreDestructuring` flag skips the identifiers that uses
             * the property name as-is.
             */
            if (ignoreDestructuring && equalsToOriginalName(node)) {
                return;
            }

            report(node);
        }

        return {
            // Report camelcase of global variable references ------------------
            Program(node: Node<'Program'>) {
                const scope = sourceCode.getScope(node);

                if (!ignoreGlobals) {
                    // Defined globals in config files or directive comments.
                    scope.variables.forEach((variable) => {
                        if (variable.identifiers.length > 0 || isGoodName(variable.name)) {
                            return;
                        }
                        variable.references.forEach((reference) => {
                            /**
                             * For backward compatibility, this rule reports read-only
                             * references as well.
                             */
                            reportReferenceId(reference.identifier);
                        });
                    });
                }

                // Undefined globals.
                scope.through.forEach((reference) => {
                    const id = reference.identifier;

                    if (isGoodName(id.name)) {
                        return;
                    }

                    /**
                     * For backward compatibility, this rule reports read-only
                     * references as well.
                     */
                    reportReferenceId(id);
                });
            },

            // Report camelcase of declared variables --------------------------
            [[
                'VariableDeclaration',
                'FunctionDeclaration',
                'FunctionExpression',
                'ArrowFunctionExpression',
                'ClassDeclaration',
                'ClassExpression',
                'CatchClause',
            ].join(',')](
                node: Node<
                    | 'ArrowFunctionExpression'
                    | 'CatchClause'
                    | 'ClassDeclaration'
                    | 'ClassExpression'
                    | 'FunctionDeclaration'
                    | 'FunctionExpression'
                    | 'VariableDeclaration'
                >,
            ) {
                sourceCode.getDeclaredVariables(node).forEach((variable) => {
                    if (isGoodName(variable.name)) {
                        return;
                    }
                    const id = variable.identifiers[0];

                    // Report declaration.
                    if (!(ignoreDestructuring && equalsToOriginalName(id!))) {
                        report(id!);
                    }

                    /**
                     * For backward compatibility, report references as well.
                     * It looks unnecessary because declarations are reported.
                     */
                    variable.references.forEach((reference) => {
                        if (reference.init) {
                            return; // Skip the write references of initializers.
                        }
                        reportReferenceId(reference.identifier);
                    });
                });
            },

            // Report camelcase in properties ----------------------------------
            [[
                'ObjectExpression > Property[computed!=true] > Identifier.key',
                'MethodDefinition[computed!=true] > Identifier.key',
                'PropertyDefinition[computed!=true] > Identifier.key',
                'MethodDefinition > PrivateIdentifier.key',
                'PropertyDefinition > PrivateIdentifier.key',
            ].join(',')](node: Node<'Identifier' | 'PrivateIdentifier'>) {
                if (properties === 'never' || isGoodName(node.name!)) {
                    return;
                }
                report(node);
            },
            'MemberExpression[computed!=true] > Identifier.property':
                function onMemberExpressionComputedTrueIdentifierProperty(
                    node: Node<'Identifier'>,
                ) {
                    if (
                        properties === 'never'
                        || !isAssignmentTarget(node.parent) // ← ignore read-only references.
                        || isGoodName(node.name!)
                    ) {
                        return;
                    }
                    report(node);
                },

            // Report camelcase in import --------------------------------------
            ImportDeclaration(node: Node<'ImportDeclaration'>) {
                sourceCode.getDeclaredVariables(node).forEach((variable) => {
                    if (isGoodName(variable.name)) {
                        return;
                    }
                    const id = variable.identifiers[0];

                    // Report declaration.
                    if (!(ignoreImports && equalsToOriginalName(id!))) {
                        report(id!);
                    }

                    /**
                     * For backward compatibility, report references as well.
                     * It looks unnecessary because declarations are reported.
                     */
                    variable.references.forEach((reference) => {
                        reportReferenceId(reference.identifier);
                    });
                });
            },

            // Report camelcase in re-export -----------------------------------
            [[
                'ExportAllDeclaration > Identifier.exported',
                'ExportSpecifier > Identifier.exported',
            ].join(',')](node: Node<'Identifier'>) {
                if (isGoodName(node.name!)) {
                    return;
                }
                report(node);
            },

            // Report camelcase in labels --------------------------------------
            [[
                'LabeledStatement > Identifier.label',

                /**
                 * For backward compatibility, report references as well.
                 * It looks unnecessary because declarations are reported.
                 */
                'BreakStatement > Identifier.label',
                'ContinueStatement > Identifier.label',
            ].join(',')](node: Node<'Identifier'>) {
                if (isGoodName(node.name!)) {
                    return;
                }
                report(node);
            },
        };
    },
};

export default rule;
