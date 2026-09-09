/**
 * @file Shared syntax predicates used by the guideline rules.
 */
import type { ESTree } from '@oxlint/plugins';

/**
 * Read a statically spelled property name without evaluating user code.
 * @param node - Member access to inspect.
 * @returns Known property name or undefined for computed expressions.
 */
export function memberName(node: ESTree.MemberExpression): string | undefined {
    if (!node.computed && node.property.type === 'Identifier') {
        return node.property.name;
    }
    if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') {
        return node.property.value;
    }
    return undefined;
}

/**
 * Determine whether a write directly addresses a prototype or its properties.
 * @param node - Assignment or update target.
 * @returns Whether a statically spelled prototype occurs in the member chain.
 */
export function writesPrototype(node: ESTree.Node): boolean {
    if (node.type !== 'MemberExpression') {
        return false;
    }
    return memberName(node) === 'prototype' || writesPrototype(node.object);
}

/**
 * Check enum identifier casing, allowing leading acronym groups.
 * @param name - Enum declaration or member name.
 * @returns Whether the name has PascalCase form rather than constant casing.
 */
export function isPascalCase(name: string): boolean {
    return /^[A-Z][A-Za-z0-9]*$/u.test(name) && (name.length === 1 || /[a-z]/u.test(name));
}

/**
 * Determine whether a mutation is evaluated while resolving a default value.
 * @param node - Assignment or update expression.
 * @returns Whether the mutation occurs in an immediately evaluated default.
 */
export function isDefaultMutation(node: ESTree.Node): boolean {
    let child = node;
    let { parent } = node;
    while (parent) {
        if (parent.type === 'AssignmentPattern') {
            return parent.right === child;
        }
        if (['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(parent.type)) {
            return false;
        }
        child = parent;
        parent = parent.parent;
    }
    return false;
}
