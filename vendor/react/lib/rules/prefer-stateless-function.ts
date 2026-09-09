import dependency0 from 'object.values';
import type { Scope, LegacyRule, Node } from '../../types';
/**
 * @file Enforce stateless components to be written as a pure function
 * @author Yannick Croissant
 * @author Alberto Rodríguez
 * @copyright 2015 Alberto Rodríguez. All rights reserved.
 */
import dependency1 from '../util/Components';
import dependency2 from '../util/version';
import dependency3 from '../util/ast';
import dependency4 from '../util/componentUtil';
import dependency5 from '../util/docsUrl';
import dependency6 from '../util/report';
import dependency7 from '../util/eslint';

const values = dependency0;

const Components = dependency1;
const { testReactVersion } = dependency2;
const astUtil = dependency3;
const componentUtil = dependency4;
const docsUrl = dependency5;
const report = dependency6;
const eslintUtil = dependency7;

const { getScope } = eslintUtil;
const { getText } = eslintUtil;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    componentShouldBePure: 'Component should be written as a pure function',
};

const rule: LegacyRule<[{ ignorePureComponents?: boolean }?]> = {
    meta: {
        docs: {
            description: 'Enforce stateless components to be written as a pure function',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('prefer-stateless-function'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    ignorePureComponents: {
                        default: false,
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create: Components.detect((context, components, utils) => {
        const configuration = context.options[0] || {};
        const ignorePureComponents = configuration.ignorePureComponents || false;

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        /**
         * Checks whether a given array of statements is a single call of `super`.
         * @see eslint no-useless-constructor rule
         * @param body - An array of statements to check.
         * @returns `true` if the body is a single call of `super`.
         */
        function isSingleSuperCall(body: Node[]) {
            return (
                body.length === 1
                && body[0]!.type === 'ExpressionStatement'
                && astUtil.isCallExpression(body[0]!.expression)
                && body[0]!.expression.callee.type === 'Super'
            );
        }

        /**
         * Checks whether a given node is a pattern which doesn't have any side effects.
         * Default parameters and Destructuring parameters can have side effects.
         * @see eslint no-useless-constructor rule
         * @param node - A pattern node.
         * @returns `true` if the node doesn't have any side effects.
         */
        function isSimple(node: Node) {
            return node.type === 'Identifier' || node.type === 'RestElement';
        }

        /**
         * Checks whether a given array of expressions is `...arguments` or not.
         * `super(...arguments)` passes all arguments through.
         * @see eslint no-useless-constructor rule
         * @param superArgs - An array of expressions to check.
         * @returns `true` if the superArgs is `...arguments`.
         */
        function isSpreadArguments(superArgs: Node[]) {
            return (
                superArgs.length === 1
                && superArgs[0]!.type === 'SpreadElement'
                && superArgs[0]!.argument!.type === 'Identifier'
                && superArgs[0]!.argument!.name === 'arguments'
            );
        }

        /**
         * Checks whether given 2 nodes are identifiers which have the same name or not.
         * @see eslint no-useless-constructor rule
         * @param ctorParam - A node to check.
         * @param superArg - A node to check.
         * @returns `true` if the nodes are identifiers which have the same
         *      name.
         */
        function isValidIdentifierPair(ctorParam: Node, superArg: Node) {
            return (
                ctorParam.type === 'Identifier'
                && superArg.type === 'Identifier'
                && ctorParam.name === superArg.name
            );
        }

        /**
         * Checks whether given 2 nodes are a rest/spread pair which has the same values.
         * @see eslint no-useless-constructor rule
         * @param ctorParam - A node to check.
         * @param superArg - A node to check.
         * @returns `true` if the nodes are a rest/spread pair which has the
         *      same values.
         */
        function isValidRestSpreadPair(ctorParam: Node, superArg: Node) {
            return (
                ctorParam.type === 'RestElement'
                && superArg.type === 'SpreadElement'
                && isValidIdentifierPair(ctorParam.argument, superArg.argument)
            );
        }

        /**
         * Checks whether given 2 nodes have the same value or not.
         * @see eslint no-useless-constructor rule
         * @param ctorParam - A node to check.
         * @param superArg - A node to check.
         * @returns `true` if the nodes have the same value or not.
         */
        function isValidPair(ctorParam: Node, superArg: Node) {
            return (
                isValidIdentifierPair(ctorParam, superArg) || isValidRestSpreadPair(ctorParam, superArg)
            );
        }

        /**
         * Checks whether the parameters of a constructor and the arguments of `super()`
         * have the same values or not.
         * @see eslint no-useless-constructor rule
         * @param ctorParams - The parameters of a constructor to check.
         * @param superArgs - The arguments of `super()` to check.
         * @returns `true` if those have the same values.
         */
        function isPassingThrough(ctorParams: Node[], superArgs: Node[]) {
            if (ctorParams.length !== superArgs.length) {
                return false;
            }

            for (let i = 0; i < ctorParams.length; i += 1) {
                if (!isValidPair(ctorParams[i]!, superArgs[i]!)) {
                    return false;
                }
            }

            return true;
        }

        /**
         * Checks whether the constructor body is a redundant super call.
         * @see eslint no-useless-constructor rule
         * @param body - constructor body content.
         * @param ctorParams - The params to check against super call.
         * @returns true if the constructor body is redundant
         */
        function isRedundantSuperCall(body: Node[], ctorParams: Node[]) {
            return (
                isSingleSuperCall(body)
                && ctorParams.every(isSimple)
                && (isSpreadArguments((body[0] as Node<'ExpressionStatement'>).expression.arguments!)
                    || isPassingThrough(
                        ctorParams,
                        (body[0] as Node<'ExpressionStatement'>).expression.arguments!,
                    ))
            );
        }

        /**
         * Check if a given AST node have any other properties the ones available in stateless components
         * @param node The AST node being checked.
         * @returns True if the node has at least one other property, false if not.
         */
        function hasOtherProperties(node: Node) {
            const properties = astUtil.getComponentProperties(node);
            return properties.some((property) => {
                const name = astUtil.getPropertyName(property);
                const isDisplayName = name === 'displayName';
                const isPropTypes = name === 'propTypes' || (name === 'props' && property.typeAnnotation);
                const contextTypes = name === 'contextTypes';
                const defaultProps = name === 'defaultProps';
                const isUselessConstructor = property.kind === 'constructor'
                    && !!property.value!.body
                    && isRedundantSuperCall(property.value!.body.body as Node[], property.value!.params!);
                const isRender = name === 'render';
                return (
                    !isDisplayName
                    && !isPropTypes
                    && !contextTypes
                    && !defaultProps
                    && !isUselessConstructor
                    && !isRender
                );
            });
        }

        /**
         * Mark component as pure as declared
         * @param node The AST node being checked.
         */
        function markSCUAsDeclared(node: Node) {
            components.set(node, {
                hasSCU: true,
            });
        }

        /**
         * Mark childContextTypes as declared
         * @param node The AST node being checked.
         */
        function markChildContextTypesAsDeclared(node: Node) {
            components.set(node, {
                hasChildContextTypes: true,
            });
        }

        /**
         * Mark a setState as used
         * @param node The AST node being checked.
         */
        function markThisAsUsed(node: Node) {
            components.set(node, {
                useThis: true,
            });
        }

        /**
         * Mark a props or context as used
         * @param node The AST node being checked.
         */
        function markPropsOrContextAsUsed(node: Node) {
            components.set(node, {
                usePropsOrContext: true,
            });
        }

        /**
         * Mark a ref as used
         * @param node The AST node being checked.
         */
        function markRefAsUsed(node: Node) {
            components.set(node, {
                useRef: true,
            });
        }

        /**
         * Mark return as invalid
         * @param node The AST node being checked.
         */
        function markReturnAsInvalid(node: Node) {
            components.set(node, {
                invalidReturn: true,
            });
        }

        /**
         * Mark a ClassDeclaration as having used decorators
         * @param node The AST node being checked.
         */
        function markDecoratorsAsUsed(node: Node) {
            components.set(node, {
                useDecorators: true,
            });
        }

        /**
         * @param node The node to inspect.
         */
        function visitClass(node: Node) {
            if (ignorePureComponents && componentUtil.isPureComponent(node, context)) {
                markSCUAsDeclared(node);
            }

            if (node.decorators && node.decorators.length) {
                markDecoratorsAsUsed(node);
            }
        }

        return {
            ClassDeclaration: visitClass,
            ClassExpression: visitClass,

            // Mark `this` destructuring as a usage of `this`
            VariableDeclarator(node: Node<'VariableDeclarator'>) {
                // Ignore destructuring on other than `this`
                if (
                    !node.id
                    || node.id.type !== 'ObjectPattern'
                    || !node.init
                    || node.init.type !== 'ThisExpression'
                ) {
                    return;
                }
                // Ignore `props` and `context`
                const useThis = node.id.properties.some((property) => {
                    const name = astUtil.getPropertyName(property);
                    return name !== 'props' && name !== 'context';
                });
                if (!useThis) {
                    markPropsOrContextAsUsed(node);
                    return;
                }
                markThisAsUsed(node);
            },

            // Mark `this` usage
            MemberExpression(node: Node<'MemberExpression'>) {
                if (node.object.type !== 'ThisExpression') {
                    if (node.property && node.property.name === 'childContextTypes') {
                        const component = utils.getRelatedComponent(node);
                        if (!component) {
                            return;
                        }
                        markChildContextTypesAsDeclared(component.node);
                    }
                    return;
                    // Ignore calls to `this.props` and `this.context`
                }
                if (
                    (node.property.name || node.property.value) === 'props'
                    || (node.property.name || node.property.value) === 'context'
                ) {
                    markPropsOrContextAsUsed(node);
                    return;
                }
                markThisAsUsed(node);
            },

            // Mark `ref` usage
            JSXAttribute(node: Node<'JSXAttribute'>) {
                const name = getText(context, node.name);
                if (name !== 'ref') {
                    return;
                }
                markRefAsUsed(node);
            },

            // Mark `render` that do not return some JSX
            ReturnStatement(node: Node<'ReturnStatement'>) {
                let blockNode;
                let scope: Scope | null = getScope(context, node);
                while (scope) {
                    blockNode = scope.block && scope.block.parent;
                    if (
                        blockNode
                        && (blockNode.type === 'MethodDefinition' || blockNode.type === 'Property')
                    ) {
                        break;
                    }
                    scope = scope.upper;
                }
                const isRender = blockNode && blockNode.key && blockNode.key.name === 'render';
                const allowNull = testReactVersion(context, '>= 15.0.0');
                // Stateless components can return null since React 15
                const isReturningJSX = utils.isReturningJSX(node, !allowNull);
                const isReturningNull = node.argument
&& (node.argument.value === null
|| node.argument.value === false);
                if (
                    !isRender
                    || (allowNull && (isReturningJSX || isReturningNull))
                    || (!allowNull && isReturningJSX)
                ) {
                    return;
                }
                markReturnAsInvalid(node);
            },

            'Program:exit': function onProgramExit() {
                const list = components.list();
                values(list)
                    .filter(
                        (component) => !hasOtherProperties(component.node)
                            && !component.useThis
                            && !component.useRef
                            && !component.invalidReturn
                            && !component.hasChildContextTypes
                            && !component.useDecorators
                            && !component.hasSCU
                            && (componentUtil.isES5Component(component.node, context)
                                || componentUtil.isES6Component(component.node, context)),
                    )
                    .forEach((component) => {
                        report(context, messages.componentShouldBePure, 'componentShouldBePure', {
                            node: component.node,
                        });
                    });
            },
        };
    }),
};

export default rule;
