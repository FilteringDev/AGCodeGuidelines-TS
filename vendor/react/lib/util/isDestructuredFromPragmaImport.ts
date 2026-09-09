import dependency0 from './ast';
import dependency1 from './pragma';
import dependency2 from './variable';
import type { Node, RuleContext } from '../../types';

const astUtil = dependency0;
const pragmaUtil = dependency1;
const variableUtil = dependency2;

/**
 * Check if variable is destructured from pragma import
 * @param context eslint context
 * @param node The AST node to check
 * @param variable The variable name to check
 * @returns True if createElement is destructured from the pragma
 */
export default function isDestructuredFromPragmaImport(
    context: RuleContext,
    node: Node,
    variable: string,
) {
    const pragma = pragmaUtil.getFromContext(context);
    const variableInScope = variableUtil.getVariableFromContext(context, node, variable);
    if (variableInScope) {
        const latestDef = variableUtil.getLatestVariableDefinition(variableInScope);
        if (latestDef) {
            // check if latest definition is a variable declaration: 'variable = value'
            if (latestDef.node.type === 'VariableDeclarator' && latestDef.node.init) {
                // check for: 'variable = pragma.variable'
                if (
                    latestDef.node.init.type === 'MemberExpression'
                    && latestDef.node.init.object.type === 'Identifier'
                    && latestDef.node.init.object.name === pragma
                ) {
                    return true;
                }
                // check for: '{variable} = pragma'
                if (latestDef.node.init.type === 'Identifier' && latestDef.node.init.name === pragma) {
                    return true;
                }

                // "require('react')"
                let requireExpression = null;

                // get "require('react')" from: "{variable} = require('react')"
                if (astUtil.isCallExpression(latestDef.node.init)) {
                    requireExpression = latestDef.node.init;
                }
                // get "require('react')" from: "variable = require('react').variable"
                if (
                    !requireExpression
                    && latestDef.node.init.type === 'MemberExpression'
                    && astUtil.isCallExpression(latestDef.node.init.object)
                ) {
                    requireExpression = latestDef.node.init.object;
                }

                // check proper require.
                if (
                    requireExpression
                    && requireExpression.callee
                    && requireExpression.callee.name === 'require'
                    && requireExpression.arguments[0]
                    && requireExpression.arguments[0].value === pragma.toLocaleLowerCase()
                ) {
                    return true;
                }

                return false;
            }

            // latest definition is an import declaration: import {<variable>} from 'react'
            if (
                latestDef.parent
                && latestDef.parent.type === 'ImportDeclaration'
                && latestDef.parent.source.value === pragma.toLocaleLowerCase()
            ) {
                return true;
            }
        }
    }
    return false;
}
