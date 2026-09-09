import dependency0 from 'doctrine';
import dependency1 from './pragma';
import dependency2 from './eslint';
import type { Node, RuleContext, Scope } from '../../types';

const doctrine = dependency0;
const pragmaUtil = dependency1;
const eslintUtil = dependency2;

const { getScope } = eslintUtil;
const { getSourceCode } = eslintUtil;
const { getText } = eslintUtil;

/**
 * Cache a single object argument by identity, recomputing undefined results.
 * @param fn The value to inspect.
 * @returns The result of this check.
 */
function memoize<Argument extends object, Result>(
    fn: (argument: Argument) => Result,
): (argument: Argument) => Result {
    const cache = new WeakMap<Argument, Result>();
    return function memoizedFn(arg) {
        const cachedValue = cache.get(arg);
        if (cachedValue !== undefined) {
            return cachedValue;
        }
        const value = fn(arg);
        cache.set(arg, value);
        return value;
    };
}

const getPragma = memoize(pragmaUtil.getFromContext);
const getCreateClass = memoize(pragmaUtil.getCreateClassFromContext);

/**
 * @param node The value to inspect.
 * @param context The value to inspect.
 * @returns The result of this check.
 */
function isES5Component(node: Node, context: RuleContext) {
    const pragma = getPragma(context);
    const createClass = getCreateClass(context);

    if (!node.parent || !node.parent.callee) {
        return false;
    }
    const { callee } = node.parent;
    // React.createClass({})
    if (callee.type === 'MemberExpression') {
        return callee.object.name === pragma && callee.property.name === createClass;
    }
    // createClass({})
    if (callee.type === 'Identifier') {
        return callee.name === createClass;
    }
    return false;
}

/**
 * Check if the node is explicitly declared as a descendant of a React Component
 * @param node The value to inspect.
 * @param context The value to inspect.
 * @returns The result of this check.
 */
function isExplicitComponent(node: Node, context: RuleContext) {
    const sourceCode = getSourceCode(context);
    let comment;
    // Sometimes the passed node may not have been parsed yet by eslint, and this function call crashes.
    // Can be removed when eslint sets "parent" property for all nodes on initial AST traversal:
    // https://github.com/eslint/eslint-scope/issues/27

    // FIXME: Remove try/catch when https://github.com/eslint/eslint-scope/issues/27 is implemented.
    try {
        comment = sourceCode.getJSDocComment(node);
    } catch (e) {
        comment = null;
    }

    if (comment === null) {
        return false;
    }

    let commentAst;
    try {
        commentAst = doctrine.parse(comment.value, {
            unwrap: true,
            tags: ['extends', 'augments'],
        });
    } catch (e) {
        // handle a bug in the archived `doctrine`, see #2596
        return false;
    }

    const relevantTags = commentAst.tags.filter(
        (tag) => tag.name === 'React.Component' || tag.name === 'React.PureComponent',
    );

    return relevantTags.length > 0;
}

/**
 * @param node The value to inspect.
 * @param context The value to inspect.
 * @returns The result of this check.
 */
function isES6Component(node: Node, context: RuleContext) {
    const pragma = getPragma(context);
    if (isExplicitComponent(node, context)) {
        return true;
    }

    if (!node.superClass) {
        return false;
    }
    if (node.superClass.type === 'MemberExpression') {
        return (
            node.superClass.object.name === pragma
            && /^(Pure)?Component$/.test(node.superClass.property.name!)
        );
    }
    if (node.superClass.type === 'Identifier') {
        return /^(Pure)?Component$/.test(node.superClass.name);
    }
    return false;
}

/**
 * Get the parent ES5 component node from the current scope
 * @param context The value to inspect.
 * @param initialNode The value to inspect.
 * @returns The result of this check.
 */
function getParentES5Component(context: RuleContext, initialNode: Node) {
    let node = initialNode;

    let scope: Scope | null = getScope(context, node);
    while (scope) {
        node = scope.block && scope.block.parent && scope.block.parent.parent;
        if (node && isES5Component(node, context)) {
            return node;
        }
        scope = scope.upper;
    }
    return null;
}

/**
 * Get the parent ES6 component node from the current scope
 * @param context The value to inspect.
 * @param node The value to inspect.
 * @returns The result of this check.
 */
function getParentES6Component(context: RuleContext, node: Node) {
    let scope: Scope | null = getScope(context, node);
    while (scope && scope.type !== 'class') {
        scope = scope.upper;
    }
    const componentNode = scope && scope.block;
    if (!componentNode || !isES6Component(componentNode, context)) {
        return null;
    }
    return componentNode;
}

/**
 * Checks if a component extends React.PureComponent
 * @param node The value to inspect.
 * @param context The value to inspect.
 * @returns The result of this check.
 */
function isPureComponent(node: Node, context: RuleContext) {
    const pragma = getPragma(context);
    if (node.superClass) {
        return new RegExp(`^(${pragma}\\.)?PureComponent$`).test(getText(context, node.superClass));
    }
    return false;
}

/**
 * @param node The value to inspect.
 * @returns The result of this check.
 */
function isStateMemberExpression(node: Node) {
    return (
        node.type === 'MemberExpression'
        && node.object.type === 'ThisExpression'
        && node.property.name === 'state'
    );
}

export default {
    isES5Component,
    isES6Component,
    getParentES5Component,
    getParentES6Component,
    isExplicitComponent,
    isPureComponent,
    isStateMemberExpression,
};
