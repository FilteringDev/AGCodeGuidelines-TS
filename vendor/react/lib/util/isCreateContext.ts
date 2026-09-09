import dependency0 from './ast';
import type { Node } from '../../types';

const astUtil = dependency0;

/**
 * Checks if the node is a React.createContext call
 * @param node - The AST node being checked.
 * @returns - True if node is a React.createContext call, false if not.
 */
export default function isCreateContext(node: Node) {
    if (node.init && node.init.callee) {
        if (astUtil.isCallExpression(node.init) && node.init.callee.name === 'createContext') {
            return true;
        }

        if (
            node.init.callee.type === 'MemberExpression'
            && node.init.callee.property
            && node.init.callee.property.name === 'createContext'
        ) {
            return true;
        }
    }

    if (
        node.expression
        && typeof node.expression !== 'boolean'
        && node.expression.type === 'AssignmentExpression'
        && node.expression.operator === '='
        && astUtil.isCallExpression(node.expression.right)
        && node.expression.right.callee
    ) {
        const { right } = node.expression;

        if (right.callee.name === 'createContext') {
            return true;
        }

        if (
            right.callee.type === 'MemberExpression'
            && right.callee.property
            && right.callee.property.name === 'createContext'
        ) {
            return true;
        }
    }

    return false;
}
