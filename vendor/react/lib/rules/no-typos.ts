/**
 * @file Prevent common casing typos
 */
import dependency0 from 'prop-types';
import dependency1 from '../util/Components';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/ast';
import dependency4 from '../util/componentUtil';
import dependency5 from '../util/report';
import dependency6 from '../util/lifecycleMethods';
import type { LegacyRule, Node } from '../../types';

const PROP_TYPES = Object.keys(dependency0);
const Components = dependency1;
const docsUrl = dependency2;
const astUtil = dependency3;
const componentUtil = dependency4;
const report = dependency5;
const lifecycleMethods = dependency6;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const STATIC_CLASS_PROPERTIES = ['propTypes', 'contextTypes', 'childContextTypes', 'defaultProps'];

const messages = {
    typoPropTypeChain: 'Typo in prop type chain qualifier: {{name}}',
    typoPropType: 'Typo in declared prop type: {{name}}',
    typoStaticClassProp: 'Typo in static class property declaration',
    typoPropDeclaration: 'Typo in property declaration',
    typoLifecycleMethod:
        'Typo in component lifecycle method declaration: {{actual}} should be {{expected}}',
    staticLifecycleMethod: 'Lifecycle method should be static: {{method}}',
    noPropTypesBinding: "`'prop-types'` imported without a local `PropTypes` binding.",
    noReactBinding: "`'react'` imported without a local `React` binding.",
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow common typos',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('no-typos'),
        },

        messages,

        schema: [],
    },

    create: Components.detect((context, components, utils) => {
        let propTypesPackageName: string | null = null;
        let reactPackageName: string | null = null;

        /**
         * @param node The node to inspect.
         */
        function checkValidPropTypeQualifier(node: Node) {
            if (node.name !== 'isRequired') {
                report(context, messages.typoPropTypeChain, 'typoPropTypeChain', {
                    node,
                    data: { name: node.name },
                });
            }
        }

        /**
         * @param node The node to inspect.
         */
        function checkValidPropType(node: Node) {
            if (node.name && !PROP_TYPES.some((propTypeName) => propTypeName === node.name)) {
                report(context, messages.typoPropType, 'typoPropType', {
                    node,
                    data: { name: node.name },
                });
            }
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isPropTypesPackage(node: Node) {
            return (
                (node.type === 'Identifier' && node.name === propTypesPackageName)
                || (node.type === 'MemberExpression'
                    && node.property.name === 'PropTypes'
                    && node.object.name === reactPackageName)
            );
        }
        const validators = {
            /**
             * @param node The node to inspect.
             */
            checkValidCallExpression(node: Node) {
                const { callee } = node;
                if (callee!.type === 'MemberExpression' && callee!.property!.name === 'shape') {
                    validators.checkValidPropObject(node.arguments![0]!);
                } else if (
                    callee!.type === 'MemberExpression'
                    && callee!.property!.name === 'oneOfType'
                ) {
                    const args = node.arguments![0];
                    if (args && args.type === 'ArrayExpression') {
                        args.elements.forEach((el) => {
                            validators.checkValidProp(el!);
                        });
                    }
                }
            },

            /**
             * @param node The node to inspect.
             */
            checkValidProp(node: Node) {
                if ((!propTypesPackageName && !reactPackageName) || !node) {
                    return;
                }

                if (node.type === 'MemberExpression') {
                    if (
                        node.object.type === 'MemberExpression'
                        && isPropTypesPackage(node.object.object)
                    ) {
                        // PropTypes.myProp.isRequired
                        checkValidPropType(node.object.property);
                        checkValidPropTypeQualifier(node.property);
                    } else if (isPropTypesPackage(node.object) && node.property.name !== 'isRequired') {
                        // PropTypes.myProp
                        checkValidPropType(node.property);
                    } else if (astUtil.isCallExpression(node.object)) {
                        checkValidPropTypeQualifier(node.property);
                        validators.checkValidCallExpression(node.object);
                    }
                } else if (astUtil.isCallExpression(node)) {
                    validators.checkValidCallExpression(node);
                }
            },

            /**
             * @param node The node to inspect.
             */
            checkValidPropObject(node: Node | null | undefined) {
                if (node && node.type === 'ObjectExpression') {
                    node.properties.forEach((prop) => validators.checkValidProp(prop.value!));
                }
            },
        };

        /**
         * @param propertyValue The property value value.
         * @param propertyKey The property key value.
         * @param isClassProperty The is class property value.
         */
        function reportErrorIfPropertyCasingTypo(
            propertyValue: Node | null | undefined,
            propertyKey: Node,
            isClassProperty?: boolean,
        ) {
            const propertyName = propertyKey.name as string | undefined;
            if (
                propertyName === 'propTypes'
                || propertyName === 'contextTypes'
                || propertyName === 'childContextTypes'
            ) {
                validators.checkValidPropObject(propertyValue);
            }
            STATIC_CLASS_PROPERTIES.forEach((CLASS_PROP) => {
                if (
                    propertyName
                    && CLASS_PROP.toLowerCase() === propertyName.toLowerCase()
                    && CLASS_PROP !== propertyName
                ) {
                    const messageId = isClassProperty ? 'typoStaticClassProp' : 'typoPropDeclaration';
                    report(context, messages[messageId], messageId, {
                        node: propertyKey,
                    });
                }
            });
        }

        /**
         * @param node The node to inspect.
         */
        function reportErrorIfLifecycleMethodCasingTypo(node: Node) {
            const { key } = node;
            let nodeKeyName = key!.name;
            if (key!.type === 'Literal') {
                nodeKeyName = key!.value as string;
            }
            if (key!.type === 'PrivateName' || (node.computed && typeof nodeKeyName !== 'string')) {
                return;
            }

            lifecycleMethods.static.forEach((method) => {
                if (!node.static && nodeKeyName && nodeKeyName.toLowerCase() === method.toLowerCase()) {
                    report(context, messages.staticLifecycleMethod, 'staticLifecycleMethod', {
                        node,
                        data: {
                            method: nodeKeyName,
                        },
                    });
                }
            });

            lifecycleMethods.instance.concat(lifecycleMethods.static).forEach((method) => {
                if (
                    nodeKeyName
                    && method.toLowerCase() === nodeKeyName.toLowerCase()
                    && method !== nodeKeyName
                ) {
                    report(context, messages.typoLifecycleMethod, 'typoLifecycleMethod', {
                        node,
                        data: { actual: nodeKeyName, expected: method },
                    });
                }
            });
        }

        return {
            ImportDeclaration(node: Node<'ImportDeclaration'>) {
                if (node.source && node.source.value === 'prop-types') {
                    // import PropType from "prop-types"
                    if (node.specifiers.length > 0) {
                        propTypesPackageName = node.specifiers[0]!.local.name;
                    } else {
                        report(context, messages.noPropTypesBinding, 'noPropTypesBinding', {
                            node,
                        });
                    }
                } else if (node.source && node.source.value === 'react') {
                    // import { PropTypes } from "react"
                    if (node.specifiers.length > 0) {
                        reactPackageName = node.specifiers[0]!.local.name;
                        // guard against accidental anonymous `import "react"`
                    } else {
                        report(context, messages.noReactBinding, 'noReactBinding', {
                            node,
                        });
                    }
                    if (node.specifiers.length >= 1) {
                        const propTypesSpecifier = node.specifiers.find(
                            (specifier) => specifier.imported && specifier.imported.name === 'PropTypes',
                        );
                        if (propTypesSpecifier) {
                            propTypesPackageName = propTypesSpecifier.local.name;
                        }
                    }
                }
            },

            'ClassProperty, PropertyDefinition': function onClassPropertyPropertyDefinition(
                node: Node<'ClassProperty' | 'PropertyDefinition'>,
            ) {
                if (!node.static || !componentUtil.isES6Component(node.parent.parent, context)) {
                    return;
                }

                reportErrorIfPropertyCasingTypo(node.value, node.key, true);
            },

            MemberExpression(node: Node<'MemberExpression'>) {
                const propertyName = node.property.name;

                if (
                    !propertyName
                    || STATIC_CLASS_PROPERTIES.map((prop) => prop.toLocaleLowerCase()).indexOf(
                        propertyName.toLowerCase(),
                    ) === -1
                ) {
                    return;
                }

                const relatedComponent = utils.getRelatedComponent(node);

                if (
                    relatedComponent
                    && (componentUtil.isES6Component(relatedComponent.node, context)
                        || (relatedComponent.node.type !== 'ClassDeclaration'
                            && utils.isReturningJSX(relatedComponent.node)))
                    && node.parent
                    && node.parent.type === 'AssignmentExpression'
                    && node.parent.right
                ) {
                    reportErrorIfPropertyCasingTypo(node.parent.right, node.property, true);
                }
            },

            MethodDefinition(node: Node<'MethodDefinition'>) {
                if (!componentUtil.isES6Component(node.parent.parent, context)) {
                    return;
                }

                reportErrorIfLifecycleMethodCasingTypo(node);
            },

            ObjectExpression(node: Node<'ObjectExpression'>) {
                const component = componentUtil.isES5Component(node, context) && components.get(node);

                if (!component) {
                    return;
                }

                node.properties
                    .filter((property) => property.type !== 'SpreadElement')
                    .forEach((property) => {
                        reportErrorIfPropertyCasingTypo(property.value, property.key!, false);
                        reportErrorIfLifecycleMethodCasingTypo(property);
                    });
            },
        };
    }),
};

export default rule;
