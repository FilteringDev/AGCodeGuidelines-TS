import dependency0 from './pragma';
import dependency1 from './isDestructuredFromPragmaImport';
import type { Node, RuleContext } from '../../types';

const pragmaUtil = dependency0;
const isDestructuredFromPragmaImport = dependency1;

/**
 * Checks if the node is a createElement call
 * @param context - The AST node being checked.
 * @param node - The AST node being checked.
 * @returns - True if node is a createElement call object literal, False if not.
 */
export default function isCreateElement(context: RuleContext, node: Node) {
    if (!node.callee) {
        return false;
    }

    if (
        node.callee.type === 'MemberExpression'
        && node.callee.property.name === 'createElement'
        && node.callee.object
        && node.callee.object.name === pragmaUtil.getFromContext(context)
    ) {
        return true;
    }

    if (
        node.callee.name === 'createElement'
        && isDestructuredFromPragmaImport(context, node, 'createElement')
    ) {
        return true;
    }

    return false;
}
