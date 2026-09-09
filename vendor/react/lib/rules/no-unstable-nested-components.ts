/**
 * @file Prevent creating unstable components inside components
 * @author Ari Perkkiö
 */
import dependency0 from 'minimatch';
import dependency1 from '../util/Components';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/ast';
import dependency4 from '../util/isCreateElement';
import dependency5 from '../util/report';
import type { LegacyRule, Node, RuleContext } from '../../types';

const minimatch = dependency0;
const Components = dependency1;
const docsUrl = dependency2;
const astUtil = dependency3;
const isCreateElement = dependency4;
const report = dependency5;

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const COMPONENT_AS_PROPS_INFO = ' If you want to allow component creation in props, set allowAsProps option to true.';
const HOOK_REGEXP = /^use[A-Z0-9].*$/;

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

/**
 * Generate error message with given parent component name
 * @param parentName Name of the parent component, if known
 * @returns Error message with parent component name
 */
function generateErrorMessageWithParentName(parentName: string) {
    return `Do not define components during render. React will see a new component type on every render and destroy the entire subtree’s DOM nodes and state (https://reactjs.org/docs/reconciliation.html#elements-of-different-types). Instead, move this component definition out of the parent component${parentName ? ` “${parentName}” ` : ' '}and pass data as props.`;
}

/**
 * Check whether given text matches the pattern passed in.
 * @param text Text to validate
 * @param pattern Pattern to match against
 * @returns The result of this check.
 */
function propMatchesRenderPropPattern(text: string, pattern: string) {
    return typeof text === 'string' && minimatch(text, pattern);
}

/**
 * Get closest parent matching given matcher
 * @param node The AST node
 * @param context eslint context
 * @param matcher Method used to match the parent
 * @returns The matching parent node, if any
 */
function getClosestMatchingParent(
    node: Node,
    context: RuleContext,
    matcher: (node: Node, context: RuleContext) => unknown,
): Node | undefined {
    if (!node || !node.parent || node.parent.type === 'Program') {
        return undefined;
    }

    if (matcher(node.parent, context)) {
        return node.parent;
    }

    return getClosestMatchingParent(node.parent, context, matcher);
}

/**
 * Matcher used to check whether given node is a `createElement` call
 * @param node The AST node
 * @param context eslint context
 * @returns True if node is a `createElement` call, false if not
 */
function isCreateElementMatcher(node: Node, context: RuleContext) {
    return astUtil.isCallExpression(node) && isCreateElement(context, node);
}

/**
 * Matcher used to check whether given node is a `ObjectExpression`
 * @param node The AST node
 * @returns True if node is a `ObjectExpression`, false if not
 */
function isObjectExpressionMatcher(node: Node) {
    return node && node.type === 'ObjectExpression';
}

/**
 * Matcher used to check whether given node is a `JSXExpressionContainer`
 * @param node The AST node
 * @returns True if node is a `JSXExpressionContainer`, false if not
 */
function isJSXExpressionContainerMatcher(node: Node) {
    return node && node.type === 'JSXExpressionContainer';
}

/**
 * Matcher used to check whether given node is a `JSXAttribute` of `JSXExpressionContainer`
 * @param node The AST node
 * @returns True if node is a `JSXAttribute` of `JSXExpressionContainer`, false if not
 */
function isJSXAttributeOfExpressionContainerMatcher(node: Node) {
    return (
        node
        && node.type === 'JSXAttribute'
        && node.value
        && node.value.type === 'JSXExpressionContainer'
    );
}

/**
 * Matcher used to check whether given node is an object `Property`
 * @param node The AST node
 * @returns True if node is a `Property`, false if not
 */
function isPropertyOfObjectExpressionMatcher(node: Node) {
    return node && node.parent && node.parent.type === 'Property';
}

/**
 * Check whether given node or its parent is directly inside `map` call
 * ```jsx
 * {items.map(item => <li />)}
 * ```
 * @param node The AST node
 * @returns True if node is directly inside `map` call, false if not
 */
function isMapCall(node: Node) {
    return node && node.callee && node.callee.property && node.callee.property.name === 'map';
}

/**
 * Check whether given node is `ReturnStatement` of a React hook
 * @param node The AST node
 * @param context eslint context
 * @returns True if node is a `ReturnStatement` of a React hook, false if not
 */
function isReturnStatementOfHook(node: Node, context: RuleContext) {
    if (!node || !node.parent || node.parent.type !== 'ReturnStatement') {
        return false;
    }

    const callExpression = getClosestMatchingParent(node, context, astUtil.isCallExpression);
    return callExpression && callExpression.callee && HOOK_REGEXP.test(callExpression.callee.name!);
}

/**
 * Check whether given node is declared inside a render prop
 * ```jsx
 * <Component renderFooter={() => <div />} />
 * <Component>{() => <div />}</Component>
 * ```
 * @param node The AST node
 * @param context eslint context
 * @param propNamePattern a pattern to match render props against
 * @returns True if component is declared inside a render prop, false if not
 */
function isComponentInRenderProp(node: Node, context: RuleContext, propNamePattern: string) {
    if (
        node
        && node.parent
        && node.parent.type === 'Property'
        && node.parent.key
        && propMatchesRenderPropPattern(node.parent.key.name!, propNamePattern)
    ) {
        return true;
    }

    // Check whether component is a render prop used as direct children, e.g. <Component>{() => <div />}</Component>
    if (
        node
        && node.parent
        && node.parent.type === 'JSXExpressionContainer'
        && node.parent.parent
        && node.parent.parent.type === 'JSXElement'
    ) {
        return true;
    }

    const jsxExpressionContainer = getClosestMatchingParent(
        node,
        context,
        isJSXExpressionContainerMatcher,
    );

    // Check whether prop name indicates accepted patterns
    if (
        jsxExpressionContainer
        && jsxExpressionContainer.parent
        && jsxExpressionContainer.parent.type === 'JSXAttribute'
        && jsxExpressionContainer.parent.name
        && jsxExpressionContainer.parent.name.type === 'JSXIdentifier'
    ) {
        const propName = jsxExpressionContainer.parent.name.name;

        // Starts with render, e.g. <Component renderFooter={() => <div />} />
        if (propMatchesRenderPropPattern(propName, propNamePattern)) {
            return true;
        }

        // Uses children prop explicitly, e.g. <Component children={() => <div />} />
        if (propName === 'children') {
            return true;
        }
    }

    return false;
}

/**
 * Check whether given node is declared directly inside a render property
 * ```jsx
 * const rows = { render: () => <div /> }
 * <Component rows={ [{ render: () => <div /> }] } />
 *  ```
 * @param node The AST node
 * @param propNamePattern The pattern to match render props against
 * @returns True if component is declared inside a render property, false if not
 */
function isDirectValueOfRenderProperty(node: Node, propNamePattern: string) {
    return (
        node
        && node.parent
        && node.parent.type === 'Property'
        && node.parent.key
        && node.parent.key.type === 'Identifier'
        && propMatchesRenderPropPattern(node.parent.key.name, propNamePattern)
    );
}

/**
 * Resolve the component name of given node
 * @param node The AST node of the component
 * @returns Name of the component, if any
 */
function resolveComponentName(node: Node) {
    const parentName = node.id && node.id.name;
    if (parentName) {
        return parentName;
    }

    return (
        node.type === 'ArrowFunctionExpression' && node.parent && node.parent.id && node.parent.id.name
    );
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const rule: LegacyRule<
    [{ customValidators?: string[]; allowAsProps?: boolean; propNamePattern?: string }?]
> = {
    meta: {
        docs: {
            description: 'Disallow creating unstable components inside components',
            category: 'Possible Errors',
            recommended: false,
            url: docsUrl('no-unstable-nested-components'),
        },
        schema: [
            {
                type: 'object',
                properties: {
                    customValidators: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    allowAsProps: {
                        type: 'boolean',
                    },
                    propNamePattern: {
                        type: 'string',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create: Components.detect((context, components, utils) => {
        const allowAsProps = context.options.some((option) => option && option.allowAsProps);
        const propNamePattern = (context.options[0] || {}).propNamePattern || 'render*';

        /**
         * Check whether given node is declared inside class component's render block
         * ```jsx
         * class Component extends React.Component {
         *   render() {
         *     class NestedClassComponent extends React.Component {
         * ...
         * ```
         * @param node The AST node being checked
         * @returns True if node is inside class component's render block, false if not
         */
        function isInsideRenderMethod(node: Node) {
            const parentComponent = utils.getParentComponent(node);

            if (!parentComponent || parentComponent.type !== 'ClassDeclaration') {
                return false;
            }

            return (
                node
                && node.parent
                && node.parent.type === 'MethodDefinition'
                && node.parent.key
                && node.parent.key.name === 'render'
            );
        }

        /**
         * Check whether given node is a function component declared inside class component.
         * Util's component detection fails to detect function components inside class components.
         * ```jsx
         * class Component extends React.Component {
         *  render() {
         *    const NestedComponent = () => <div />;
         * ...
         * ```
         * @param node The AST node being checked
         * @returns True if given node a function component declared inside class component, false if not
         */
        function isFunctionComponentInsideClassComponent(node: Node) {
            const parentComponent = utils.getParentComponent(node);
            const parentStatelessComponent = utils.getParentStatelessComponent(node);

            return (
                parentComponent
                && parentStatelessComponent
                && parentComponent.type === 'ClassDeclaration'
                && utils.getStatelessComponent(parentStatelessComponent)
                && utils.isReturningJSX(node)
            );
        }

        /**
         * Check whether given node is declared inside `createElement` call's props
         * ```js
         * React.createElement(Component, {
         *   footer: () => React.createElement("div", null)
         * })
         * ```
         * @param node The AST node
         * @returns True if node is declare inside `createElement` call's props, false if not
         */
        function isComponentInsideCreateElementsProp(node: Node) {
            if (!components.get(node)) {
                return false;
            }

            const createElementParent = getClosestMatchingParent(node, context, isCreateElementMatcher);

            return (
                createElementParent
                && createElementParent.arguments
                && createElementParent.arguments[1]
                    === getClosestMatchingParent(node, context, isObjectExpressionMatcher)
            );
        }

        /**
         * Check whether given node is declared inside a component/object prop.
         * ```jsx
         * <Component footer={() => <div />} />
         * { footer: () => <div /> }
         * ```
         * @param node The AST node being checked
         * @returns True if node is a component declared inside prop, false if not
         */
        function isComponentInProp(node: Node) {
            if (isPropertyOfObjectExpressionMatcher(node)) {
                return utils.isReturningJSX(node);
            }

            const jsxAttribute = getClosestMatchingParent(
                node,
                context,
                isJSXAttributeOfExpressionContainerMatcher,
            );

            if (!jsxAttribute) {
                return isComponentInsideCreateElementsProp(node);
            }

            return utils.isReturningJSX(node);
        }

        /**
         * Check whether given node is a stateless component returning non-JSX
         * ```jsx
         * {{ a: () => null }}
         * ```
         * @param node The AST node being checked
         * @returns True if node is a stateless component returning non-JSX, false if not
         */
        function isStatelessComponentReturningNull(node: Node) {
            const component = utils.getStatelessComponent(node);

            return component && !utils.isReturningJSX(component);
        }

        /**
         * Check whether given node is a unstable nested component
         * @param node The AST node being checked
         */
        function validate(node: Node) {
            if (!node || !node.parent) {
                return;
            }

            const isDeclaredInsideProps = isComponentInProp(node);

            if (
                !components.get(node)
                && !isFunctionComponentInsideClassComponent(node)
                && !isDeclaredInsideProps
            ) {
                return;
            }

            if (
                // Support allowAsProps option
                (isDeclaredInsideProps
                    && (allowAsProps || isComponentInRenderProp(node, context, propNamePattern)))
                // Prevent reporting components created inside Array.map calls
                || isMapCall(node)
                || isMapCall(node.parent)
                // Do not mark components declared inside hooks (or falsy '() => null' clean-up methods)
                || isReturnStatementOfHook(node, context)
                // Do not mark objects containing render methods
                || isDirectValueOfRenderProperty(node, propNamePattern)
                // Prevent reporting nested class components twice
                || isInsideRenderMethod(node)
                // Prevent falsely reporting detected "components" which do not return JSX
                || isStatelessComponentReturningNull(node)
            ) {
                return;
            }

            // Get the closest parent component
            const parentComponent = getClosestMatchingParent(
                node,
                context,
                (nodeToMatch: Node | null | undefined) => components.get(nodeToMatch),
            );

            if (parentComponent) {
                const parentName = resolveComponentName(parentComponent);

                // Exclude lowercase parents, e.g. function createTestComponent()
                // React-dom prevents creating lowercase components
                if (parentName && parentName[0] === parentName[0]!.toLowerCase()) {
                    return;
                }

                let message = generateErrorMessageWithParentName(parentName as string);

                // Add information about allowAsProps option when component is declared inside prop
                if (isDeclaredInsideProps && !allowAsProps) {
                    message += COMPONENT_AS_PROPS_INFO;
                }

                report(context, message, null, {
                    node,
                });
            }
        }

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        return {
            FunctionDeclaration(node: Node<'FunctionDeclaration'>) {
                validate(node);
            },
            ArrowFunctionExpression(node: Node<'ArrowFunctionExpression'>) {
                validate(node);
            },
            FunctionExpression(node: Node<'FunctionExpression'>) {
                validate(node);
            },
            ClassDeclaration(node: Node<'ClassDeclaration'>) {
                validate(node);
            },
            CallExpression(node: Node<'CallExpression'>) {
                validate(node);
            },
        };
    }),
};

export default rule;
