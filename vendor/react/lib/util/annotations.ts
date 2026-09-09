import type { RuleContext, Node } from '../../types';
/**
 * @file Utility functions for type annotation detection.
 * @author Yannick Croissant
 * @author Vitor Balocco
 */
import dependency0 from './eslint';

const { getFirstTokens } = dependency0;

/**
 * Checks if we are declaring a `props` argument with a flow type annotation.
 * @param node The AST node being checked.
 * @param context The value to inspect.
 * @returns True if the node is a type annotated props declaration, false if not.
 */
function isAnnotatedFunctionPropsDeclaration(node: Node, context: RuleContext) {
    if (!node || !node.params || !node.params.length) {
        return false;
    }

    const typeNode = node.params[0]!.type === 'AssignmentPattern' ? node.params[0]!.left! : node.params[0]!;

    const tokens = getFirstTokens(context, typeNode, 2);
    const isAnnotated = typeNode.typeAnnotation;
    const isDestructuredProps = typeNode.type === 'ObjectPattern';
    const isProps = tokens[0]!.value === 'props' || (tokens[1] && tokens[1].value === 'props');

    return isAnnotated && (isDestructuredProps || isProps);
}

export default {
    isAnnotatedFunctionPropsDeclaration,
};
