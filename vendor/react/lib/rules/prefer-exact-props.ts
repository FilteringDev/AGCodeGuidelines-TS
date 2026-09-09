/**
 * @file Prefer exact proptype definitions
 */
import dependency0 from '../util/Components';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/ast';
import dependency3 from '../util/props';
import dependency4 from '../util/propWrapper';
import dependency5 from '../util/variable';
import dependency6 from '../util/report';
import dependency7 from '../util/eslint';
import type { LegacyRule, Node } from '../../types';

const Components = dependency0;
const docsUrl = dependency1;
const astUtil = dependency2;
const propsUtil = dependency3;
const propWrapperUtil = dependency4;
const variableUtil = dependency5;
const report = dependency6;
const { getText } = dependency7;

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

const propTypesMessage = 'Component propTypes should be exact by using {{exactPropWrappers}}.';
const messages = {
    propTypes: propTypesMessage,
    flow: 'Component flow props should be set with exact objects.',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Prefer exact proptype definitions',
            category: 'Possible Errors',
            recommended: false,
            url: docsUrl('prefer-exact-props'),
        },
        messages,
        schema: [],
    },

    create: Components.detect((context, components, utils) => {
        const typeAliases: Record<string, Node<'TypeAlias'>> = {};
        const exactWrappers = propWrapperUtil.getExactPropWrapperFunctions(context);

        /**
         * @returns The result of this check.
         */
        function getPropTypesErrorMessage() {
            const formattedWrappers = propWrapperUtil.formatPropWrapperFunctions(exactWrappers);
            const message = exactWrappers.size > 1 ? `one of ${formattedWrappers}` : formattedWrappers;
            return { exactPropWrappers: message };
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isNonExactObjectTypeAnnotation(node: Node | null) {
            return (
                node && node.type === 'ObjectTypeAnnotation' && node.properties.length > 0 && !node.exact
            );
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function hasNonExactObjectTypeAnnotation(node: Node) {
            const { typeAnnotation } = node;
            return (
                typeAnnotation
                && typeAnnotation.typeAnnotation
                && isNonExactObjectTypeAnnotation(typeAnnotation.typeAnnotation)
            );
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function hasGenericTypeAnnotation(node: Node) {
            const { typeAnnotation } = node;
            return (
                typeAnnotation
                && typeAnnotation.typeAnnotation
                && typeAnnotation.typeAnnotation.type === 'GenericTypeAnnotation'
            );
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isNonEmptyObjectExpression(node: Node) {
            return node && node.type === 'ObjectExpression' && node.properties.length > 0;
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isNonExactPropWrapperFunction(node: Node) {
            return (
                astUtil.isCallExpression(node)
                && !propWrapperUtil.isExactPropWrapperFunction(context, getText(context, node.callee))
            );
        }

        /**
         * @param node The node to inspect.
         */
        function reportPropTypesError(node: Node) {
            report(context, propTypesMessage, 'propTypes', {
                node,
                data: getPropTypesErrorMessage(),
            });
        }

        /**
         * @param node The node to inspect.
         */
        function reportFlowError(node: Node) {
            report(context, messages.flow, 'flow', {
                node,
            });
        }

        return {
            TypeAlias(node: Node<'TypeAlias'>) {
                // working around an issue with eslint@3 and babel-eslint not finding the TypeAlias in scope
                typeAliases[node.id.name] = node;
            },

            'ClassProperty, PropertyDefinition': function onClassPropertyPropertyDefinition(
                node: Node<'ClassProperty' | 'PropertyDefinition'>,
            ) {
                if (!propsUtil.isPropTypesDeclaration(node)) {
                    return;
                }

                if (hasNonExactObjectTypeAnnotation(node)) {
                    reportFlowError(node);
                } else if (exactWrappers.size > 0 && isNonEmptyObjectExpression(node.value!)) {
                    reportPropTypesError(node);
                } else if (exactWrappers.size > 0 && isNonExactPropWrapperFunction(node.value!)) {
                    reportPropTypesError(node);
                }
            },

            Identifier(node: Node<'Identifier'>) {
                if (!utils.getStatelessComponent(node.parent)) {
                    return;
                }

                if (hasNonExactObjectTypeAnnotation(node)) {
                    reportFlowError(node);
                } else if (hasGenericTypeAnnotation(node)) {
                    const identifier = node.typeAnnotation!.typeAnnotation!.id!.name;
                    const typeAlias = typeAliases[identifier!];
                    const propsDefinition = typeAlias ? typeAlias.right : null;
                    if (isNonExactObjectTypeAnnotation(propsDefinition)) {
                        reportFlowError(node);
                    }
                }
            },

            MemberExpression(node: Node<'MemberExpression'>) {
                if (!propsUtil.isPropTypesDeclaration(node) || exactWrappers.size === 0) {
                    return;
                }

                const { right } = node.parent;
                if (isNonEmptyObjectExpression(right!)) {
                    reportPropTypesError(node);
                } else if (isNonExactPropWrapperFunction(right!)) {
                    reportPropTypesError(node);
                } else if (right!.type === 'Identifier') {
                    const identifier = right!.name;
                    const propsDefinition = variableUtil.findVariableByName(context, node, identifier!);
                    if (isNonEmptyObjectExpression(propsDefinition!)) {
                        reportPropTypesError(node);
                    } else if (isNonExactPropWrapperFunction(propsDefinition!)) {
                        reportPropTypesError(node);
                    }
                }
            },
        };
    }),
};

export default rule;
