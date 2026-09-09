/**
 * @file Prevent missing displayName in a React component definition
 * @author Yannick Croissant
 */
import dependency0 from 'object.values';
import { filter as dependency1, forEach as dependency2 } from '../../compat/iterators';
import type { Component } from '../../component-types';
import dependency3 from '../util/Components';
import dependency4 from '../util/isCreateContext';
import dependency5 from '../util/ast';
import dependency6 from '../util/componentUtil';
import dependency7 from '../util/docsUrl';
import dependency8 from '../util/version';
import dependency9 from '../util/props';
import dependency10 from '../util/report';
import type { LegacyRule, Node } from '../../types';

const values = dependency0;
const filter = dependency1;
const forEach = dependency2;

const Components = dependency3;
const isCreateContext = dependency4;
const astUtil = dependency5;
const componentUtil = dependency6;
const docsUrl = dependency7;
const { testReactVersion } = dependency8;
const propsUtil = dependency9;
const report = dependency10;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noDisplayName: 'Component definition is missing display name',
    noContextDisplayName: 'Context definition is missing display name',
};

const rule: LegacyRule<[{ ignoreTranspilerName?: boolean; checkContextObjects?: boolean }?]> = {
    meta: {
        docs: {
            description: 'Disallow missing displayName in a React component definition',
            category: 'Best Practices',
            recommended: true,
            url: docsUrl('display-name'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    ignoreTranspilerName: {
                        type: 'boolean',
                    },
                    checkContextObjects: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create: Components.detect((context, components, utils) => {
        const config = context.options[0] || {};
        const ignoreTranspilerName = config.ignoreTranspilerName || false;
        const checkContextObjects = (config.checkContextObjects || false) && testReactVersion(context, '>= 16.3.0');

        const contextObjects = new Map<string | undefined, { node: Node; hasDisplayName: boolean }>();

        /**
         * Mark a prop type as declared
         * @param node The AST node being checked.
         */
        function markDisplayNameAsDeclared(node: Node) {
            components.set(node, {
                hasDisplayName: true,
            });
        }

        /**
         * Checks if React.forwardRef is nested inside React.memo
         * @param node The AST node being checked.
         * @returns True if React.forwardRef is nested inside React.memo, false if not.
         */
        function isNestedMemo(node: Node) {
            return (
                astUtil.isCallExpression(node)
                && node.arguments
                && astUtil.isCallExpression(node.arguments[0])
                && utils.isPragmaComponentWrapper(node)
            );
        }

        /**
         * Reports missing display name for a given component
         * @param component The component to process
         */
        function reportMissingDisplayName(component: Component) {
            if (
                testReactVersion(context, '^0.14.10 || ^15.7.0 || >= 16.12.0')
                && isNestedMemo(component.node)
            ) {
                return;
            }

            report(context, messages.noDisplayName, 'noDisplayName', {
                node: component.node,
            });
        }

        /**
         * Reports missing display name for a given context object
         * @param contextObj The context object to process
         * @param contextObj.node The value to inspect.
         */
        function reportMissingContextDisplayName(contextObj: { node: Node }) {
            report(context, messages.noContextDisplayName, 'noContextDisplayName', {
                node: contextObj.node,
            });
        }

        /**
         * Checks if the component have a name set by the transpiler
         * @param node The AST node being checked.
         * @returns True if component has a name, false if not.
         */
        function hasTranspilerName(node: Node) {
            const namedObjectAssignment = node.type === 'ObjectExpression'
                && node.parent
                && node.parent.parent
                && node.parent.parent.type === 'AssignmentExpression'
                && (!node.parent.parent.left.object
                    || node.parent.parent.left.object.name !== 'module'
                    || node.parent.parent.left.property.name !== 'exports');
            const namedObjectDeclaration = node.type === 'ObjectExpression'
                && node.parent
                && node.parent.parent
                && node.parent.parent.type === 'VariableDeclarator';
            const namedClass = (node.type === 'ClassDeclaration' || node.type === 'ClassExpression')
                && node.id
                && !!node.id.name;

            const namedFunctionDeclaration = (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression')
                && node.id
                && !!node.id.name;

            const namedFunctionExpression = astUtil.isFunctionLikeExpression(node)
                && node.parent
                && (node.parent.type === 'VariableDeclarator'
                    || node.parent.type === 'Property'
                    || node.parent.method === true)
                && (!node.parent.parent || !componentUtil.isES5Component(node.parent.parent, context));

            if (
                namedObjectAssignment
                || namedObjectDeclaration
                || namedClass
                || namedFunctionDeclaration
                || namedFunctionExpression
            ) {
                return true;
            }
            return false;
        }

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        return {
            ExpressionStatement(node: Node<'ExpressionStatement'>) {
                if (checkContextObjects && isCreateContext(node)) {
                    contextObjects.set(node.expression.left!.name, { node, hasDisplayName: false });
                }
            },
            VariableDeclarator(node: Node<'VariableDeclarator'>) {
                if (checkContextObjects && isCreateContext(node)) {
                    contextObjects.set(node.id.name, { node, hasDisplayName: false });
                }
            },
            'ClassProperty, PropertyDefinition': function onClassPropertyPropertyDefinition(
                node: Node<'ClassProperty' | 'PropertyDefinition'>,
            ) {
                if (!propsUtil.isDisplayNameDeclaration(node)) {
                    return;
                }
                markDisplayNameAsDeclared(node);
            },

            MemberExpression(node: Node<'MemberExpression'>) {
                if (!propsUtil.isDisplayNameDeclaration(node.property)) {
                    return;
                }
                if (
                    checkContextObjects
                    && node.object
                    && node.object.name
                    && contextObjects.has(node.object.name)
                ) {
                    contextObjects.get(node.object.name)!.hasDisplayName = true;
                }
                const component = utils.getRelatedComponent(node);
                if (!component) {
                    return;
                }
                markDisplayNameAsDeclared(astUtil.unwrapTSAsExpression(component.node));
            },

            'FunctionExpression, FunctionDeclaration, ArrowFunctionExpression':
                function onFunctionExpressionFunctionDeclarationArrowFunctionExpression(
                    node: Node<'FunctionExpression' | 'FunctionDeclaration' | 'ArrowFunctionExpression'>,
                ) {
                    if (ignoreTranspilerName || !hasTranspilerName(node)) {
                        return;
                    }
                    if (components.get(node)) {
                        markDisplayNameAsDeclared(node);
                    }
                },

            MethodDefinition(node: Node<'MethodDefinition'>) {
                if (!propsUtil.isDisplayNameDeclaration(node.key)) {
                    return;
                }
                markDisplayNameAsDeclared(node);
            },

            'ClassExpression, ClassDeclaration': function onClassExpressionClassDeclaration(
                node: Node<'ClassExpression' | 'ClassDeclaration'>,
            ) {
                if (ignoreTranspilerName || !hasTranspilerName(node)) {
                    return;
                }
                markDisplayNameAsDeclared(node);
            },

            ObjectExpression(node: Node<'ObjectExpression'>) {
                if (!componentUtil.isES5Component(node, context)) {
                    return;
                }
                if (ignoreTranspilerName || !hasTranspilerName(node)) {
                    // Search for the displayName declaration
                    node.properties.forEach((property) => {
                        if (!property.key || !propsUtil.isDisplayNameDeclaration(property.key)) {
                            return;
                        }
                        markDisplayNameAsDeclared(node);
                    });
                    return;
                }
                markDisplayNameAsDeclared(node);
            },

            CallExpression(node: Node<'CallExpression'>) {
                if (!utils.isPragmaComponentWrapper(node)) {
                    return;
                }

                if (node.arguments.length > 0 && astUtil.isFunctionLikeExpression(node.arguments[0]!)) {
                    // Skip over React.forwardRef declarations that are embedded within
                    // a React.memo i.e. React.memo(React.forwardRef(/* ... */))
                    // This means that we raise a single error for the call to React.memo
                    // instead of one for React.memo and one for React.forwardRef
                    const isWrappedInAnotherPragma = utils.getPragmaComponentWrapper(node);
                    if (
                        !isWrappedInAnotherPragma
                        && (ignoreTranspilerName || !hasTranspilerName(node.arguments[0]))
                    ) {
                        return;
                    }

                    if (components.get(node)) {
                        markDisplayNameAsDeclared(node);
                    }
                }
            },

            'Program:exit': function onProgramExit() {
                const list = components.list();
                // Report missing display name for all components
                values(list)
                    .filter((component) => !component.hasDisplayName)
                    .forEach((component) => {
                        reportMissingDisplayName(component);
                    });
                if (checkContextObjects) {
                    // Report missing display name for all context objects
                    forEach(
                        filter(contextObjects.values(), (v) => !v.hasDisplayName),
                        (contextObj) => reportMissingContextDisplayName(contextObj),
                    );
                }
            },
        };
    }),
};

export default rule;
