import type { RuleContext, ModuleSource, Node } from '../types';
import { getAncestors } from '../utils/contextCompat';

/**
 * Import declaration.
 * @param context The rule context.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
export default function importDeclaration(context: RuleContext, node: Node) {
    const ancestors = getAncestors(context, node);
    return ancestors[ancestors.length - 1]! as Node<'ImportDeclaration' | 'ExportNamedDeclaration'> & {
        source: ModuleSource;
    };
}
