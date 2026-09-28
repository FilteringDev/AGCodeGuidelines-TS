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

/**
 * Remove TypeScript-only wrappers that do not change a runtime value.
 * @param node - Expression to inspect.
 * @returns The wrapped runtime expression.
 */
export function unwrapTypeExpression(node: ESTree.Node): ESTree.Node {
    let current = node;
    while (
        current.type === 'TSAsExpression'
        || current.type === 'TSSatisfiesExpression'
        || current.type === 'TSTypeAssertion'
        || current.type === 'TSNonNullExpression'
        || current.type === 'ParenthesizedExpression'
    ) {
        current = current.expression;
    }
    return current;
}

/**
 * Determine whether an expression is a string without runtime substitutions.
 * @param node - Operand to inspect.
 * @returns Whether the operand is a string literal or a template without expressions.
 */
export function isStaticString(node: ESTree.Node): boolean {
    return (node.type === 'Literal' && typeof node.value === 'string')
        || (node.type === 'TemplateLiteral' && node.expressions.length === 0);
}

/**
 * Flatten a chain of `+` operations into its operands in source order.
 * @param node - Expression at the top of the chain.
 * @returns Operands that are not themselves additions.
 */
export function concatenationOperands(node: ESTree.Node): ESTree.Node[] {
    if (node.type === 'BinaryExpression' && node.operator === '+') {
        return [...concatenationOperands(node.left), ...concatenationOperands(node.right)];
    }
    return [node];
}

/**
 * Determine whether a module-level initializer is a primitive constant value.
 * @param node - Declarator initializer.
 * @returns Whether the value is a string, number, bigint, or boolean literal.
 */
export function isPrimitiveConstant(node: ESTree.Node): boolean {
    const value = unwrapTypeExpression(node);
    if (value.type === 'Literal') {
        return 'bigint' in value || ['string', 'number', 'boolean'].includes(typeof value.value);
    }
    if (value.type === 'UnaryExpression' && ['-', '+'].includes(value.operator)) {
        return value.argument.type === 'Literal' && typeof value.argument.value === 'number';
    }
    return value.type === 'TemplateLiteral' && value.expressions.length === 0;
}

/**
 * Check the documented constant naming form.
 * @param name - Binding name.
 * @returns Whether the name is UPPER_SNAKE_CASE.
 */
export function isUpperSnakeCase(name: string): boolean {
    return /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u.test(name);
}

/**
 * Recognize comments that configure tools rather than describe code.
 * @param value - Comment text without delimiters.
 * @returns Whether the comment is a directive.
 */
export function isDirectiveComment(value: string): boolean {
    return value.startsWith('/')
        || /^\s*(?:eslint|oxlint|@ts-|global\s|globals\s|exported\s|istanbul\s|c8\s|v8\s|prettier-ignore|#(?:end)?region\b)/u
            .test(value);
}
