import dependency0 from 'object.fromentries';
import type { Scope, LegacyRule, Node } from '../../types';
/**
 * @file Defines where React component static properties should be positioned.
 * @author Daniel Mason
 */
import dependency1 from '../util/Components';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/ast';
import dependency4 from '../util/componentUtil';
import dependency5 from '../util/props';
import dependency6 from '../util/report';
import dependency7 from '../util/eslint';

const fromEntries = dependency0;
const Components = dependency1;
const docsUrl = dependency2;
const astUtil = dependency3;
const componentUtil = dependency4;
const propsUtil = dependency5;
const report = dependency6;
const { getScope } = dependency7;

// ------------------------------------------------------------------------------
// Positioning Options
// ------------------------------------------------------------------------------
const STATIC_PUBLIC_FIELD = 'static public field';
const STATIC_GETTER = 'static getter';
const PROPERTY_ASSIGNMENT = 'property assignment';
const POSITION_SETTINGS = [STATIC_PUBLIC_FIELD, STATIC_GETTER, PROPERTY_ASSIGNMENT];

// ------------------------------------------------------------------------------
// Rule messages
// ------------------------------------------------------------------------------
const ERROR_MESSAGES = {
    [STATIC_PUBLIC_FIELD]: 'notStaticClassProp',
    [STATIC_GETTER]: 'notGetterClassFunc',
    [PROPERTY_ASSIGNMENT]: 'declareOutsideClass',
};

// ------------------------------------------------------------------------------
// Properties to check
// ------------------------------------------------------------------------------
const propertiesToCheck = {
    propTypes: propsUtil.isPropTypesDeclaration,
    defaultProps: propsUtil.isDefaultPropsDeclaration,
    childContextTypes: propsUtil.isChildContextTypesDeclaration,
    contextTypes: propsUtil.isContextTypesDeclaration,
    contextType: propsUtil.isContextTypeDeclaration,
    displayName: (node: Node) => propsUtil.isDisplayNameDeclaration(astUtil.getPropertyNameNode(node)!),
};

const classProperties = Object.keys(propertiesToCheck) as (keyof typeof propertiesToCheck)[];
const schemaProperties = fromEntries(
    classProperties.map((property) => [property, { enum: POSITION_SETTINGS }]),
);

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    notStaticClassProp: "'{{name}}' should be declared as a static class property.",
    notGetterClassFunc: "'{{name}}' should be declared as a static getter class function.",
    declareOutsideClass: "'{{name}}' should be declared outside the class body.",
};

const rule: LegacyRule<
    [
        ('static public field' | 'static getter' | 'property assignment')?,
        {
            propTypes?: 'static public field' | 'static getter' | 'property assignment';
            defaultProps?: 'static public field' | 'static getter' | 'property assignment';
            childContextTypes?: 'static public field' | 'static getter' | 'property assignment';
            contextTypes?: 'static public field' | 'static getter' | 'property assignment';
            contextType?: 'static public field' | 'static getter' | 'property assignment';
            displayName?: 'static public field' | 'static getter' | 'property assignment';
        }?,
    ]
> = {
    meta: {
        docs: {
            description: 'Enforces where React component static properties should be positioned.',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('static-property-placement'),
        },
        fixable: null, // or 'code' or 'whitespace'

        messages,

        schema: [
            { enum: POSITION_SETTINGS },
            {
                type: 'object',
                properties: schemaProperties,
                additionalProperties: false,
            },
        ],
    },

    create: Components.detect((context, components, utils) => {
        // variables should be defined here
        const { options } = context;
        const defaultCheckType = options[0] || STATIC_PUBLIC_FIELD;
        const hasAdditionalConfig = options.length > 1;
        const additionalConfig = hasAdditionalConfig ? options[1] : {};

        // Set config
        const config = fromEntries(
            classProperties.map((property) => [
                property,
                additionalConfig![property] || defaultCheckType,
            ]),
        );

        // ----------------------------------------------------------------------
        // Helpers
        // ----------------------------------------------------------------------

        /**
         * Checks if we are declaring context in class
         * @param node The value to inspect.
         * @returns True if we are declaring context in class, false if not.
         */
        function isContextInClass(node: Node) {
            let blockNode;
            let scope: Scope | null = getScope(context, node);
            while (scope) {
                blockNode = scope.block;
                if (blockNode && blockNode.type === 'ClassDeclaration') {
                    return true;
                }
                scope = scope.upper;
            }

            return false;
        }

        /**
         * Check if we should report this property node
         * @param node The value to inspect.
         * @param expectedRule The value to inspect.
         */
        function reportNodeIncorrectlyPositioned(node: Node, expectedRule: string) {
            // Detect if this node is an expected property declaration adn return the property name
            const name = classProperties.find((propertyName) => {
                if (propertiesToCheck[propertyName](node)) {
                    return !!propertyName;
                }

                return false;
            });

            // If name is set but the configured rule does not match expected then report error
            if (
                name
                && (config[name] !== expectedRule
                    || (!node.static
                        && (config[name] === STATIC_PUBLIC_FIELD || config[name] === STATIC_GETTER)))
            ) {
                const messageId = ERROR_MESSAGES[config[name]!];
                report(context, messages[messageId as keyof typeof messages], messageId, {
                    node,
                    data: { name },
                });
            }
        }

        // ----------------------------------------------------------------------
        // Public
        // ----------------------------------------------------------------------
        return {
            'ClassProperty, PropertyDefinition': function onClassPropertyPropertyDefinition(
                node: Node<'ClassProperty' | 'PropertyDefinition'>,
            ) {
                if (!componentUtil.getParentES6Component(context, node)) {
                    return;
                }

                reportNodeIncorrectlyPositioned(node, STATIC_PUBLIC_FIELD);
            },

            MemberExpression(node: Node<'MemberExpression'>) {
                // If definition type is undefined then it must not be a defining expression or if the definition is
                // inside a
                // class body then skip this node.
                const { right } = node.parent;
                if (!right || (right.type as string) === 'undefined' || isContextInClass(node)) {
                    return;
                }

                // Get the related component
                const relatedComponent = utils.getRelatedComponent(node);

                // If the related component is not an ES6 component then skip this node
                if (!relatedComponent || !componentUtil.isES6Component(relatedComponent.node, context)) {
                    return;
                }

                // Report if needed
                reportNodeIncorrectlyPositioned(node, PROPERTY_ASSIGNMENT);
            },

            MethodDefinition(node: Node<'MethodDefinition'>) {
                // If the function is inside a class and is static getter then check if correctly positioned
                if (
                    componentUtil.getParentES6Component(context, node)
                    && node.static
                    && node.kind === 'get'
                ) {
                    // Report error if needed
                    reportNodeIncorrectlyPositioned(node, STATIC_GETTER);
                }
            },
        };
    }),
};

export default rule;
