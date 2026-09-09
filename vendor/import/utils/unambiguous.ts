import type { Node } from '../types';

const pattern = /(^|[;})])\s*(export|import)((\s+\w)|(\s*[{*=]))|import\(/m;
/**
 * detect possible imports/exports without a full parse.
 *
 * A negative test means that a file is definitely _not_ a module.
 * A positive test means it _could_ be.
 *
 * Not perfect, just a fast way to disqualify large non-ES6 modules and
 * avoid a parse.
 * @param content The content value.
 * @returns The result of this check.
 */
export const test = function isMaybeUnambiguousModule(content: string) {
    return pattern.test(content);
};

// future-/Babel-proof at the expense of being a little loose
const unambiguousNodeType = /^(?:(?:Exp|Imp)ort.*Declaration|TSExportAssignment)$/;

/**
 * Given an AST, return true if the AST unambiguously represents a module.
 * @param ast The ast value.
 * @returns The result of this check.
 */
export const isModule = function isUnambiguousModule(ast: Node<'Program'>) {
    return ast.body && ast.body.some((node: Node) => unambiguousNodeType.test(node.type));
};
