import dependency0 from 'object.values';
import type { Component, PropType } from '../../component-types';
/**
 * @file Prevent definitions of unused prop types
 * @author Evgueni Naverniouk
 */
import dependency1 from '../util/Components';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/report';
import type { LegacyRule } from '../../types';

const values = dependency0;

// As for exceptions for props.children or props.className (and alike) look at
// https://github.com/jsx-eslint/eslint-plugin-react/issues/7

const Components = dependency1;
const docsUrl = dependency2;
const report = dependency3;

/**
 * Checks if the component must be validated
 * @param component The component to process
 * @returns True if the component must be validated, false if not.
 */
function mustBeValidated(component: Component) {
    return !!component && !component.ignoreUnusedPropTypesValidation;
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    unusedPropType: "'{{name}}' PropType is defined but prop is never used",
};

const rule: LegacyRule<[{ ignore?: string[]; customValidators?: string[]; skipShapeProps?: boolean }?]> = {
    meta: {
        docs: {
            description: 'Disallow definitions of unused propTypes',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('no-unused-prop-types'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    ignore: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        uniqueItems: true,
                    },
                    customValidators: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    skipShapeProps: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create: Components.detect((context, components) => {
        const defaults = {
            skipShapeProps: true,
            customValidators: [] as string[],
            ignore: [] as string[],
        };
        const configuration = { ...defaults, ...(context.options[0] || {}) };

        /**
         * Checks if the prop is ignored
         * @param name Name of the prop to check.
         * @returns True if the prop is ignored, false if not.
         */
        function isIgnored(name: string) {
            return configuration.ignore.indexOf(name) !== -1;
        }

        /**
         * Checks if a prop is used
         * @param node The AST node being checked.
         * @param prop Declared prop object
         * @returns True if the prop is used, false if not.
         */
        function isPropUsed(node: Component, prop: PropType) {
            const usedPropTypes = node.usedPropTypes || [];
            for (let i = 0, l = usedPropTypes.length; i < l; i += 1) {
                const usedProp = usedPropTypes[i];
                if (
                    prop.type === 'shape'
                        || prop.type === 'exact'
                        || prop.name === '__ANY_KEY__'
                        || usedProp!.name === prop.name
                ) {
                    return true;
                }
            }

            return false;
        }

        /**
         * Used to recursively loop through each declared prop type
         * @param component The component to process
         * @param props List of props to validate
         */
        function reportUnusedPropType(
            component: Component,
            props: Record<string, PropType | true> | PropType[] | true | undefined,
        ) {
            // Skip props that check instances
            if (props === true) {
                return;
            }

            Object.keys(props || {}).forEach((key) => {
                const prop = (props as Record<string, PropType | true>)[key]!;
                // Skip props that check instances
                if (prop === true) {
                    return;
                }

                if (
                    (prop.type === 'shape' || prop.type === 'exact')
                        && configuration.skipShapeProps
                ) {
                    return;
                }

                if (
                    prop.node
                        && prop.node.typeAnnotation
                        && prop.node.typeAnnotation.typeAnnotation
                        && prop.node.typeAnnotation.typeAnnotation.type === 'TSNeverKeyword'
                ) {
                    return;
                }

                if (prop.node && !isIgnored(prop.fullName!) && !isPropUsed(component, prop)) {
                    report(context, messages.unusedPropType, 'unusedPropType', {
                        node: prop.node.key || prop.node,
                        data: {
                            name: prop.fullName,
                        },
                    });
                }

                if (prop.children) {
                    reportUnusedPropType(component, prop.children);
                }
            });
        }

        /**
         * Reports unused proptypes for a given component
         * @param component The component to process
         */
        function reportUnusedPropTypes(component: Component) {
            reportUnusedPropType(component, component.declaredPropTypes);
        }

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        return {
            'Program:exit': function onProgramExit() {
                // Report undeclared proptypes for all classes
                values(components.list())
                    .filter((component) => mustBeValidated(component))
                    .forEach((component) => {
                        reportUnusedPropTypes(component);
                    });
            },
        };
    }),
};

export default rule;
