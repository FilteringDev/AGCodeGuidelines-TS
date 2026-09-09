import type { LegacyRule, Node } from '../../types';
/**
 * @file Forbid certain propTypes
 */
import dependency0 from '../util/variable';
import dependency1 from '../util/props';
import dependency2 from '../util/ast';
import dependency3 from '../util/docsUrl';
import dependency4 from '../util/propWrapper';
import dependency5 from '../util/report';
import dependency6 from '../util/eslint';

const variableUtil = dependency0;
const propsUtil = dependency1;
const astUtil = dependency2;
const docsUrl = dependency3;
const propWrapperUtil = dependency4;
const report = dependency5;
const { getText } = dependency6;

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const DEFAULTS = ['any', 'array', 'object'];

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    forbiddenPropType: 'Prop type "{{target}}" is forbidden',
};

const rule: LegacyRule<
    [
        {
            forbid?: string[];
            checkContextTypes?: boolean;
            checkChildContextTypes?: boolean;
            [key: string]: unknown;
        }?,
    ]
> = {
    meta: {
        docs: {
            description: 'Disallow certain propTypes',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('forbid-prop-types'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    forbid: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    checkContextTypes: {
                        type: 'boolean',
                    },
                    checkChildContextTypes: {
                        type: 'boolean',
                    },
                },
                additionalProperties: true,
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || {};
        const checkContextTypes = configuration.checkContextTypes || false;
        const checkChildContextTypes = configuration.checkChildContextTypes || false;
        let propTypesPackageName: string | null = null;
        let reactPackageName: string | null = null;
        let isForeignPropTypesPackage = false;

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isPropTypesPackage(node: Node) {
            return (
                (node.type === 'Identifier'
                    && (node.name === null
                        || node.name === propTypesPackageName
                        || !isForeignPropTypesPackage))
                || (node.type === 'MemberExpression'
                    && (node.object.name === null
                        || node.object.name === reactPackageName
                        || !isForeignPropTypesPackage))
            );
        }

        /**
         * @returns The result of this check.
         * @param type The node or option kind.
         */
        function isForbidden(type: string) {
            const forbid = configuration.forbid || DEFAULTS;
            return forbid.indexOf(type) >= 0;
        }

        /**
         * @param type The node or option kind.
         * @param declaration The declaration value.
         * @param target The target value.
         */
        function reportIfForbidden(
            type: string | undefined,
            declaration: Node,
            target: string | undefined,
        ) {
            if (isForbidden(type!)) {
                report(context, messages.forbiddenPropType, 'forbiddenPropType', {
                    node: declaration,
                    data: {
                        target,
                    },
                });
            }
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function shouldCheckContextTypes(node: Node) {
            if (checkContextTypes && propsUtil.isContextTypesDeclaration(node)) {
                return true;
            }
            return false;
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function shouldCheckChildContextTypes(node: Node) {
            if (checkChildContextTypes && propsUtil.isChildContextTypesDeclaration(node)) {
                return true;
            }
            return false;
        }

        /**
         * Checks if propTypes declarations are forbidden
         * @param declarations The array of AST nodes being checked.
         */
        function checkProperties(declarations: Node[] | false | undefined) {
            if (declarations) {
                declarations.forEach((declaration) => {
                    if (declaration.type !== 'Property') {
                        return;
                    }
                    let target;
                    let { value }: { value: Node } = declaration;
                    if (
                        value.type === 'MemberExpression'
                        && value.property
                        && value.property.name
                        && value.property.name === 'isRequired'
                    ) {
                        value = value.object;
                    }
                    if (astUtil.isCallExpression(value)) {
                        if (!isPropTypesPackage(value.callee)) {
                            return;
                        }
                        value.arguments.forEach((arg) => {
                            const name = arg.type === 'MemberExpression' ? arg.property.name : arg.name;
                            reportIfForbidden(name, declaration, name);
                        });
                        value = value.callee;
                    }
                    if (!isPropTypesPackage(value)) {
                        return;
                    }
                    if (value.property) {
                        target = value.property.name;
                    } else if (value.type === 'Identifier') {
                        target = value.name;
                    }
                    reportIfForbidden(target, declaration, target);
                });
            }
        }

        /**
         * @param node The node to inspect.
         */
        function checkNode(node: Node | false | null | undefined) {
            if (!node) {
                return;
            }

            if (node.type === 'ObjectExpression') {
                checkProperties(node.properties);
            } else if (node.type === 'Identifier') {
                const propTypesObject = variableUtil.findVariableByName(context, node, node.name);
                if (propTypesObject && propTypesObject.properties) {
                    checkProperties(propTypesObject.properties);
                }
            } else if (astUtil.isCallExpression(node)) {
                const innerNode = node.arguments && node.arguments[0];
                if (
                    propWrapperUtil.isPropWrapperFunction(context, getText(context, node.callee))
                    && innerNode
                ) {
                    checkNode(innerNode);
                }
            }
        }

        return {
            ImportDeclaration(node: Node<'ImportDeclaration'>) {
                if (node.source && node.source.value === 'prop-types') {
                    // import PropType from "prop-types"
                    if (node.specifiers.length > 0) {
                        propTypesPackageName = node.specifiers[0]!.local.name;
                    }
                } else if (node.source && node.source.value === 'react') {
                    // import { PropTypes } from "react"
                    if (node.specifiers.length > 0) {
                        reactPackageName = node.specifiers[0]!.local.name;
                        // guard against accidental anonymous `import "react"`
                    }
                    if (node.specifiers.length >= 1) {
                        const propTypesSpecifier = node.specifiers.find(
                            (specifier) => 'imported' in specifier
                                && specifier.imported
                                && 'name' in specifier.imported
                                && specifier.imported.name === 'PropTypes',
                        );
                        if (propTypesSpecifier) {
                            propTypesPackageName = propTypesSpecifier.local.name;
                        }
                    }
                } else if (node.specifiers.some((x) => x.local.name === 'PropTypes')) {
                    // This package is not imported from "react" or "prop-types".
                    isForeignPropTypesPackage = true;
                }
            },

            'ClassProperty, PropertyDefinition': function onClassPropertyPropertyDefinition(
                node: Node<'ClassProperty' | 'PropertyDefinition'>,
            ) {
                if (
                    !propsUtil.isPropTypesDeclaration(node)
                    && !isPropTypesPackage(node)
                    && !shouldCheckContextTypes(node)
                    && !shouldCheckChildContextTypes(node)
                ) {
                    return;
                }
                checkNode(node.value!);
            },

            MemberExpression(node: Node<'MemberExpression'>) {
                if (
                    !propsUtil.isPropTypesDeclaration(node)
                    && !isPropTypesPackage(node)
                    && !shouldCheckContextTypes(node)
                    && !shouldCheckChildContextTypes(node)
                ) {
                    return;
                }

                checkNode('right' in node.parent && node.parent.right);
            },

            CallExpression(node: Node<'CallExpression'>) {
                if (
                    node.callee.type === 'MemberExpression'
                    && node.callee.object
                    && !isPropTypesPackage(node.callee.object)
                    && !propsUtil.isPropTypesDeclaration(node.callee)
                ) {
                    return;
                }

                if (
                    node.arguments.length > 0
                    && (('name' in node.callee && node.callee.name === 'shape')
                        || astUtil.getPropertyName(node.callee) === 'shape')
                ) {
                    checkProperties('properties' in node.arguments[0]! && node.arguments[0].properties);
                }
            },

            MethodDefinition(node: Node<'MethodDefinition'>) {
                if (
                    !propsUtil.isPropTypesDeclaration(node)
                    && !isPropTypesPackage(node)
                    && !shouldCheckContextTypes(node)
                    && !shouldCheckChildContextTypes(node)
                ) {
                    return;
                }

                const returnStatement = astUtil.findReturnStatement(node);

                if (returnStatement && returnStatement.argument) {
                    checkNode(returnStatement.argument);
                }
            },

            ObjectExpression(node: Node<'ObjectExpression'>) {
                node.properties.forEach((property) => {
                    if (!('key' in property) || !property.key) {
                        return;
                    }

                    if (
                        !propsUtil.isPropTypesDeclaration(property)
                        && !isPropTypesPackage(property)
                        && !shouldCheckContextTypes(property)
                        && !shouldCheckChildContextTypes(property)
                    ) {
                        return;
                    }
                    if (property.value!.type === 'ObjectExpression') {
                        checkProperties(property.value!.properties);
                    }
                });
            },
        };
    },
};

export default rule;
