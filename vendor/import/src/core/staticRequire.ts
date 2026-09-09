import type { Node } from '../../types';

// todo: merge with module visitor

/**
 * Is static require.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
export default function isStaticRequire(node: Node) {
    return (
        node
        && node.callee
        && node.callee.type === 'Identifier'
        && node.callee.name === 'require'
        && node.arguments!.length === 1
        && node.arguments![0]!.type === 'Literal'
        && typeof node.arguments![0]!.value === 'string'
    );
}
