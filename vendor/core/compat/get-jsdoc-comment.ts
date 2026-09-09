/** Extracted from ESLint 8.57.1 lib/source-code/source-code.js. MIT license in ../LICENSE. */
import type {
    Comment, Node, SourceCode, Token,
} from '../../types';

const isCommentToken = (token: Token): token is Comment => token.type === 'Block' || token.type === 'Line';
const looksLikeExport = (node: Node) => node && /^Export/u.test(node.type);
/**
 *
 * @param node The node to inspect.
 * @returns The attached JSDoc comment, or null.
 */
export default function getJSDocComment(this: SourceCode, node: Node): Comment | null {
    /**
     * Checks for the presence of a JSDoc comment for the given node and returns it.
     * @param astNode The AST node to get the comment for.
     * @returns The Block comment token containing the JSDoc comment
     *      for the given node or null if not found.
     */
    const findJSDocComment = (astNode: Node) => {
        const tokenBefore = this.getTokenBefore(astNode, { includeComments: true });

        if (
            tokenBefore
            && isCommentToken(tokenBefore)
            && tokenBefore.type === 'Block'
            && tokenBefore.value.charAt(0) === '*'
            && astNode.loc.start.line - tokenBefore.loc.end.line <= 1
        ) {
            return tokenBefore;
        }

        return null;
    };
    let { parent } = node;

    switch (node.type) {
        case 'ClassDeclaration':
        case 'FunctionDeclaration':
            return findJSDocComment(looksLikeExport(parent) ? parent : node);

        case 'ClassExpression':
            return findJSDocComment(parent.parent);

        case 'ArrowFunctionExpression':
        case 'FunctionExpression':
            if (parent.type !== 'CallExpression' && parent.type !== 'NewExpression') {
                while (
                    !this.getCommentsBefore(parent).length
                    && !/Function/u.test(parent.type)
                    && parent.type !== 'MethodDefinition'
                    && parent.type !== 'Property'
                ) {
                    parent = parent.parent;

                    if (!parent) {
                        break;
                    }
                }

                if (
                    parent
                    && parent.type !== 'FunctionDeclaration'
                    && parent.type !== 'Program'
                ) {
                    return findJSDocComment(parent);
                }
            }

            return findJSDocComment(node);

        // falls through
        default:
            return null;
    }
}
