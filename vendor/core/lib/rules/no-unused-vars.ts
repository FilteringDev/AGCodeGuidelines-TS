/**
 * @file Rule to flag declared but unused variables
 * @author Ilya Volodin
 */
import dependency0 from './utils/ast-utils';
import type {
    LegacyRule, Node, Reference, Scope, Variable,
} from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Typedefs
//------------------------------------------------------------------------------

/**
 * Bag of data used for formatting the `unusedVar` lint message.
 * varName The name of the unused var.
 * action Description of the vars state.
 * additional Any additional info to be appended at the end.
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        (
            | 'all'
            | 'local'
            | {
                vars?: 'all' | 'local';
                varsIgnorePattern?: string;
                args?: 'all' | 'after-used' | 'none';
                ignoreRestSiblings?: boolean;
                argsIgnorePattern?: string;
                caughtErrors?: 'all' | 'none';
                caughtErrorsIgnorePattern?: string;
                destructuredArrayIgnorePattern?: string;
            }
        )?,
    ]
> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow unused variables',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-unused-vars',
        },

        schema: [
            {
                oneOf: [
                    {
                        enum: ['all', 'local'],
                    },
                    {
                        type: 'object',
                        properties: {
                            vars: {
                                enum: ['all', 'local'],
                            },
                            varsIgnorePattern: {
                                type: 'string',
                            },
                            args: {
                                enum: ['all', 'after-used', 'none'],
                            },
                            ignoreRestSiblings: {
                                type: 'boolean',
                            },
                            argsIgnorePattern: {
                                type: 'string',
                            },
                            caughtErrors: {
                                enum: ['all', 'none'],
                            },
                            caughtErrorsIgnorePattern: {
                                type: 'string',
                            },
                            destructuredArrayIgnorePattern: {
                                type: 'string',
                            },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        ],

        messages: {
            unusedVar: "'{{varName}}' is {{action}} but never used{{additional}}.",
        },
    },

    create(context) {
        const { sourceCode } = context;

        const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;

        const config: {
            vars: 'all' | 'local';
            args: 'after-used' | 'all' | 'none';
            ignoreRestSiblings: boolean;
            caughtErrors: 'all' | 'none';
            varsIgnorePattern?: RegExp;
            argsIgnorePattern?: RegExp;
            caughtErrorsIgnorePattern?: RegExp;
            destructuredArrayIgnorePattern?: RegExp;
        } = {
            vars: 'all',
            args: 'after-used',
            ignoreRestSiblings: false,
            caughtErrors: 'none',
        };

        const firstOption = context.options[0];

        if (firstOption) {
            if (typeof firstOption === 'string') {
                config.vars = firstOption;
            } else {
                config.vars = firstOption.vars || config.vars;
                config.args = firstOption.args || config.args;
                config.ignoreRestSiblings = firstOption.ignoreRestSiblings || config.ignoreRestSiblings;
                config.caughtErrors = firstOption.caughtErrors || config.caughtErrors;

                if (firstOption.varsIgnorePattern) {
                    config.varsIgnorePattern = new RegExp(firstOption.varsIgnorePattern, 'u');
                }

                if (firstOption.argsIgnorePattern) {
                    config.argsIgnorePattern = new RegExp(firstOption.argsIgnorePattern, 'u');
                }

                if (firstOption.caughtErrorsIgnorePattern) {
                    config.caughtErrorsIgnorePattern = new RegExp(
                        firstOption.caughtErrorsIgnorePattern,
                        'u',
                    );
                }

                if (firstOption.destructuredArrayIgnorePattern) {
                    config.destructuredArrayIgnorePattern = new RegExp(
                        firstOption.destructuredArrayIgnorePattern,
                        'u',
                    );
                }
            }
        }

        /**
         * Generates the message data about the variable being defined and unused,
         * including the ignore pattern if configured.
         * @param unusedVar eslint-scope variable object.
         * @returns The message data to be used with this unused variable.
         */
        function getDefinedMessageData(unusedVar: Variable) {
            const defType = unusedVar.defs && unusedVar.defs[0] && unusedVar.defs[0].type;
            let type;
            let pattern;

            if (defType === 'CatchClause' && config.caughtErrorsIgnorePattern) {
                type = 'args';
                pattern = config.caughtErrorsIgnorePattern.toString();
            } else if (defType === 'Parameter' && config.argsIgnorePattern) {
                type = 'args';
                pattern = config.argsIgnorePattern.toString();
            } else if (defType !== 'Parameter' && config.varsIgnorePattern) {
                type = 'vars';
                pattern = config.varsIgnorePattern.toString();
            }

            const additional = type ? `. Allowed unused ${type} must match ${pattern}` : '';

            return {
                varName: unusedVar.name,
                action: 'defined',
                additional,
            };
        }

        /**
         * Generate the warning message about the variable being
         * assigned and unused, including the ignore pattern if configured.
         * @param unusedVar eslint-scope variable object.
         * @returns The message data to be used with this unused variable.
         */
        function getAssignedMessageData(unusedVar: Variable) {
            const def = unusedVar.defs[0];
            let additional = '';

            if (
                config.destructuredArrayIgnorePattern
                && def
                && def.name.parent.type === 'ArrayPattern'
            ) {
                additional = `. Allowed unused elements of array destructuring patterns must match ${config.destructuredArrayIgnorePattern.toString()}`;
            } else if (config.varsIgnorePattern) {
                additional = `. Allowed unused vars must match ${config.varsIgnorePattern.toString()}`;
            }

            return {
                varName: unusedVar.name,
                action: 'assigned a value',
                additional,
            };
        }

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

        /**
         * Determines if a given variable is being exported from a module.
         * @param variable eslint-scope variable object.
         * @returns True if the variable is exported, false if not.
         */
        function isExported(variable: Variable) {
            const definition = variable.defs[0];

            if (definition) {
                let { node } = definition;

                if (node.type === 'VariableDeclarator') {
                    node = node.parent;
                } else if (definition.type === 'Parameter') {
                    return false;
                }

                return node.parent.type.indexOf('Export') === 0;
            }
            return false;
        }

        /**
         * Checks whether a node is a sibling of the rest property or not.
         * @param node a node to check
         * @returns True if the node is a sibling of the rest property, otherwise false.
         */
        function hasRestSibling(node: Node) {
            return (
                node.type === 'Property'
                && node.parent.type === 'ObjectPattern'
                && REST_PROPERTY_TYPE.test(
                    node!.parent.properties[node.parent.properties.length - 1]!.type,
                )
            );
        }

        /**
         * Determines if a variable has a sibling rest property
         * @param variable eslint-scope variable object.
         * @returns True if the variable is exported, false if not.
         */
        function hasRestSpreadSibling(variable: Variable) {
            if (config.ignoreRestSiblings) {
                const hasRestSiblingDefinition = variable.defs.some((def) => hasRestSibling(def.name.parent));
                const hasRestReference = variable.references.some((ref) => hasRestSibling(ref.identifier.parent));

                return hasRestSiblingDefinition || hasRestReference;
            }

            return false;
        }

        /**
         * Determines if a reference is a read operation.
         * @param ref An eslint-scope Reference
         * @returns whether the given reference represents a read operation
         */
        function isReadRef(ref: Reference) {
            return ref.isRead();
        }

        /**
         * Determine if an identifier is referencing an enclosing function name.
         * @param ref The reference to check.
         * @param nodes The candidate function nodes.
         * @returns True if it's a self-reference, false if not.
         */
        function isSelfReference(ref: Reference, nodes: Node[]) {
            let scope: Scope | null = ref.from;

            while (scope) {
                if (nodes.includes(scope.block)) {
                    return true;
                }

                scope = scope.upper;
            }

            return false;
        }

        /**
         * Gets a list of function definitions for a specified variable.
         * @param variable eslint-scope variable object.
         * @returns Function nodes.
         */
        function getFunctionDefinitions(variable: Variable) {
            const functionDefinitions: (
                | Node<'FunctionExpression'>
                | Node<'FunctionDeclaration'>
                | Node<'ArrowFunctionExpression'>
                | Node<'FunctionExpression'>
            )[] = [];

            variable.defs.forEach((def) => {
                const { type, node } = def;

                // FunctionDeclarations
                if (type === 'FunctionName') {
                    functionDefinitions.push(node);
                }

                // FunctionExpressions
                if (
                    type === 'Variable'
                    && node.init
                    && (node.init.type === 'FunctionExpression'
                        || node.init.type === 'ArrowFunctionExpression')
                ) {
                    functionDefinitions.push(node.init);
                }
            });
            return functionDefinitions;
        }

        /**
         * Checks the position of given nodes.
         * @param inner A node which is expected as inside.
         * @param outer A node which is expected as outside.
         * @returns `true` if the `inner` node exists in the `outer` node.
         */
        function isInside(inner: Node, outer: Node) {
            return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
        }

        /**
         * Checks whether a given node is unused expression or not.
         * @param node The node itself
         * @returns The node is an unused expression.
         */
        function isUnusedExpression(node: Node) {
            const { parent } = node;

            if (parent.type === 'ExpressionStatement') {
                return true;
            }

            if (parent.type === 'SequenceExpression') {
                const isLastExpression = parent.expressions[parent.expressions.length - 1] === node;

                if (!isLastExpression) {
                    return true;
                }
                return isUnusedExpression(parent);
            }

            return false;
        }

        /**
         * If a given reference is left-hand side of an assignment, this gets
         * the right-hand side node of the assignment.
         *
         * In the following cases, this returns null.
         *
         * - The reference is not the LHS of an assignment expression.
         * - The reference is inside of a loop.
         * - The reference is inside of a function scope which is different from
         *   the declaration.
         * @param ref A reference to check.
         * @param prevRhsNode The previous RHS node.
         * @returns The RHS node or null.
         */
        function getRhsNode(ref: Reference, prevRhsNode: Node) {
            const id = ref.identifier;
            const { parent } = id;
            const refScope = ref.from.variableScope;
            const varScope = ref.resolved!.scope.variableScope;
            const canBeUsedLater = refScope !== varScope || astUtils.isInLoop(id);

            /**
             * Inherits the previous node if this reference is in the node.
             * This is for `a = a + a`-like code.
             */
            if (prevRhsNode && isInside(id, prevRhsNode)) {
                return prevRhsNode;
            }

            if (
                parent.type === 'AssignmentExpression'
                && isUnusedExpression(parent)
                && id === parent.left
                && !canBeUsedLater
            ) {
                return parent.right;
            }
            return null;
        }

        /**
         * Checks whether a given function node is stored to somewhere or not.
         * If the function node is stored, the function can be used later.
         * @param funcNode A function node to check.
         * @param rhsNode The RHS node of the previous assignment.
         * @returns `true` if under the following conditions:
         *      - the funcNode is assigned to a variable.
         *      - the funcNode is bound as an argument of a function call.
         *      - the function is bound to a property and the object satisfies above conditions.
         */
        function isStorableFunction(
            funcNode: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
            rhsNode: Node,
        ) {
            let node: Node = funcNode;
            let { parent } = funcNode;

            while (parent && isInside(parent, rhsNode)) {
                switch (parent.type) {
                    case 'SequenceExpression':
                        if (parent.expressions[parent.expressions.length - 1] !== node) {
                            return false;
                        }
                        break;

                    case 'CallExpression':
                    case 'NewExpression':
                        return parent.callee !== node;

                    case 'AssignmentExpression':
                    case 'TaggedTemplateExpression':
                    case 'YieldExpression':
                        return true;

                    default:
                        if (STATEMENT_TYPE.test(parent.type)) {
                            /**
                             * If it encountered statements, this is a complex pattern.
                             * Since analyzing complex patterns is hard, this returns `true` to avoid false
                             * positive.
                             */
                            return true;
                        }
                }

                node = parent;
                parent = parent.parent;
            }

            return false;
        }

        /**
         * Checks whether a given Identifier node exists inside of a function node which can be used later.
         *
         * "can be used later" means:
         * - the function is assigned to a variable.
         * - the function is bound to a property and the object can be used later.
         * - the function is bound as an argument of a function call.
         *
         * If a reference exists in a function which can be used later, the reference is read when the function is
         * called.
         * @param id An Identifier node to check.
         * @param rhsNode The RHS node of the previous assignment.
         * @returns `true` if the `id` node exists inside of a function node which can be used later.
         */
        function isInsideOfStorableFunction(id: Node<'Identifier'>, rhsNode: Node) {
            const funcNode = astUtils.getUpperFunction(id);

            return (
                funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode)
            );
        }

        /**
         * Checks whether a given reference is a read to update itself or not.
         * @param ref A reference to check.
         * @param rhsNode The RHS node of the previous assignment.
         * @returns The reference is a read to update itself.
         */
        function isReadForItself(ref: Reference, rhsNode: Node) {
            const id = ref.identifier;
            const { parent } = id;

            return (
                ref.isRead()
                // self update. e.g. `a += 1`, `a++`
                && ((parent.type === 'AssignmentExpression'
                    && parent.left === id
                    && isUnusedExpression(parent)
                    && !astUtils.isLogicalAssignmentOperator(parent.operator))
                    || (parent.type === 'UpdateExpression' && isUnusedExpression(parent))
                    // in RHS of an assignment for itself. e.g. `a = a + 1`
                    || (rhsNode
                        && isInside(id, rhsNode)
                        && !isInsideOfStorableFunction(id, rhsNode)))
            );
        }

        /**
         * Determine if an identifier is used either in for-in or for-of loops.
         * @param ref The reference to check.
         * @returns whether reference is used in the for-in loops
         */
        function isForInOfRef(ref: Reference) {
            let target: Node | undefined = ref.identifier.parent;

            // "for (var ...) { return; }"
            if (target.type === 'VariableDeclarator') {
                target = target.parent.parent;
            }

            if (target.type !== 'ForInStatement' && target.type !== 'ForOfStatement') {
                return false;
            }

            // "for (...) { return; }"
            if (target.body.type === 'BlockStatement') {
                [target] = target.body.body;

                // "for (...) return;"
            } else {
                target = target.body;
            }

            // For empty loop body
            if (!target) {
                return false;
            }

            return target.type === 'ReturnStatement';
        }

        /**
         * Determines if the variable is used.
         * @param variable The variable to check.
         * @returns True if the variable is used
         */
        function isUsedVariable(variable: Variable) {
            const functionNodes = getFunctionDefinitions(variable);
            const isFunctionDefinition = functionNodes.length > 0;
            let rhsNode: Node | null = null;

            return variable.references.some((ref) => {
                if (isForInOfRef(ref)) {
                    return true;
                }

                const forItself = isReadForItself(ref, rhsNode!);

                rhsNode = getRhsNode(ref, rhsNode!);

                return (
                    isReadRef(ref)
                    && !forItself
                    && !(isFunctionDefinition && isSelfReference(ref, functionNodes))
                );
            });
        }

        /**
         * Checks whether the given variable is after the last used parameter.
         * @param variable The variable to check.
         * @returns `true` if the variable is defined after the last
         * used parameter.
         */
        function isAfterLastUsedArg(variable: Variable) {
            const def = variable.defs[0];
            const params = sourceCode.getDeclaredVariables(def!.node);
            const posteriorParams = params.slice(params.indexOf(variable) + 1);

            // If any used parameters occur after this parameter, do not report.
            return !posteriorParams.some((v) => v.references.length > 0 || v.eslintUsed);
        }

        /**
         * Gets an array of variables without read references.
         * @param scope an eslint-scope Scope object.
         * @param unusedVars an array that saving result.
         * @returns unused variables of the scope and descendant scopes.
         */
        function collectUnusedVariables(scope: Scope, unusedVars: Variable[]) {
            const { variables } = scope;
            const { childScopes } = scope;
            let i;
            let l;

            if (scope.type !== 'global' || config.vars === 'all') {
                variables.forEach((variable) => {
                    // skip a variable of class itself name in the class scope
                    if (scope.type === 'class' && scope.block.id === variable!.identifiers[0]) {
                        return;
                    }

                    // skip function expression names and variables marked with markVariableAsUsed()
                    if (scope.functionExpressionScope || variable!.eslintUsed) {
                        return;
                    }

                    // skip implicit "arguments" variable
                    if (
                        scope.type === 'function'
                        && variable!.name === 'arguments'
                        && variable!.identifiers.length === 0
                    ) {
                        return;
                    }

                    // explicit global variables don't have definitions.
                    const def = variable!.defs[0];

                    if (def) {
                        const { type } = def;
                        const refUsedInArrayPatterns = variable!.references.some(
                            (ref) => ref.identifier.parent.type === 'ArrayPattern',
                        );

                        // skip elements of array destructuring patterns
                        if (
                            (def.name.parent.type === 'ArrayPattern'
                                || refUsedInArrayPatterns)
                            && config.destructuredArrayIgnorePattern
                            && config.destructuredArrayIgnorePattern.test(def.name.name)
                        ) {
                            return;
                        }

                        // skip catch variables
                        if (type === 'CatchClause') {
                            if (config.caughtErrors === 'none') {
                                return;
                            }

                            // skip ignored parameters
                            if (
                                config.caughtErrorsIgnorePattern
                                && config.caughtErrorsIgnorePattern.test(def.name.name)
                            ) {
                                return;
                            }
                        }

                        if (type === 'Parameter') {
                            // skip any setter argument
                            if (
                                (def.node.parent.type === 'Property'
                                    || def.node.parent.type === 'MethodDefinition')
                                && def.node.parent.kind === 'set'
                            ) {
                                return;
                            }

                            // if "args" option is "none", skip any parameter
                            if (config.args === 'none') {
                                return;
                            }

                            // skip ignored parameters
                            if (
                                config.argsIgnorePattern
                                && config.argsIgnorePattern.test(def.name.name)
                            ) {
                                return;
                            }

                            // if "args" option is "after-used", skip used variables
                            if (
                                config.args === 'after-used'
                                && astUtils.isFunction(def.name.parent)
                                && !isAfterLastUsedArg(variable!)
                            ) {
                                return;
                            }
                        } else if (
                            config.varsIgnorePattern
                            && config.varsIgnorePattern.test(def.name.name)
                        ) {
                            // skip ignored variables
                            return;
                        }
                    }

                    if (
                        !isUsedVariable(variable!)
                        && !isExported(variable!)
                        && !hasRestSpreadSibling(variable!)
                    ) {
                        unusedVars.push(variable!);
                    }
                });
            }

            for (i = 0, l = childScopes.length; i < l; i += 1) {
                collectUnusedVariables(childScopes[i]!, unusedVars);
            }

            return unusedVars;
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            'Program:exit': function onProgramExit(programNode) {
                const unusedVars = collectUnusedVariables(sourceCode.getScope(programNode), []);

                for (let i = 0, l = unusedVars.length; i < l; i += 1) {
                    const unusedVar = unusedVars[i];

                    // Report the first declaration.
                    if (unusedVar!.defs.length > 0) {
                        // report last write reference, https://github.com/eslint/eslint/issues/14324
                        const writeReferences = unusedVar!.references.filter(
                            (ref) => ref.isWrite()
                                && ref.from.variableScope === unusedVar!.scope.variableScope,
                        );

                        let referenceToReport;

                        if (writeReferences.length > 0) {
                            referenceToReport = writeReferences[writeReferences.length - 1];
                        }

                        context.report({
                            node: (referenceToReport
                                ? referenceToReport.identifier
                                : unusedVar!.identifiers[0])!,
                            messageId: 'unusedVar',
                            data: unusedVar!.references.some((ref) => ref.isWrite())
                                ? getAssignedMessageData(unusedVar!)
                                : getDefinedMessageData(unusedVar!),
                        });

                        // If there are no regular declaration, report the first `/*globals*/` comment directive.
                    } else if (unusedVar!.eslintExplicitGlobalComments) {
                        const directiveComment = unusedVar!.eslintExplicitGlobalComments[0];

                        context.report({
                            node: programNode,
                            loc: astUtils.getNameLocationInGlobalDirectiveComment(
                                sourceCode,
                                directiveComment!,
                                unusedVar!.name,
                            ),
                            messageId: 'unusedVar',
                            data: getDefinedMessageData(unusedVar!),
                        });
                    }
                }
            },
        };
    },
};

export default rule;
