/**
 * @file Enforces consistent naming for boolean props
 * @author Ev Haus
 */
import dependency0 from 'array.prototype.flatmap';
import dependency1 from 'object.values';
import type { Component } from '../../component-types';
import dependency2 from '../util/Components';
import dependency3 from '../util/props';
import dependency4 from '../util/ast';
import dependency5 from '../util/docsUrl';
import dependency6 from '../util/propWrapper';
import dependency7 from '../util/report';
import dependency8 from '../util/eslint';
import type { LegacyRule, Node } from '../../types';

const flatMap = dependency0;
const values = dependency1;

const Components = dependency2;
const propsUtil = dependency3;
const astUtil = dependency4;
const docsUrl = dependency5;
const propWrapperUtil = dependency6;
const report = dependency7;
const eslintUtil = dependency8;

const { getSourceCode } = eslintUtil;
const { getText } = eslintUtil;

/**
 * Checks if prop is nested
 * @param prop Property object, single prop type declaration
 * @returns The result of this check.
 */
function nestedPropTypes(prop: Node): prop is Node<'Property'> & { value: Node<'CallExpression'> } {
    return prop.type === 'Property' && astUtil.isCallExpression(prop.value);
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    patternMismatch: 'Prop name `{{propName}}` doesn’t match rule `{{pattern}}`',
};

const rule: LegacyRule<
    [{ propTypeNames?: string[]; rule?: string; message?: string; validateNested?: boolean }?]
> = {
    meta: {
        docs: {
            category: 'Stylistic Issues',
            description: 'Enforces consistent naming for boolean props',
            recommended: false,
            url: docsUrl('boolean-prop-naming'),
        },

        messages,

        schema: [
            {
                additionalProperties: false,
                properties: {
                    propTypeNames: {
                        items: {
                            type: 'string',
                        },
                        minItems: 1,
                        type: 'array',
                        uniqueItems: true,
                    },
                    rule: {
                        default: '^(is|has)[A-Z]([A-Za-z0-9]?)+',
                        minLength: 1,
                        type: 'string',
                    },
                    message: {
                        minLength: 1,
                        type: 'string',
                    },
                    validateNested: {
                        default: false,
                        type: 'boolean',
                    },
                },
                type: 'object',
            },
        ],
    },

    create: Components.detect((context, components, utils) => {
        const config = context.options[0] || {};
        const pattern = config.rule ? new RegExp(config.rule) : null;
        const propTypeNames = config.propTypeNames || ['bool'];

        // Remembers all Flowtype object definitions
        const objectTypeAnnotations = new Map<string | undefined, Node[]>();

        /**
         * Returns the prop key to ensure we handle the following cases:
         * propTypes: {
         *   full: React.PropTypes.bool,
         *   short: PropTypes.bool,
         *   direct: bool,
         *   required: PropTypes.bool.isRequired
         * }
         * @param node The node we're getting the name of
         * @returns The result of this check.
         */
        function getPropKey(node: Node): string | null | undefined {
            // Check for `ExperimentalSpreadProperty` (eslint 3/4) and `SpreadElement` (eslint 5)
            // so we can skip validation of those fields.
            // Otherwise it will look for `node.value.property` which doesn't exist and breaks eslint.
            if (node.type === 'ExperimentalSpreadProperty' || node.type === 'SpreadElement') {
                return null;
            }
            // Only property declarations reach this helper; their values are AST nodes.
            const value = node.value as Node<'MemberExpression' | 'Identifier'> | undefined;
            if (value && value.property) {
                const { name } = value.property;
                if (name === 'isRequired') {
                    if (value.object && value.object.property) {
                        return value.object.property.name;
                    }
                    return null;
                }
                return name;
            }
            if (value && value.type === 'Identifier') {
                return value.name;
            }
            return null;
        }

        /**
         * Returns the name of the given node (prop)
         * @param node The node we're getting the name of
         * @returns The result of this check.
         */
        function getPropName(node: Node) {
            // Due to this bug https://github.com/babel/babel-eslint/issues/307
            // we can't get the name of the Flow object key name. So we have
            // to hack around it for now.
            if (node.type === 'ObjectTypeProperty') {
                return getSourceCode(context).getFirstToken(node).value;
            }

            return node.key!.name;
        }

        /**
         * Checks if prop is declared in flow way
         * @param prop Property object, single prop type declaration
         * @returns The result of this check.
         */
        function flowCheck(prop: Node) {
            return (
                prop.type === 'ObjectTypeProperty'
                && prop.value.type === 'BooleanTypeAnnotation'
                && pattern!.test(getPropName(prop)!) === false
            );
        }

        /**
         * Checks if prop is declared in regular way
         * @param prop Property object, single prop type declaration
         * @returns The result of this check.
         */
        function regularCheck(prop: Node) {
            const propKey = getPropKey(prop);
            return (
                propKey
                && propTypeNames.indexOf(propKey) >= 0
                && pattern!.test(getPropName(prop)!) === false
            );
        }

        /**
         * @returns The result of this check.
         * @param prop The prop value.
         */
        function tsCheck(prop: Node) {
            if (prop.type !== 'TSPropertySignature') {
                return false;
            }
            const { typeAnnotation } = prop.typeAnnotation || {};
            return (
                typeAnnotation
                && typeAnnotation.type === 'TSBooleanKeyword'
                && pattern!.test(getPropName(prop)!) === false
            );
        }

        /**
         * Runs recursive check on all proptypes
         * @param proptypes A list of Property object (for each proptype defined)
         * @param addInvalidProp callback to run for each error
         */
        function runCheck(proptypes: Node[] | undefined, addInvalidProp: (prop: Node) => void) {
            if (proptypes) {
                proptypes.forEach((prop) => {
                    if (config.validateNested && nestedPropTypes(prop)) {
                        runCheck(prop.value.arguments[0]!.properties, addInvalidProp);
                        return;
                    }
                    if (flowCheck(prop) || regularCheck(prop) || tsCheck(prop)) {
                        addInvalidProp(prop);
                    }
                });
            }
        }

        /**
         * Checks and mark props with invalid naming
         * @param node The component node we're testing
         * @param proptypes A list of Property object (for each proptype defined)
         */
        function validatePropNaming(node: Node, proptypes: Node[] | undefined) {
            const component = components.get(node);
            const invalidProps = component?.invalidProps || [];

            runCheck(proptypes, (prop) => {
                invalidProps.push(prop);
            });

            components.set(node, {
                invalidProps,
            });
        }

        /**
         * Reports invalid prop naming
         * @param component The component to process
         */
        function reportInvalidNaming(component: Component) {
            component.invalidProps!.forEach((propNode) => {
                const propName = getPropName(propNode);
                report(
                    context,
                    config.message || messages.patternMismatch,
                    !config.message && 'patternMismatch',
                    {
                        node: propNode,
                        data: {
                            component: propName,
                            propName,
                            pattern: config.rule,
                        },
                    },
                );
            });
        }

        /**
         * @param node The node to inspect.
         * @param args The args value.
         */
        function checkPropWrapperArguments(node: Node, args: Node[]) {
            if (!node || !Array.isArray(args)) {
                return;
            }
            args.filter((arg) => arg.type === 'ObjectExpression').forEach(
                (object) => validatePropNaming(node, object.properties),
            );
        }

        /**
         * @returns The result of this check.
         * @param component The component value.
         */
        function getComponentTypeAnnotation(component: Component) {
            // If this is a functional component that uses a global type, check it
            if (
                (component.node.type === 'FunctionDeclaration'
                    || component.node.type === 'ArrowFunctionExpression')
                && component.node.params
                && component.node.params.length > 0
                && component.node.params[0]!.typeAnnotation
            ) {
                return component.node.params[0]!.typeAnnotation.typeAnnotation;
            }

            if (
                !component.node.parent
                || component.node.parent.type !== 'VariableDeclarator'
                || !component.node.parent.id
                || component.node.parent.id.type !== 'Identifier'
                || !component.node.parent.id.typeAnnotation
                || !component.node.parent.id.typeAnnotation.typeAnnotation
            ) {
                return undefined;
            }

            const annotationTypeArguments = propsUtil.getTypeArguments(
                component.node.parent.id.typeAnnotation.typeAnnotation,
            );
            if (
                annotationTypeArguments
                && (annotationTypeArguments.type === 'TSTypeParameterInstantiation'
                    || annotationTypeArguments.type === 'TypeParameterInstantiation')
            ) {
                return annotationTypeArguments.params.find(
                    (param) => param.type === 'TSTypeReference' || param.type === 'GenericTypeAnnotation',
                );
            }

            return undefined;
        }

        /**
         * @param identifier The identifier value.
         * @param node The node to inspect.
         */
        function findAllTypeAnnotations(identifier: Node<'Identifier'>, node: Node) {
            if (
                node.type === 'TSTypeLiteral'
                || node.type === 'ObjectTypeAnnotation'
                || node.type === 'TSInterfaceBody'
            ) {
                const currentNode = ([] as Node[]).concat(
                    objectTypeAnnotations.get(identifier.name) || [],
                    node,
                );
                objectTypeAnnotations.set(identifier.name, currentNode);
            } else if (
                node.type === 'TSParenthesizedType'
                && (node.typeAnnotation.type === 'TSIntersectionType'
                    || node.typeAnnotation.type === 'TSUnionType')
            ) {
                node.typeAnnotation.types.forEach((type) => {
                    findAllTypeAnnotations(identifier, type);
                });
            } else if (
                node.type === 'TSIntersectionType'
                || node.type === 'TSUnionType'
                || node.type === 'IntersectionTypeAnnotation'
                || node.type === 'UnionTypeAnnotation'
            ) {
                node.types.forEach((type) => {
                    findAllTypeAnnotations(identifier, type);
                });
            }
        }

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        return {
            'ClassProperty, PropertyDefinition': function onClassPropertyPropertyDefinition(
                node: Node<'ClassProperty' | 'PropertyDefinition'>,
            ) {
                if (!pattern || !propsUtil.isPropTypesDeclaration(node)) {
                    return;
                }
                if (
                    node.value
                    && astUtil.isCallExpression(node.value)
                    && propWrapperUtil.isPropWrapperFunction(context, getText(context, node.value.callee))
                ) {
                    checkPropWrapperArguments(node, node.value.arguments);
                }
                if (node.value && node.value.properties) {
                    validatePropNaming(node, node.value.properties);
                }
                if (node.typeAnnotation && node.typeAnnotation.typeAnnotation) {
                    validatePropNaming(node, node.typeAnnotation.typeAnnotation.properties);
                }
            },

            MemberExpression(node: Node<'MemberExpression'>) {
                if (!pattern || !propsUtil.isPropTypesDeclaration(node)) {
                    return;
                }
                const component = utils.getRelatedComponent(node);
                if (!component || !node.parent.right) {
                    return;
                }
                const { right } = node.parent;
                if (
                    astUtil.isCallExpression(right)
                    && propWrapperUtil.isPropWrapperFunction(context, getText(context, right.callee))
                ) {
                    checkPropWrapperArguments(component.node, right.arguments);
                    return;
                }
                validatePropNaming(component.node, node.parent.right.properties);
            },

            ObjectExpression(node: Node<'ObjectExpression'>) {
                if (!pattern) {
                    return;
                }

                // Search for the proptypes declaration
                node.properties.forEach((property) => {
                    if (!propsUtil.isPropTypesDeclaration(property)) {
                        return;
                    }
                    validatePropNaming(node, property.value!.properties);
                });
            },

            TypeAlias(node: Node<'TypeAlias'>) {
                findAllTypeAnnotations(node.id, node.right);
            },

            TSTypeAliasDeclaration(node: Node<'TSTypeAliasDeclaration'>) {
                findAllTypeAnnotations(node.id, node.typeAnnotation);
            },

            TSInterfaceDeclaration(node: Node<'TSInterfaceDeclaration'>) {
                findAllTypeAnnotations(node.id, node.body);
            },

            'Program:exit': function onProgramExit() {
                if (!pattern) {
                    return;
                }

                values(components.list()).forEach((component) => {
                    const annotation = getComponentTypeAnnotation(component);

                    if (annotation) {
                        let propType: Node | (Node | undefined)[] | undefined;
                        if (annotation.type === 'GenericTypeAnnotation') {
                            propType = objectTypeAnnotations.get(annotation.id.name);
                        } else if (
                            annotation.type === 'ObjectTypeAnnotation'
                            || annotation.type === 'TSTypeLiteral'
                        ) {
                            propType = annotation;
                        } else if (annotation.type === 'TSTypeReference') {
                            propType = objectTypeAnnotations.get(annotation.typeName.name);
                        } else if (annotation.type === 'TSIntersectionType') {
                            propType = flatMap<Node, Node | undefined>(annotation.types, (type) => (type.type === 'TSTypeReference'
                                ? objectTypeAnnotations.get(type.typeName.name)
                                : type));
                        }

                        if (propType) {
                            ([] as (Node | undefined)[])
                                .concat(propType)
                                .filter((prop): prop is Node => Boolean(prop))
                                .forEach((prop) => {
                                    validatePropNaming(
                                        component.node,
                                        prop.properties
                                            || prop.members
                                            || (prop.body as Node[] | undefined),
                                    );
                                });
                        }
                    }

                    if (component.invalidProps && component.invalidProps.length > 0) {
                        reportInvalidNaming(component);
                    }
                });

                // Reset cache
                objectTypeAnnotations.clear();
            },
        };
    }),
};

export default rule;
