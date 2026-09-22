/** @file Ancestor traversal and tag helpers for logger calls. */
import type { Node } from '../../types';

/**
 * Enclosing scope names for a node.
 */
export interface EnclosingNames {
    className: string | null;
    methodName: string | null;
    functionName: string | null;
}

/**
 * Traverse up the AST to find enclosing class, method, and function names.
 * @param node The AST node to start from.
 * @returns The enclosing names.
 */
export const getEnclosingNames = (
    node: Node & { parent?: Node },
): EnclosingNames => {
    let className: string | null = null;
    let methodName: string | null = null;
    let functionName: string | null = null;

    // Oxlint attaches parent pointers during traversal; fall back to any for traversal.
    let { parent }: { parent?: Node } = node;
    while (parent) {
        if (!className && parent.type === 'ClassDeclaration') {
            const { id } = parent as Node<'ClassDeclaration'>;
            if (id && id.type === 'Identifier') {
                className = (id as Node<'Identifier'>).name;
            }
        }
        if (!methodName && parent.type === 'MethodDefinition') {
            const { key } = parent as Node<'MethodDefinition'>;
            if (key && key.type === 'Identifier') {
                methodName = (key as Node<'Identifier'>).name;
            }
        }
        if (
            !functionName
            && (parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression')
        ) {
            const { id } = parent as Node<'FunctionDeclaration'>;
            if (id && id.type === 'Identifier') {
                functionName = (id as Node<'Identifier'>).name;
            }
        }
        parent = (parent as Node & { parent?: Node }).parent;
    }
    return {
        className,
        methodName,
        functionName,
    };
};

/**
 * Build the logger context tag from available names.
 * @param contextModuleName The logger context module name.
 * @param fileName The file name.
 * @param className The class name (or null).
 * @param methodName The method name (or null).
 * @returns The tag string.
 */
export const buildTag = (
    contextModuleName: string,
    fileName: string,
    className: string | null,
    methodName: string | null,
): string => {
    if (!className) {
        return `[${contextModuleName}.${fileName}]:`;
    }
    if (className && methodName) {
        return `[${contextModuleName}.${className}.${methodName}]:`;
    }
    if (className) {
        return `[${contextModuleName}.${className}]:`;
    }
    return `[${contextModuleName}]:`;
};

type TagArgument = Node & {
    value?: unknown;
    quasis?: { value: { raw: string } }[];
    operator?: string;
    left?: TagArgument;
};

/**
 * Check whether a call argument starts with the tag.
 * @param argument The AST argument node.
 * @param tag The tag string.
 * @returns Whether the argument starts with the tag.
 */
export const startsWithTag = (argument: TagArgument | undefined, tag: string): boolean => {
    if (!argument) {
        return false;
    }
    if (argument.type === 'Literal' && typeof argument.value === 'string') {
        return argument.value.startsWith(tag);
    }
    if (argument.type === 'TemplateLiteral' && (argument.quasis?.length ?? 0) > 0) {
        return argument.quasis![0]!.value.raw.startsWith(tag);
    }
    if (argument.type === 'BinaryExpression' && argument.operator === '+') {
        if (argument.left?.type === 'Literal' && typeof argument.left.value === 'string') {
            return argument.left.value.startsWith(tag);
        }
        if (argument.left?.type === 'TemplateLiteral' && (argument.left.quasis?.length ?? 0) > 0) {
            return argument.left.quasis![0]!.value.raw.startsWith(tag);
        }
    }
    return false;
};
