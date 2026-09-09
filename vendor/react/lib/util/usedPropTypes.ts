import dependency0 from 'object.values';
import type { Component, ComponentUtils } from '../../component-types';
import type Components from './Components';
/**
 * @file Common used propTypes detection functionality.
 */
import dependency1 from './ast';
import dependency2 from './componentUtil';
import dependency3 from './version';
import dependency4 from './eslint';
import type { Node, RuleContext, Scope } from '../../types';

const values = dependency0;

const astUtil = dependency1;
const componentUtil = dependency2;
const { testReactVersion } = dependency3;
const ast = dependency1;
const eslintUtil = dependency4;

const { getScope } = eslintUtil;
const { getSourceCode } = eslintUtil;

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const LIFE_CYCLE_METHODS = [
    'componentWillReceiveProps',
    'shouldComponentUpdate',
    'componentWillUpdate',
    'componentDidUpdate',
];
const ASYNC_SAFE_LIFE_CYCLE_METHODS = [
    'getDerivedStateFromProps',
    'getSnapshotBeforeUpdate',
    'UNSAFE_componentWillReceiveProps',
    'UNSAFE_componentWillUpdate',
];

/**
 * @returns The result of this check.
 */
function createPropVariables() {
    let propVariables: Map<string, string[]> = new Map();
    let hasBeenWritten = false;
    const stack = [{ propVariables, hasBeenWritten }];
    return {
        pushScope() {
            // popVariables is not copied until first write.
            stack.push({ propVariables, hasBeenWritten: false });
        },
        popScope() {
            stack.pop();
            propVariables = stack[stack.length - 1]!.propVariables;
            hasBeenWritten = stack[stack.length - 1]!.hasBeenWritten;
        },
        /**
         * Add a variable name to the current scope
         * @param name The value to inspect.
         * @param allNames Example: `props.a.b` should be formatted as `['a', 'b']`
         * @returns The result of this check.
         */
        set(name: string, allNames: string[]) {
            if (!hasBeenWritten) {
                // copy on write
                propVariables = new Map(propVariables);
                Object.assign(stack[stack.length - 1]!, { propVariables, hasBeenWritten: true });
                stack[stack.length - 1]!.hasBeenWritten = true;
            }
            return propVariables.set(name, allNames);
        },
        /**
         * Get the definition of a variable.
         * @param name The value to inspect.
         * @returns Example: `props.a.b` is represented by `['a', 'b']`
         */
        get(name: string) {
            return propVariables.get(name);
        },
    };
}

/**
 * Checks if the string is one of `props`, `nextProps`, or `prevProps`
 * @param name The AST node being checked.
 * @returns True if the prop name matches
 */
function isCommonVariableNameForProps(name: unknown) {
    return name === 'props' || name === 'nextProps' || name === 'prevProps';
}

/**
 * Checks if the component must be validated
 * @param component The component to process
 * @returns True if the component must be validated, false if not.
 */
function mustBeValidated(component: Component | null) {
    return !!(component && !component.ignorePropsValidation);
}

/**
 * Check if we are in a lifecycle method
 * @param context The value to inspect.
 * @param node The AST node being checked.
 * @param checkAsyncSafeLifeCycles The value to inspect.
 * @returns true if we are in a class constructor, false if not
 */
function inLifeCycleMethod(context: RuleContext, node: Node, checkAsyncSafeLifeCycles: boolean) {
    let scope: Scope | null = getScope(context, node);
    while (scope) {
        if (scope.block && scope.block.parent && scope.block.parent.key) {
            const { name } = scope.block.parent.key;

            if (LIFE_CYCLE_METHODS.indexOf(name!) >= 0) {
                return true;
            }
            if (checkAsyncSafeLifeCycles && ASYNC_SAFE_LIFE_CYCLE_METHODS.indexOf(name!) >= 0) {
                return true;
            }
        }
        scope = scope.upper;
    }
    return false;
}

/**
 * Returns true if the given node is a React Component lifecycle method
 * @param node The AST node being checked.
 * @param checkAsyncSafeLifeCycles The value to inspect.
 * @returns True if the node is a lifecycle method
 */
function isNodeALifeCycleMethod(node: Node, checkAsyncSafeLifeCycles: boolean) {
    if (node.key) {
        if (node.kind === 'constructor') {
            return true;
        }

        const nodeKeyName = node.key.name;

        if (typeof nodeKeyName !== 'string') {
            return false;
        }

        if (LIFE_CYCLE_METHODS.indexOf(nodeKeyName) >= 0) {
            return true;
        }
        if (checkAsyncSafeLifeCycles && ASYNC_SAFE_LIFE_CYCLE_METHODS.indexOf(nodeKeyName) >= 0) {
            return true;
        }
    }

    return false;
}

/**
 * Returns true if the given node is inside a React Component lifecycle
 * method.
 * @param node The AST node being checked.
 * @param checkAsyncSafeLifeCycles The value to inspect.
 * @returns True if the node is inside a lifecycle method
 */
function isInLifeCycleMethod(node: Node, checkAsyncSafeLifeCycles: boolean) {
    if (
        (node.type === 'MethodDefinition' || node.type === 'Property')
        && isNodeALifeCycleMethod(node, checkAsyncSafeLifeCycles)
    ) {
        return true;
    }

    if (node.parent) {
        return isInLifeCycleMethod(node.parent, checkAsyncSafeLifeCycles);
    }

    return false;
}

/**
 * Check if a function node is a setState updater
 * @param node a function node
 * @returns The result of this check.
 */
function isSetStateUpdater(node: Node) {
    const unwrappedParentCalleeNode = astUtil.isCallExpression(node.parent)
&& ast.unwrapTSAsExpression(node.parent.callee);

    return (
        unwrappedParentCalleeNode
        && unwrappedParentCalleeNode.property
        && unwrappedParentCalleeNode.property.name === 'setState'
        // Make sure we are in the updater not the callback
        && node.parent.arguments![0] === node
    );
}

/**
 * @param context The rule context.
 * @param node The node to inspect.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function isPropArgumentInSetStateUpdater(context: RuleContext, node: Node, name: string) {
    if (typeof name !== 'string') {
        return undefined;
    }
    let scope: Scope | null = getScope(context, node);
    while (scope) {
        const unwrappedParentCalleeNode = scope.block
            && astUtil.isCallExpression(scope.block.parent)
            && ast.unwrapTSAsExpression(scope.block.parent.callee);
        if (
            unwrappedParentCalleeNode
            && unwrappedParentCalleeNode.property
            && unwrappedParentCalleeNode.property.name === 'setState'
            // Make sure we are in the updater not the callback
            && scope.block.parent.arguments![0]!.range[0] === scope.block.range[0]
            && scope.block.parent.arguments![0]!.params
            && scope.block.parent.arguments![0]!.params.length > 1
        ) {
            return scope.block.parent.arguments![0]!.params[1]!.name === name;
        }
        scope = scope.upper;
    }
    return false;
}

/**
 * @param context The value to inspect.
 * @param node The value to inspect.
 * @returns The result of this check.
 */
function isInClassComponent(context: RuleContext, node: Node) {
    return !!(
        componentUtil.getParentES6Component(context, node)
        || componentUtil.getParentES5Component(context, node)
    );
}

/**
 * Checks if the node is `this.props`
 * @param node The value to inspect.
 * @returns The result of this check.
 */
function isThisDotProps(node: Node | undefined) {
    return (
        !!node
        && node.type === 'MemberExpression'
        && ast.unwrapTSAsExpression(node.object).type === 'ThisExpression'
        && node.property.name === 'props'
    );
}

/**
 * Checks if the prop has spread operator.
 * @param context The value to inspect.
 * @param node The AST node being marked.
 * @returns True if the prop has spread operator, false if not.
 */
function hasSpreadOperator(context: RuleContext, node: Node) {
    const tokens = getSourceCode(context).getTokens(node);
    return tokens.length && tokens[0]!.value === '...';
}

/**
 * Checks if the node is a propTypes usage of the form `this.props.*`, `props.*`, `prevProps.*`, or `nextProps.*`.
 * @param context The value to inspect.
 * @param node The value to inspect.
 * @param utils The value to inspect.
 * @param checkAsyncSafeLifeCycles The value to inspect.
 * @returns The result of this check.
 */
function isPropTypesUsageByMemberExpression(
    context: RuleContext,
    node: Node,
    utils: ComponentUtils,
    checkAsyncSafeLifeCycles: boolean,
) {
    const unwrappedObjectNode = ast.unwrapTSAsExpression(node.object!);

    if (isInClassComponent(context, node)) {
        // this.props.*
        if (isThisDotProps(unwrappedObjectNode)) {
            return true;
        }
        // props.* or prevProps.* or nextProps.*
        if (
            isCommonVariableNameForProps(unwrappedObjectNode.name)
            && (inLifeCycleMethod(context, node, checkAsyncSafeLifeCycles)
                || astUtil.inConstructor(context, node))
        ) {
            return true;
        }
        // this.setState((_, props) => props.*))
        if (isPropArgumentInSetStateUpdater(context, node, unwrappedObjectNode.name as string)) {
            return true;
        }
        return false;
    }
    // props.* in function component
    return unwrappedObjectNode.name === 'props' && !ast.isAssignmentLHS(node);
}

/**
 * Retrieve the name of a property node
 * @param context The value to inspect.
 * @param node The AST node with the property.
 * @param utils The value to inspect.
 * @param checkAsyncSafeLifeCycles The value to inspect.
 * @returns the name of the property or undefined if not found
 */
function getPropertyName(
    context: RuleContext,
    node: Node,
    utils: ComponentUtils,
    checkAsyncSafeLifeCycles: boolean,
) {
    const { property } = node;
    if (property) {
        switch (property.type) {
            case 'Identifier':
                if (node.computed) {
                    return '__COMPUTED_PROP__';
                }
                return property.name;
            case 'MemberExpression':
                return undefined;
            case 'Literal':
                // Accept computed properties that are literal strings
                if (typeof property.value === 'string') {
                    return property.value;
                }
                // Accept number as well but only accept props[123]
                if (typeof property.value === 'number') {
                    if (
                        isPropTypesUsageByMemberExpression(
                            context,
                            node,
                            utils,
                            checkAsyncSafeLifeCycles,
                        )
                    ) {
                        return property.raw;
                    }
                }
            // falls through
            default:
                if (node.computed) {
                    return '__COMPUTED_PROP__';
                }
                break;
        }
    }

    return undefined;
}

/**
 * @param context The rule context.
 * @param components The components value.
 * @param utils The utils value.
 * @returns The result of this check.
 */
export default function usedPropTypesInstructions(
    context: RuleContext,
    components: InstanceType<typeof Components>,
    utils: ComponentUtils,
) {
    const checkAsyncSafeLifeCycles = testReactVersion(context, '>= 16.3.0');

    const propVariables = createPropVariables();
    const { pushScope } = propVariables;
    const { popScope } = propVariables;

    /**
     * Mark a prop type as used
     * @param node The AST node being marked.
     * @param [initialParentNames] The value to inspect.
     */
    function markPropTypesAsUsed(node: Node, initialParentNames?: string[]) {
        let parentNames = initialParentNames;

        parentNames = parentNames || [];
        let type;
        let name;
        let allNames;
        let properties;
        switch (node.type) {
            case 'OptionalMemberExpression':
            case 'MemberExpression':
                name = getPropertyName(context, node, utils, checkAsyncSafeLifeCycles);
                if (name) {
                    allNames = parentNames.concat(name);
                    if (
                        // Match props.foo.bar, don't match bar[props.foo]
                        node.parent.type === 'MemberExpression'
                        && node.parent.object === node
                    ) {
                        markPropTypesAsUsed(node.parent, allNames);
                    }
                    // Handle the destructuring part of `const {foo} = props.a.b`
                    if (
                        node.parent.type === 'VariableDeclarator'
                        && node.parent.id.type === 'ObjectPattern'
                    ) {
                        Object.assign(node.parent.id, { parent: node.parent });
                        // patch for bug in eslint@4 in which ObjectPattern has no parent
                        markPropTypesAsUsed(node.parent.id, allNames);
                    }

                    // const a = props.a
                    if (
                        node.parent.type === 'VariableDeclarator'
                        && node.parent.id.type === 'Identifier'
                    ) {
                        propVariables.set(node.parent.id.name, allNames);
                    }
                    // Do not mark computed props as used.
                    type = name !== '__COMPUTED_PROP__' ? 'direct' : null;
                }
                break;
            case 'ArrowFunctionExpression':
            case 'FunctionDeclaration':
            case 'FunctionExpression': {
                if (node.params.length === 0) {
                    break;
                }
                type = 'destructuring';
                const propParam = isSetStateUpdater(node) ? node.params[1] : node.params[0];
                properties = propParam!.type === 'AssignmentPattern'
                    ? propParam!.left!.properties
                    : propParam!.properties;
                break;
            }
            case 'ObjectPattern':
                type = 'destructuring';
                properties = node.properties;
                break;
            case 'TSEmptyBodyFunctionExpression':
                break;
            default:
                throw new Error(`${node.type} ASTNodes are not handled by markPropTypesAsUsed`);
        }

        const component = components.get(utils.getParentComponent(node));
        const usedPropTypes = (component && component.usedPropTypes) || [];
        let ignoreUnusedPropTypesValidation = (component && component.ignoreUnusedPropTypesValidation) || false;

        switch (type) {
            case 'direct': {
                // Ignore Object methods
                if (name! in Object.prototype) {
                    break;
                }

                const reportedNode = node.property;
                usedPropTypes.push({
                    name: name!,
                    allNames,
                    node: reportedNode,
                });
                break;
            }
            case 'destructuring': {
                for (let k = 0, l = (properties || []).length; k < l; k += 1) {
                    if (hasSpreadOperator(context, properties![k]!) || properties![k]!.computed) {
                        ignoreUnusedPropTypesValidation = true;
                        break;
                    }
                    const propName = ast.getKeyValue(context, properties![k]!) as string;

                    if (!propName || properties![k]!.type !== 'Property') {
                        break;
                    }

                    usedPropTypes.push({
                        allNames: parentNames.concat([propName]),
                        name: propName,
                        node: properties![k],
                    });

                    if (properties![k]!.value!.type === 'ObjectPattern') {
                        markPropTypesAsUsed(properties![k]!.value!, parentNames.concat([propName]));
                    } else if (properties![k]!.value!.type === 'Identifier') {
                        propVariables.set(properties![k]!.value!.name!, parentNames.concat(propName));
                    }
                }
                break;
            }
            default:
                break;
        }

        components.set(component ? component.node : node, {
            usedPropTypes,
            ignoreUnusedPropTypesValidation,
        });
    }

    /**
     * @param node We expect either an ArrowFunctionExpression,
     *   FunctionDeclaration, or FunctionExpression
     */
    function markDestructuredFunctionArgumentsAsUsed(node: Node) {
        const param = node.params && isSetStateUpdater(node) ? node.params[1] : node.params![0];

        const destructuring = param
            && (param.type === 'ObjectPattern'
                || (param.type === 'AssignmentPattern' && param.left.type === 'ObjectPattern'));

        if (destructuring && (components.get(node) || components.get(node.parent))) {
            markPropTypesAsUsed(node);
        }
    }

    /**
     * @param node The node to inspect.
     */
    function handleSetStateUpdater(node: Node) {
        if (!node.params || node.params.length < 2 || !isSetStateUpdater(node)) {
            return;
        }
        markPropTypesAsUsed(node);
    }

    /**
     * Handle both stateless functions and setState updater functions.
     * @param node We expect either an ArrowFunctionExpression,
     *   FunctionDeclaration, or FunctionExpression
     */
    function handleFunctionLikeExpressions(node: Node) {
        pushScope();
        handleSetStateUpdater(node);
        markDestructuredFunctionArgumentsAsUsed(node);
    }

    /**
     * @param component The component value.
     */
    function handleCustomValidators(component: Component) {
        const propTypes = component.declaredPropTypes;
        if (!propTypes) {
            return;
        }

        Object.keys(propTypes).forEach((key) => {
            const { node } = propTypes[key]!;

            if (node && node.value && astUtil.isFunctionLikeExpression(node.value as Node)) {
                markPropTypesAsUsed(node.value as Node);
            }
        });
    }

    return {
        VariableDeclarator(node: Node<'VariableDeclarator'>) {
            const unwrappedInitNode = ast.unwrapTSAsExpression(node.init!);

            // let props = this.props
            if (
                isThisDotProps(unwrappedInitNode)
                && isInClassComponent(context, node)
                && node.id.type === 'Identifier'
            ) {
                propVariables.set(node.id.name, []);
            }

            // Only handles destructuring
            if (node.id.type !== 'ObjectPattern' || !unwrappedInitNode) {
                return;
            }

            // let {props: {firstname}} = this
            const propsProperty = node.id.properties.find(
                (property) => property.key && (property.key.name === 'props' || property.key.value === 'props'),
            );

            if (
                unwrappedInitNode.type === 'ThisExpression'
                && propsProperty
                && propsProperty.value!.type === 'ObjectPattern'
            ) {
                markPropTypesAsUsed(propsProperty.value!);
                return;
            }

            // let {props} = this
            if (
                unwrappedInitNode.type === 'ThisExpression'
                && propsProperty
                && propsProperty.value!.name === 'props'
            ) {
                propVariables.set('props', []);
                return;
            }

            // let {firstname} = props
            if (
                isCommonVariableNameForProps(unwrappedInitNode.name)
                && (utils.getParentStatelessComponent(node)
                    || isInLifeCycleMethod(node, checkAsyncSafeLifeCycles))
            ) {
                markPropTypesAsUsed(node.id);
                return;
            }

            // let {firstname} = this.props
            if (isThisDotProps(unwrappedInitNode) && isInClassComponent(context, node)) {
                markPropTypesAsUsed(node.id);
                return;
            }

            // let {firstname} = thing, where thing is defined by const thing = this.props.**.*
            if (propVariables.get(unwrappedInitNode.name as string)) {
                markPropTypesAsUsed(node.id, propVariables.get(unwrappedInitNode.name as string));
            }
        },

        FunctionDeclaration: handleFunctionLikeExpressions,

        ArrowFunctionExpression: handleFunctionLikeExpressions,

        FunctionExpression: handleFunctionLikeExpressions,

        'FunctionDeclaration:exit': popScope,

        'ArrowFunctionExpression:exit': popScope,

        'FunctionExpression:exit': popScope,

        JSXSpreadAttribute(node: Node<'JSXSpreadAttribute'>) {
            const component = components.get(utils.getParentComponent(node));
            components.set(component ? component.node : node, {
                ignoreUnusedPropTypesValidation: node.argument.type !== 'ObjectExpression',
            });
        },

        'MemberExpression, OptionalMemberExpression':
            function onMemberExpressionOptionalMemberExpression(
                node: Node<'MemberExpression' | 'OptionalMemberExpression'>,
            ) {
                if (isPropTypesUsageByMemberExpression(context, node, utils, checkAsyncSafeLifeCycles)) {
                    markPropTypesAsUsed(node);
                    return;
                }

                const propVariable = propVariables.get(
                    ast.unwrapTSAsExpression(node.object).name as string,
                );
                if (propVariable) {
                    markPropTypesAsUsed(node, propVariable);
                }
            },

        ObjectPattern(node: Node<'ObjectPattern'>) {
            // If the object pattern is a destructured props object in a lifecycle
            // method -- mark it for used props.
            if (
                isNodeALifeCycleMethod(node.parent.parent, checkAsyncSafeLifeCycles)
                && node.properties.length > 0
            ) {
                markPropTypesAsUsed(node.parent);
            }
        },

        'Program:exit': function onProgramExit() {
            values(components.list())
                .filter((component) => mustBeValidated(component))
                .forEach((component) => {
                    handleCustomValidators(component);
                });
        },
    };
}
