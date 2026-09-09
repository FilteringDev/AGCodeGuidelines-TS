import type {
    RuleContext, Node, Variable, Scope,
} from '../../types';
/**
 * @file Utility functions for React components detection
 * @author Yannick Croissant
 */
import dependency0 from './eslint';

const { getScope } = dependency0;

/**
 * Search a particular variable in a list
 * @param variables The variables list.
 * @param name The name of the variable to search.
 * @returns True if the variable was found, false if not.
 */
function findVariable(variables: Variable[], name: string) {
    return variables.some((variable: Variable) => variable.name === name);
}

/**
 * Find and return a particular variable in a list
 * @param variables The variables list.
 * @param name The name of the variable to search.
 * @returns Variable if the variable was found, null if not.
 */
function getVariable(variables: Variable[], name: string) {
    return variables.find((variable: Variable) => variable.name === name);
}

/**
 * Searches for a variable in the given scope.
 * @param context The current rule context.
 * @param node The node to start looking from.
 * @param name The name of the variable to search.
 * @returns Variable if the variable was found, undefined if not.
 */
function getVariableFromContext(context: RuleContext, node: Node, name: string) {
    let scope: Scope | null = getScope(context, node);

    while (scope) {
        let variable = getVariable(scope.variables, name);

        if (!variable && scope.childScopes.length) {
            variable = getVariable(scope.childScopes[0]!.variables, name);

            if (!variable && scope.childScopes[0]!.childScopes.length) {
                variable = getVariable(scope.childScopes[0]!.childScopes[0]!.variables, name);
            }
        }

        if (variable) {
            return variable;
        }
        scope = scope.upper;
    }
    return undefined;
}

/**
 * Find a variable by name in the current scope.
 * @param context The current rule context.
 * @param node The node to check. Must be an Identifier node.
 * @param  name Name of the variable to look for.
 * @returns Return null if the variable could not be found, ASTNode otherwise.
 */
function findVariableByName(context: RuleContext, node: Node, name: string) {
    const variable = getVariableFromContext(context, node, name);

    if (!variable || !variable.defs[0] || !variable.defs[0].node) {
        return null;
    }

    if (variable.defs[0].node.type === 'TypeAlias') {
        return variable.defs[0].node.right;
    }

    if (variable.defs[0].type === 'ImportBinding') {
        return variable.defs[0].node;
    }

    return variable.defs[0].node.init;
}

/**
 * Returns the latest definition of the variable.
 * @param variable The value to inspect.
 * @returns The latest variable definition or undefined.
 */
function getLatestVariableDefinition(variable: Variable) {
    return variable.defs[variable.defs.length - 1];
}

export default {
    findVariable,
    findVariableByName,
    getVariable,
    getVariableFromContext,
    getLatestVariableDefinition,
};
