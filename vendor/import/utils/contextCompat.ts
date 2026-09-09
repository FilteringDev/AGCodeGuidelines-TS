import type { RuleContext, Node } from '../types';

/**
 * Read source code from either supported context API.
 * @param context The rule context.
 * @returns Source text and token accessors.
 */
function getSourceCode(context: CompatibleContext) {
    if ('sourceCode' in context) {
        return context.sourceCode;
    }

    return context.getSourceCode();
}

type CompatibleContext = RuleContext | Omit<RuleContext, 'filename' | 'sourceCode'>;

/**
 * Get ancestors.
 * @param context The rule context.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function getAncestors(context: CompatibleContext, node: Node) {
    const sourceCode = getSourceCode(context);

    if (sourceCode && sourceCode.getAncestors) {
        return sourceCode.getAncestors(node);
    }

    return context.getAncestors();
}

/**
 * Get declared variables.
 * @param context The rule context.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function getDeclaredVariables(context: CompatibleContext, node: Node) {
    const sourceCode = getSourceCode(context);

    if (sourceCode && sourceCode.getDeclaredVariables) {
        return sourceCode.getDeclaredVariables(
            node as Parameters<RuleContext['getDeclaredVariables']>[0],
        );
    }

    return context.getDeclaredVariables(node as Parameters<RuleContext['getDeclaredVariables']>[0]);
}

/**
 * Get filename.
 * @param context The rule context.
 * @returns The result of this check.
 */
function getFilename(context: CompatibleContext) {
    if ('filename' in context) {
        return context.filename;
    }

    return context.getFilename();
}

/**
 * Get physical filename.
 * @param context The rule context.
 * @returns The result of this check.
 */
function getPhysicalFilename(context: CompatibleContext) {
    if (context.getPhysicalFilename) {
        return context.getPhysicalFilename();
    }

    return getFilename(context);
}

/**
 * Get scope.
 * @param context The rule context.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function getScope(context: CompatibleContext, node: Node) {
    const sourceCode = getSourceCode(context);

    if (sourceCode && sourceCode.getScope) {
        return sourceCode.getScope(node);
    }

    return context.getScope();
}

export {
    getAncestors, getDeclaredVariables, getFilename, getPhysicalFilename, getScope, getSourceCode,
};
export default {
    getAncestors,
    getDeclaredVariables,
    getFilename,
    getPhysicalFilename,
    getScope,
    getSourceCode,
};
