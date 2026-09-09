/**
 * @file Rule to disallow returning values from setters
 * @author Milos Djermanovic
 */
import dependency1 from '../../compat/eslint-utils';
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node, Scope } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;
const { findVariable } = dependency1;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Determines whether the given identifier node is a reference to a global variable.
 * @param node `Identifier` node to check.
 * @param scope Scope to which the node belongs.
 * @returns True if the identifier is a reference to a global variable.
 */
function isGlobalReference(node: Node<'Identifier'>, scope: Scope) {
    const variable = findVariable(scope, node);

    return variable !== null && variable.scope.type === 'global' && variable.defs.length === 0;
}

/**
 * Determines whether the given node is an argument of the specified global method call, at the given `index`
 * position.
 * E.g., for given `index === 1`, this function checks for `objectName.methodName(foo, node)`, where objectName is a
 * global variable.
 * @param node The node to check.
 * @param scope Scope to which the node belongs.
 * @param objectName Name of the global object.
 * @param methodName Name of the method.
 * @param index The given position.
 * @returns `true` if the node is argument at the given position.
 */
function isArgumentOfGlobalMethodCall(
    node: Node<'ObjectExpression'>,
    scope: Scope,
    objectName: string,
    methodName: string,
    index: number,
) {
    const callNode = node.parent;

    return (
        callNode.type === 'CallExpression'
        && callNode.arguments[index] === node
        && astUtils.isSpecificMemberAccess(callNode.callee, objectName, methodName)
        && isGlobalReference(astUtils.skipChainExpression(callNode.callee).object, scope)
    );
}

/**
 * Determines whether the given node is used as a property descriptor.
 * @param node The node to check.
 * @param scope Scope to which the node belongs.
 * @returns `true` if the node is a property descriptor.
 */
function isPropertyDescriptor(node: Node<'ObjectExpression'>, scope: Scope) {
    if (
        isArgumentOfGlobalMethodCall(node, scope, 'Object', 'defineProperty', 2)
        || isArgumentOfGlobalMethodCall(node, scope, 'Reflect', 'defineProperty', 2)
    ) {
        return true;
    }

    const { parent } = node;

    if (parent.type === 'Property' && parent.value === node) {
        const grandparent = parent.parent;

        if (
            grandparent.type === 'ObjectExpression'
            && (isArgumentOfGlobalMethodCall(grandparent, scope, 'Object', 'create', 1)
                || isArgumentOfGlobalMethodCall(
                    grandparent,
                    scope,
                    'Object',
                    'defineProperties',
                    1,
                ))
        ) {
            return true;
        }
    }

    return false;
}

/**
 * Determines whether the given function node is used as a setter function.
 * @param node The node to check.
 * @param scope Scope to which the node belongs.
 * @returns `true` if the node is a setter.
 */
function isSetter(
    node: Node<'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'>,
    scope: Scope,
) {
    const { parent } = node;

    if (
        (parent.type === 'Property' || parent.type === 'MethodDefinition')
        && parent.kind === 'set'
        && parent.value === node
    ) {
        // Setter in an object literal or in a class
        return true;
    }

    if (
        parent.type === 'Property'
        && parent.value === node
        && astUtils.getStaticPropertyName(parent) === 'set'
        && parent.parent.type === 'ObjectExpression'
        && isPropertyDescriptor(parent.parent, scope)
    ) {
        // Setter in a property descriptor
        return true;
    }

    return false;
}

/**
 * Finds function's outer scope.
 * @param scope Function's own scope.
 * @returns Function's outer scope.
 */
function getOuterScope(scope: Scope) {
    const { upper } = scope;

    if (upper!.type === 'function-expression-name') {
        return upper!.upper;
    }

    return upper;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow returning values from setters',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-setter-return',
        },

        schema: [],

        messages: {
            returnsValue: 'Setter cannot return a value.',
        },
    },

    create(context) {
        interface FuncInfoState {
            upper: FuncInfoState | null;
            isSetter: boolean;
        }
        let funcInfo: FuncInfoState | null = null;
        const { sourceCode } = context;

        /**
         * Creates and pushes to the stack a function info object for the given function node.
         * @param node The function node.
         */
        function enterFunction(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
        ) {
            const outerScope = getOuterScope(sourceCode.getScope(node));

            funcInfo = {
                upper: funcInfo,
                isSetter: isSetter(node, outerScope!),
            };
        }

        /**
         * Pops the current function info object from the stack.
         */
        function exitFunction() {
            funcInfo = funcInfo!.upper;
        }

        /**
         * Reports the given node.
         * @param node Node to report.
         */
        function report(node: Node) {
            context.report({ node, messageId: 'returnsValue' });
        }

        return {
            /**
             * Function declarations cannot be setters, but we still have to track them in the `funcInfo` stack to
             * avoid
             * false positives, because a ReturnStatement node can belong to a function declaration inside a setter.
             *
             * Note: A previously declared function can be referenced and actually used as a setter in a property
             * descriptor,
             * but that's out of scope for this rule.
             */
            FunctionDeclaration: enterFunction,
            FunctionExpression: enterFunction,
            ArrowFunctionExpression(node: Node<'ArrowFunctionExpression'>) {
                enterFunction(node);

                if (funcInfo!.isSetter && node.expression) {
                    // { set: foo => bar } property descriptor. Report implicit return 'bar' as the equivalent for a
                    // return statement.
                    report(node.body);
                }
            },

            'FunctionDeclaration:exit': exitFunction,
            'FunctionExpression:exit': exitFunction,
            'ArrowFunctionExpression:exit': exitFunction,

            ReturnStatement(node: Node<'ReturnStatement'>) {
                // Global returns (e.g., at the top level of a Node module) don't have `funcInfo`.
                if (funcInfo && funcInfo.isSetter && node.argument) {
                    report(node);
                }
            },
        };
    },
};

export default rule;
