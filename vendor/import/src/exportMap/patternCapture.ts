import type { Node } from '../../types';

/**
 * Traverse a pattern/identifier node, calling 'callback'
 * for each leaf identifier.
 * @param  pattern The  value.
 * @param  callback The  value.
 */
export default function recursivePatternCapture(
    pattern: Node,
    callback: (node: Node<'Identifier'>) => void,
) {
    switch (pattern.type) {
        case 'Identifier': // base case
            callback(pattern);
            break;

        case 'ObjectPattern':
            pattern.properties.forEach((p) => {
                if (p.type === 'ExperimentalRestProperty' || p.type === 'RestElement') {
                    callback(p.argument as Node<'Identifier'>);
                    return;
                }
                recursivePatternCapture(p.value!, callback);
            });
            break;

        case 'ArrayPattern':
            pattern.elements.forEach((element) => {
                if (element == null) {
                    return;
                }
                if (
                    (element as Node).type === 'ExperimentalRestProperty'
                    || element.type === 'RestElement'
                ) {
                    callback(element.argument as Node<'Identifier'>);
                    return;
                }
                recursivePatternCapture(element, callback);
            });
            break;

        case 'AssignmentPattern':
            callback(pattern.left as Node<'Identifier'>);
            break;
        default:
    }
}
