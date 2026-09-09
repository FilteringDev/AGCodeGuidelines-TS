import type { Node, RuleContext, SourceCode } from '../../types';

/**
 * @param context The rule context.
 * @returns The result of this check.
 */
function getSourceCode(context: RuleContext) {
    return context.getSourceCode ? context.getSourceCode() : context.sourceCode;
}

/**
 * @param context The rule context.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function getAncestors(context: RuleContext, node: Node) {
    const sourceCode = getSourceCode(context);
    return sourceCode.getAncestors ? sourceCode.getAncestors(node) : context.getAncestors();
}

/**
 * @param context The rule context.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function getScope(context: RuleContext, node: Node) {
    const sourceCode = getSourceCode(context);
    if (sourceCode.getScope) {
        return sourceCode.getScope(node);
    }

    return context.getScope();
}

/**
 * @param name The name to inspect.
 * @param node The node to inspect.
 * @param context The rule context.
 * @returns The result of this check.
 */
function markVariableAsUsed(name: string, node: Node, context: RuleContext) {
    const sourceCode = getSourceCode(context);
    return sourceCode.markVariableAsUsed
        ? sourceCode.markVariableAsUsed(name, node)
        : context.markVariableAsUsed(name);
}

/**
 * @param context The rule context.
 * @param node The node to inspect.
 * @param count The count value.
 * @returns The result of this check.
 */
function getFirstTokens(context: RuleContext, node: Node, count: number) {
    const sourceCode = getSourceCode(context);
    return sourceCode.getFirstTokens
        ? sourceCode.getFirstTokens(node, count)
        : context.getFirstTokens(node, count);
}

/**
 * @param context The rule context.
 * @param args The args value.
 * @returns The result of this check.
 */
function getText(context: RuleContext, ...args: Parameters<SourceCode['getText']>) {
    const sourceCode = getSourceCode(context);
    return sourceCode.getText ? sourceCode.getText(...args) : context.getSource(...args);
}

export default {
    getAncestors,
    getFirstTokens,
    getScope,
    getSourceCode,
    getText,
    markVariableAsUsed,
};
