import type { TSESTree } from '@typescript-eslint/types';

export type BabelNode =
    | (Omit<
        TSESTree.CallExpression,
        'type'
    > & { type: 'OptionalCallExpression' })
    | (Omit<
        TSESTree.MethodDefinition,
        'type'
    > & { type: 'ClassMethod' })
    | (Omit<
        TSESTree.PropertyDefinition,
        'type'
    > & { type: 'ClassProperty' | 'ObjectProperty' })
    | (Omit<
        TSESTree.MemberExpression,
        'type'
    > & { type: 'OptionalMemberExpression' })
    | (Omit<
        TSESTree.ImportExpression,
        'type'
    > & { type: 'Import' })
    | {
        type: 'ObjectMethod';
        computed: boolean;
        key: TSESTree.Node | BabelNode;
        arguments: (TSESTree.Node | BabelNode)[];
    };
export type ESTreeOrTypeScriptNode =
    | import('estree').Node
    | TSESTree.Node
    | BabelNode;

/**
 * Checks if a node is a promise but has no resolve value or an empty value.
 * An `undefined` resolve does not count.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
const isNewPromiseExpression = (
    node: ESTreeOrTypeScriptNode | undefined | null,
): boolean | undefined | null => (
    node
        && node.type === 'NewExpression'
        && node.callee.type === 'Identifier'
        && node.callee.name === 'Promise'
);

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
const isVoidPromise = (
    node: ESTreeOrTypeScriptNode | null | undefined,
): boolean => (
    (
        node as TSESTree.TSTypeReference
    )?.typeArguments?.params?.[0]?.type === 'TSVoidKeyword'

         || (
             node as TSESTree.TSTypeReference & {
                 typeParameters?: TSESTree.TSTypeParameterInstantiation;
             }
         )?.typeParameters?.params?.[0]?.type === 'TSVoidKeyword'
);

const undefinedKeywords = new Set([
    'TSNeverKeyword',
    'TSUndefinedKeyword',
    'TSVoidKeyword',
]);

/**
 * Checks if a node has a return statement. Void return does not count.
 * @param node The node to inspect.
 * @param [throwOnNullReturn] The throw on null return value.
 * @param [promFilter] The prom filter value.
 * @returns The result of this check.
 */

const hasReturnValue = (
    node: ESTreeOrTypeScriptNode | undefined | null,
    throwOnNullReturn?: boolean,
    promFilter?: PromiseFilter,
): boolean | undefined => {
    if (!node) {
        return false;
    }

    switch (node.type) {
        case 'ArrowFunctionExpression':
        case 'FunctionDeclaration':
        case 'FunctionExpression': {
            return (
                ('expression' in node
                    && node.expression
                    && (!isNewPromiseExpression(node.body)
                        || !isVoidPromise(node.body)))
                || hasReturnValue(node.body, throwOnNullReturn, promFilter)
            );
        }

        case 'BlockStatement': {
            return node.body.some((bodyNode) => (
                bodyNode.type !== 'FunctionDeclaration'
                    && hasReturnValue(bodyNode, throwOnNullReturn, promFilter)
            ));
        }

        case 'DoWhileStatement':
        case 'ForInStatement':
        case 'ForOfStatement':
        case 'ForStatement':
        case 'LabeledStatement':
        case 'WhileStatement':
        case 'WithStatement': {
            return hasReturnValue(node.body, throwOnNullReturn, promFilter);
        }

        case 'IfStatement': {
            return (
                hasReturnValue(
                    node.consequent,
                    throwOnNullReturn,
                    promFilter,
                )
                || hasReturnValue(node.alternate, throwOnNullReturn, promFilter)
            );
        }

        case 'MethodDefinition':
            return hasReturnValue(node.value, throwOnNullReturn, promFilter);
        case 'ReturnStatement': {
            // void return does not count.
            if (node.argument === null) {
                if (throwOnNullReturn) {
                    throw new Error('Null return');
                }

                return false;
            }

            if (promFilter && isNewPromiseExpression(node.argument)) {
                // Let caller decide how to filter, but this is, at the least,
                //   a return of sorts and truthy
                return promFilter(node.argument);
            }

            return true;
        }

        case 'SwitchStatement': {
            return node.cases.some(({ consequent }) => {
                const returnsValue = consequent.some((nde) => hasReturnValue(nde, throwOnNullReturn, promFilter));
                return returnsValue;
            });
        }

        case 'TryStatement': {
            return (
                hasReturnValue(node.block, throwOnNullReturn, promFilter)
                || hasReturnValue(
                    node.handler && node.handler.body,
                    throwOnNullReturn,
                    promFilter,
                )
                || hasReturnValue(node.finalizer, throwOnNullReturn, promFilter)
            );
        }

        case 'TSDeclareFunction':
        case 'TSFunctionType':
        case 'TSMethodSignature': {
            const type = node?.returnType?.typeAnnotation?.type;
            return type && !undefinedKeywords.has(type);
        }

        default: {
            return false;
        }
    }
};

/**
 * Checks if a node has a return statement. Void return does not count.
 * @param node The node to inspect.
 * @param promFilter The prom filter value.
 * @returns The result of this check.
 */

const allBrancheshaveReturnValues = (
    node: ESTreeOrTypeScriptNode | null | undefined,
    promFilter: PromiseFilter,
): undefined | boolean | ESTreeOrTypeScriptNode => {
    if (!node) {
        return false;
    }

    switch (node.type) {
        // case 'MethodDefinition':
        //   return allBrancheshaveReturnValues(node.value, promFilter);
        case 'ArrowFunctionExpression':
        case 'FunctionDeclaration':
        case 'FunctionExpression': {
            return (
                ('expression' in node
                    && node.expression
                    && (!isNewPromiseExpression(node.body)
                        || !isVoidPromise(node.body)))
                || allBrancheshaveReturnValues(node.body, promFilter)

                || (
                    node.body as TSESTree.BlockStatement
                ).body.some((nde) => nde.type === 'ReturnStatement')
            );
        }

        case 'BlockStatement': {
            const lastBodyNode = node.body.slice(-1)[0];
            return allBrancheshaveReturnValues(lastBodyNode, promFilter);
        }

        case 'DoWhileStatement':
        case 'WhileStatement':
            if (

                (
                    node.test as TSESTree.Literal
                ).value === true
            ) {
                // If this is an infinite loop, we assume only one branch
                //   is needed to provide a return
                return hasReturnValue(node.body, false, promFilter);
            }

        // Fallthrough
        case 'ForStatement':
            if (node.test === null) {
                // If this is an infinite loop, we assume only one branch
                //   is needed to provide a return
                return hasReturnValue(node.body, false, promFilter);
            }
            return allBrancheshaveReturnValues(node.body, promFilter);

        case 'ForInStatement':
        case 'ForOfStatement':
        case 'LabeledStatement':
        case 'WithStatement': {
            return allBrancheshaveReturnValues(node.body, promFilter);
        }

        case 'IfStatement': {
            return (
                allBrancheshaveReturnValues(node.consequent, promFilter)
                && allBrancheshaveReturnValues(node.alternate, promFilter)
            );
        }

        case 'ReturnStatement': {
            // void return does not count.
            if (node.argument === null) {
                return false;
            }

            if (promFilter && isNewPromiseExpression(node.argument)) {
                // Let caller decide how to filter, but this is, at the least,
                //   a return of sorts and truthy
                return promFilter(node.argument);
            }

            return true;
        }

        case 'SwitchStatement': {
            return (
                node as TSESTree.SwitchStatement
            ).cases.every((someCase) => !someCase.consequent.some((consNode) => (
                consNode.type === 'BreakStatement'
                        || (consNode.type === 'ReturnStatement'
                            && consNode.argument === null)
            )));
        }

        case 'ThrowStatement': {
            return true;
        }

        case 'TryStatement': {
            // If `finally` returns, all return
            return (
                (node.finalizer
                    && allBrancheshaveReturnValues(node.finalizer, promFilter))
                // Return in `try`/`catch` may still occur despite `finally`
                || (allBrancheshaveReturnValues(node.block, promFilter)
                    && (!node.handler
                        || allBrancheshaveReturnValues(
                            node.handler && node.handler.body,
                            promFilter,
                        ))
                    && (!node.finalizer
                        || (() => {
                            try {
                                hasReturnValue(
                                    node.finalizer,
                                    true,
                                    promFilter,
                                );
                            } catch (error) {
                                if ((error as Error)
                                    .message === 'Null return'
                                ) {
                                    return false;
                                }

                                throw error;
                            }

                            // As long as not an explicit empty return, then return true
                            return true;
                        })()))
            );
        }

        case 'TSDeclareFunction':
        case 'TSFunctionType':
        case 'TSMethodSignature': {
            const type = node?.returnType?.typeAnnotation?.type;
            return type && !undefinedKeywords.has(type);
        }

        default: {
            return false;
        }
    }
};

export type PromiseFilter = (
    node: ESTreeOrTypeScriptNode | undefined,
) => boolean;

/**
 * Avoids further checking child nodes if a nested function shadows the
 * resolver, but otherwise, if name is used (by call or passed in as an
 * argument to another function), will be considered as non-empty.
 *
 * This could check for redeclaration of the resolver, but as such is
 * unlikely, we avoid the performance cost of checking everywhere for
 * (re)declarations or assignments.
 * @param node The node to inspect.
 * @param resolverName The resolver name value.
 * @returns The result of this check.
 */

const hasNonEmptyResolverCall = (
    node:
        | TSESTree.Node
        | BabelNode
        | null
        | undefined,
    resolverName: string,
): boolean => {
    if (!node) {
        return false;
    }

    // Arrow function without block
    switch (node.type) {
        case 'ArrayExpression':
        case 'ArrayPattern':
            return node.elements.some((element) => hasNonEmptyResolverCall(element, resolverName));
        case 'ArrowFunctionExpression':
        case 'FunctionDeclaration':
        case 'FunctionExpression': {
            // Shadowing
            if ((
                node
                    .params[0] as TSESTree.Identifier
            )?.name === resolverName
            ) {
                return false;
            }

            return hasNonEmptyResolverCall(node.body, resolverName);
        }

        case 'AssignmentExpression':
        case 'BinaryExpression':
        case 'LogicalExpression': {
            return (
                hasNonEmptyResolverCall(node.left, resolverName)
                || hasNonEmptyResolverCall(node.right, resolverName)
            );
        }

        case 'AssignmentPattern':
            return hasNonEmptyResolverCall(node.right, resolverName);
        case 'AwaitExpression':
        case 'SpreadElement':
        case 'UnaryExpression':
        case 'YieldExpression':
            return hasNonEmptyResolverCall(node.argument, resolverName);
        case 'BlockStatement':
        case 'ClassBody':
            return node.body.some((bodyNode) => hasNonEmptyResolverCall(bodyNode, resolverName));

        case 'CallExpression':
        case 'OptionalCallExpression':
            return (((
                node.callee as TSESTree.Identifier
            ).name === resolverName
                    // Implicit or explicit undefined
                    && (node.arguments.length > 1
                        || node.arguments[0] !== undefined))
                // Being passed to another function may invoke the resolver.
                || node.arguments.some((nde) => (
                    (nde.type === 'Identifier'
                            && nde.name === resolverName)
                        // Handle nested items
                        || hasNonEmptyResolverCall(nde, resolverName)
                ))
            );

        case 'ChainExpression':
        case 'Decorator':
        case 'ExpressionStatement':
            return hasNonEmptyResolverCall(node.expression, resolverName);

        case 'ClassDeclaration':
        case 'ClassExpression':
            return hasNonEmptyResolverCall(node.body, resolverName);

        case 'ClassMethod':
        case 'MethodDefinition':
            return (
                (node.decorators
                    && node.decorators.some((decorator) => hasNonEmptyResolverCall(decorator, resolverName)))
                || (node.computed
                    && hasNonEmptyResolverCall(node.key, resolverName))
                || hasNonEmptyResolverCall(node.value, resolverName)
            );

        case 'ClassProperty':
        case 'ObjectProperty':
        case 'Property':
        case 'PropertyDefinition':
            return (
                (node.computed
                    && hasNonEmptyResolverCall(node.key, resolverName))
                || hasNonEmptyResolverCall(node.value, resolverName)
            );
        case 'ConditionalExpression':
        case 'IfStatement': {
            return (
                hasNonEmptyResolverCall(node.test, resolverName)
                || hasNonEmptyResolverCall(node.consequent, resolverName)
                || hasNonEmptyResolverCall(node.alternate, resolverName)
            );
        }

        case 'DoWhileStatement':
        case 'ForInStatement':
        case 'ForOfStatement':
        case 'ForStatement':
        case 'LabeledStatement':
        case 'WhileStatement':
        case 'WithStatement': {
            return hasNonEmptyResolverCall(node.body, resolverName);
        }

        case 'Import':
        case 'ImportExpression':
            return hasNonEmptyResolverCall(node.source, resolverName);
            // ?.

        case 'MemberExpression':
        case 'OptionalMemberExpression':
            return (
                hasNonEmptyResolverCall(node.object, resolverName)
                || hasNonEmptyResolverCall(node.property, resolverName)
            );
        case 'ObjectExpression':
        case 'ObjectPattern':
            return node.properties.some((property) => hasNonEmptyResolverCall(property, resolverName));

        case 'ObjectMethod':

            return (
                (node.computed
                    && hasNonEmptyResolverCall(node.key, resolverName))
                || node.arguments.some((nde) => hasNonEmptyResolverCall(nde, resolverName))
            );

        case 'ReturnStatement': {
            if (node.argument === null) {
                return false;
            }

            return hasNonEmptyResolverCall(node.argument, resolverName);
        }

        // Comma
        case 'SequenceExpression':
        case 'TemplateLiteral':
            return node.expressions.some((subExpression) => hasNonEmptyResolverCall(subExpression, resolverName));

        case 'SwitchStatement': {
            return node.cases.some(({ consequent }) => {
                const callsResolver = consequent.some((nde) => hasNonEmptyResolverCall(nde, resolverName));
                return callsResolver;
            });
        }

        case 'TaggedTemplateExpression':
            return hasNonEmptyResolverCall(node.quasi, resolverName);

        case 'TryStatement': {
            return (
                hasNonEmptyResolverCall(node.block, resolverName)
                || hasNonEmptyResolverCall(
                    node.handler && node.handler.body,
                    resolverName,
                )
                || hasNonEmptyResolverCall(node.finalizer, resolverName)
            );
        }

        case 'VariableDeclaration': {
            return node.declarations.some((nde) => hasNonEmptyResolverCall(nde, resolverName));
        }

        case 'VariableDeclarator': {
            return (
                hasNonEmptyResolverCall(node.id, resolverName)
                || hasNonEmptyResolverCall(node.init, resolverName)
            );
        }

        // Literal components and export declarations do not call the resolver.
        default:
            return false;
    }
};

/**
 * Checks if a Promise executor has no resolve value or an empty value.
 * An `undefined` resolve does not count.
 * @param node The node to inspect.
 * @param anyPromiseAsReturn The any promise as return value.
 * @param [allBranches] The all branches value.
 * @returns The result of this check.
 */
const hasValueOrExecutorHasNonEmptyResolveValue = (
    node: ESTreeOrTypeScriptNode,
    anyPromiseAsReturn: boolean,
    allBranches?: boolean,
): boolean => {
    const hasReturnMethod = allBranches
        ? (
            nde: ESTreeOrTypeScriptNode,
            promiseFilter: PromiseFilter,
        ): boolean => {
            let hasReturn;
            try {
                hasReturn = hasReturnValue(nde, true, promiseFilter);
            } catch (error) {
                if ((error as Error).message
                      === 'Null return'
                ) {
                    return false;
                }

                throw error;
            }

            // `hasReturn` check needed since `throw` treated as valid return by
            //   `allBrancheshaveReturnValues`
            return Boolean(
                hasReturn && allBrancheshaveReturnValues(nde, promiseFilter),
            );
        }
        : (
            nde: ESTreeOrTypeScriptNode,
            promiseFilter: PromiseFilter,
        ): boolean => Boolean(hasReturnValue(nde, false, promiseFilter));

    return hasReturnMethod(node, (prom) => {
        if (anyPromiseAsReturn) {
            return true;
        }

        if (isVoidPromise(prom)) {
            return false;
        }

        const { body, params } = ((
            prom as TSESTree.NewExpression
        ).arguments[0] as
                | TSESTree.FunctionExpression
                | TSESTree.ArrowFunctionExpression)
            || {};

        if (!params?.length) {
            return false;
        }

        const { name: resolverName } = params[0] as TSESTree.Identifier;

        return hasNonEmptyResolverCall(body, resolverName);
    });
};

export { hasReturnValue, hasValueOrExecutorHasNonEmptyResolveValue };
