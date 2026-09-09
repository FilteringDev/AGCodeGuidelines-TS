/**
 * @file Rule to flag updates of imported bindings.
 * @author Toru Nagashima <https://github.com/mysticatea>
 */
import dependency0 from '../../compat/eslint-utils';
import dependency1 from './utils/ast-utils';
import type { LegacyRule, Node, Scope } from '../../../types';

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const { findVariable } = dependency0;
const astUtils = dependency1;

const WellKnownMutationFunctions = {
    Object: /^(?:assign|definePropert(?:y|ies)|freeze|setPrototypeOf)$/u,
    Reflect: /^(?:(?:define|delete)Property|set(?:PrototypeOf)?)$/u,
};

/**
 * Check if a given node is LHS of an assignment node.
 * @param node The node to check.
 * @returns `true` if the node is LHS.
 */
function isAssignmentLeft(node: Node<'MemberExpression'>) {
    const { parent } = node;

    return (
        (parent.type === 'AssignmentExpression' && parent.left === node)
        // Destructuring assignments
        || parent.type === 'ArrayPattern'
        || (parent.type === 'Property'
            && parent.value === node
            && parent.parent.type === 'ObjectPattern')
        || parent.type === 'RestElement'
        || (parent.type === 'AssignmentPattern' && parent.left === node)
    );
}

/**
 * Check if a given node is the operand of mutation unary operator.
 * @param node The node to check.
 * @returns `true` if the node is the operand of mutation unary operator.
 */
function isOperandOfMutationUnaryOperator(node: Node<'MemberExpression'>) {
    const argumentNode = node.parent.type === 'ChainExpression' ? node.parent : node;
    const { parent } = argumentNode;

    return (
        (parent.type === 'UpdateExpression' && parent.argument === argumentNode)
        || (parent.type === 'UnaryExpression'
            && parent.operator === 'delete'
            && parent.argument === argumentNode)
    );
}

/**
 * Check if a given node is the iteration variable of `for-in`/`for-of` syntax.
 * @param node The node to check.
 * @returns `true` if the node is the iteration variable.
 */
function isIterationVariable(node: Node<'MemberExpression'>) {
    const { parent } = node;

    return (
        (parent.type === 'ForInStatement' && parent.left === node)
        || (parent.type === 'ForOfStatement' && parent.left === node)
    );
}

/**
 * Check if a given node is at the first argument of a well-known mutation function.
 * - `Object.assign`
 * - `Object.defineProperty`
 * - `Object.defineProperties`
 * - `Object.freeze`
 * - `Object.setPrototypeOf`
 * - `Reflect.defineProperty`
 * - `Reflect.deleteProperty`
 * - `Reflect.set`
 * - `Reflect.setPrototypeOf`
 * @param node The node to check.
 * @param scope A `escope.Scope` object to find variable (whichever).
 * @returns `true` if the node is at the first argument of a well-known mutation function.
 */
function isArgumentOfWellKnownMutationFunction(node: Node<'Identifier'>, scope: Scope) {
    const { parent } = node;

    if (parent.type !== 'CallExpression' || parent.arguments[0] !== node) {
        return false;
    }
    const callee = astUtils.skipChainExpression(parent.callee);

    if (
        !astUtils.isSpecificMemberAccess(callee, 'Object', WellKnownMutationFunctions.Object)
        && !astUtils.isSpecificMemberAccess(callee, 'Reflect', WellKnownMutationFunctions.Reflect)
    ) {
        return false;
    }
    const variable = findVariable(scope, callee.object);

    return variable !== null && variable.scope.type === 'global';
}

/**
 * Check if the identifier node is placed at to update members.
 * @param id The Identifier node to check.
 * @param scope A `escope.Scope` object to find variable (whichever).
 * @returns `true` if the member of `id` was updated.
 */
function isMemberWrite(id: Node<'Identifier'>, scope: Scope) {
    const { parent } = id;

    return (
        (parent.type === 'MemberExpression'
            && parent.object === id
            && (isAssignmentLeft(parent)
                || isOperandOfMutationUnaryOperator(parent)
                || isIterationVariable(parent)))
        || isArgumentOfWellKnownMutationFunction(id, scope)
    );
}

/**
 * Get the mutation node.
 * @param id The Identifier node to get.
 * @returns The mutation node.
 */
function getWriteNode(id: Node<'Identifier'>) {
    let node = id.parent;

    while (
        node
        && node.type !== 'AssignmentExpression'
        && node.type !== 'UpdateExpression'
        && node.type !== 'UnaryExpression'
        && node.type !== 'CallExpression'
        && node.type !== 'ForInStatement'
        && node.type !== 'ForOfStatement'
    ) {
        node = node.parent;
    }

    return node || id;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow assigning to imported bindings',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-import-assign',
        },

        schema: [],

        messages: {
            readonly: "'{{name}}' is read-only.",
            readonlyMember: "The members of '{{name}}' are read-only.",
        },
    },

    create(context) {
        const { sourceCode } = context;

        return {
            ImportDeclaration(node: Node<'ImportDeclaration'>) {
                const scope = sourceCode.getScope(node);

                sourceCode.getDeclaredVariables(node).forEach((variable) => {
                    const shouldCheckMembers = variable.defs.some(
                        (d) => d.node.type === 'ImportNamespaceSpecifier',
                    );
                    let prevIdNode: Node<'Identifier'> | null = null;

                    variable.references.forEach((reference) => {
                        const idNode = reference.identifier;

                        /**
                         * AssignmentPattern (e.g. `[a = 0] = b`) makes two write
                         * references for the same identifier. This should skip
                         * the one of the two in order to prevent redundant reports.
                         */
                        if (idNode === prevIdNode) {
                            return;
                        }
                        prevIdNode = idNode;

                        if (reference.isWrite()) {
                            context.report({
                                node: getWriteNode(idNode),
                                messageId: 'readonly',
                                data: { name: idNode.name },
                            });
                        } else if (shouldCheckMembers && isMemberWrite(idNode, scope)) {
                            context.report({
                                node: getWriteNode(idNode),
                                messageId: 'readonlyMember',
                                data: { name: idNode.name },
                            });
                        }
                    });
                });
            },
        };
    },
};

export default rule;
