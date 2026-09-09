import type { Node } from '../../types';

/**
 * Find the token before the closing bracket.
 * @param node - The JSX element node.
 * @returns The token before the closing bracket.
 */
function getTokenBeforeClosingBracket(node: Node<'JSXOpeningElement' | 'JSXClosingElement'>) {
    const { attributes } = node;
    if (!attributes || attributes.length === 0) {
        return node.name;
    }
    return attributes[attributes.length - 1];
}

export default getTokenBeforeClosingBracket;
