import dependency0 from 'object.entries';
import dependency1 from 'object.values';
import type { Component, DefaultProp, PropType } from '../../component-types';
import type { Node, LegacyRule } from '../../types';
/**
 * @file Enforce a defaultProps definition for every prop that is not a required prop.
 * @author Vitor Balocco
 */
import dependency2 from '../util/Components';
import dependency3 from '../util/docsUrl';
import dependency4 from '../util/ast';
import dependency5 from '../util/report';

const entries = dependency0;
const values = dependency1;
const Components = dependency2;
const docsUrl = dependency3;
const astUtil = dependency4;
const report = dependency5;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noDefaultWithRequired:
        'propType "{{name}}" is required and should not have a defaultProps declaration.',
    shouldHaveDefault:
        'propType "{{name}}" is not required, but has no corresponding defaultProps declaration.',
    noDefaultPropsWithFunction: 'Don’t use defaultProps with function components.',
    shouldAssignObjectDefault:
        'propType "{{name}}" is not required, but has no corresponding default argument value.',
    destructureInSignature:
        'Must destructure props in the function signature to initialize an optional prop.',
};

/**
 * @param prop The prop value.
 * @returns The result of this check.
 */
function isPropWithNoDefaulVal(
    prop:
        | Node<'Property'>
        | Node<'RestElement'>
        | Node<'ObjectProperty'>
        | Node<'ExperimentalSpreadProperty'>
        | Node<'ExperimentalRestProperty'>,
) {
    if (prop.type === 'RestElement' || prop.type === 'ExperimentalRestProperty') {
        return false;
    }
    return prop.value!.type !== 'AssignmentPattern';
}

const rule: LegacyRule<
    [
        {
            forbidDefaultForRequired?: boolean;
            classes?: 'defaultProps' | 'ignore';
            functions?: 'defaultArguments' | 'defaultProps' | 'ignore';
            ignoreFunctionalComponents?: boolean;
        }?,
    ]
> = {
    meta: {
        docs: {
            description: 'Enforce a defaultProps definition for every prop that is not a required prop',
            category: 'Best Practices',
            url: docsUrl('require-default-props'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    forbidDefaultForRequired: {
                        type: 'boolean',
                    },
                    classes: {
                        enum: ['defaultProps', 'ignore'],
                    },
                    functions: {
                        enum: ['defaultArguments', 'defaultProps', 'ignore'],
                    },
                    /**
                     * @deprecated
                     */
                    ignoreFunctionalComponents: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create: Components.detect((context, components) => {
        const configuration = context.options[0] || {};
        const forbidDefaultForRequired = configuration.forbidDefaultForRequired || false;
        const classes = configuration.classes || 'defaultProps';
        /**
         * @todo
         * - Remove ignoreFunctionalComponents
         * - Change default to 'defaultArguments'
         */
        const functions = configuration.ignoreFunctionalComponents
            ? 'ignore'
            : configuration.functions || 'defaultProps';

        /**
         * Reports all propTypes passed in that don't have a defaultProps counterpart.
         * @param  propTypes    List of propTypes to check.
         * @param  defaultProps Object of defaultProps to check. Keys are the props names.
         */
        function reportPropTypesWithoutDefault(
            propTypes: Record<string, PropType>,
            defaultProps: Record<string, DefaultProp>,
        ) {
            entries(propTypes).forEach((propType) => {
                const propName = propType[0];
                const prop = propType[1];

                if (!prop.node) {
                    return;
                }
                if (prop.isRequired) {
                    if (forbidDefaultForRequired && defaultProps[propName]) {
                        report(context, messages.noDefaultWithRequired, 'noDefaultWithRequired', {
                            node: prop.node,
                            data: { name: propName },
                        });
                    }
                    return;
                }

                if (defaultProps[propName]) {
                    return;
                }

                report(context, messages.shouldHaveDefault, 'shouldHaveDefault', {
                    node: prop.node,
                    data: { name: propName },
                });
            });
        }

        /**
         * If functions option is 'defaultArguments', reports defaultProps is used and all params that doesn't
         * initialized.
         * @param componentNode Node of component.
         * @param declaredPropTypes List of propTypes to check `isRequired`.
         * @param defaultProps Object of defaultProps to check used.
         */
        function reportFunctionComponent(
            componentNode: Node,
            declaredPropTypes: Record<string, PropType>,
            defaultProps: Component['defaultProps'],
        ) {
            if (defaultProps) {
                report(context, messages.noDefaultPropsWithFunction, 'noDefaultPropsWithFunction', {
                    node: componentNode,
                });
            }

            const props = componentNode.params![0];
            const propTypes = declaredPropTypes;

            if (!props) {
                return;
            }

            if (props.type === 'Identifier') {
                const hasOptionalProp = values(propTypes).some((propType) => !propType.isRequired);
                if (hasOptionalProp) {
                    report(context, messages.destructureInSignature, 'destructureInSignature', {
                        node: props,
                    });
                }
            } else if (props.type === 'ObjectPattern') {
                // Filter required props with default value and report error
                props.properties
                    .filter((prop) => {
                        const propName = prop && prop.key && prop.key.name;
                        const isPropRequired = propTypes[propName as string]
&& propTypes[propName as string]!.isRequired;
                        return (
                            propTypes[propName as string]
                            && isPropRequired
                            && !isPropWithNoDefaulVal(prop)
                        );
                    })
                    .forEach((prop) => {
                        report(context, messages.noDefaultWithRequired, 'noDefaultWithRequired', {
                            node: prop,
                            data: { name: prop.key!.name },
                        });
                    });

                // Filter non required props with no default value and report error
                props.properties
                    .filter((prop) => {
                        const propName = prop && prop.key && prop.key.name;
                        const isPropRequired = propTypes[propName as string]
&& propTypes[propName as string]!.isRequired;
                        return (
                            propTypes[propName as string]
                            && !isPropRequired
                            && isPropWithNoDefaulVal(prop)
                        );
                    })
                    .forEach((prop) => {
                        report(
                            context,
                            messages.shouldAssignObjectDefault,
                            'shouldAssignObjectDefault',
                            {
                                node: prop,
                                data: { name: prop.key!.name },
                            },
                        );
                    });
            }
        }

        // --------------------------------------------------------------------------
        // Public API
        // --------------------------------------------------------------------------

        return {
            'Program:exit': function onProgramExit() {
                const list = components.list();

                values(list)
                    .filter((component) => {
                        if (functions === 'ignore' && astUtil.isFunctionLike(component.node)) {
                            return false;
                        }
                        if (classes === 'ignore' && astUtil.isClass(component.node)) {
                            return false;
                        }

                        // If this defaultProps is "unresolved", then we should ignore this component and not report
                        // any errors for it, to avoid false-positives with e.g. external defaultProps declarations or
                        // spread operators.
                        if (component.defaultProps === 'unresolved') {
                            return false;
                        }
                        return component.declaredPropTypes !== undefined;
                    })
                    .forEach((component) => {
                        if (functions === 'defaultArguments' && astUtil.isFunctionLike(component.node)) {
                            reportFunctionComponent(
                                component.node,
                                component.declaredPropTypes!,
                                component.defaultProps,
                            );
                        } else {
                            reportPropTypesWithoutDefault(
                                component.declaredPropTypes!,
                                (component.defaultProps as Record<string, DefaultProp>) || {},
                            );
                        }
                    });
            },
        };
    }),
};

export default rule;
