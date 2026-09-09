/**
 * @file Enforce component methods order
 * @author Yannick Croissant
 */
import dependency1 from 'object.entries';
import dependency2 from 'object.values';
import dependency3 from 'array-includes';
import dependency0 from '../../compat/hasown';
import dependency4 from '../util/Components';
import dependency5 from '../util/ast';
import dependency6 from '../util/docsUrl';
import dependency7 from '../util/report';
import type { LegacyRule, Node } from '../../types';

type Options = { order?: string[]; groups?: { [key: string]: string[] } };

const has = dependency0;
const entries = dependency1;
const values = dependency2;
const arrayIncludes = dependency3;

const Components = dependency4;
const astUtil = dependency5;
const docsUrl = dependency6;
const report = dependency7;

const defaultConfig = {
    order: ['static-methods', 'lifecycle', 'everything-else', 'render'],
    groups: {
        lifecycle: [
            'displayName',
            'propTypes',
            'contextTypes',
            'childContextTypes',
            'mixins',
            'statics',
            'defaultProps',
            'constructor',
            'getDefaultProps',
            'state',
            'getInitialState',
            'getChildContext',
            'getDerivedStateFromProps',
            'componentWillMount',
            'UNSAFE_componentWillMount',
            'componentDidMount',
            'componentWillReceiveProps',
            'UNSAFE_componentWillReceiveProps',
            'shouldComponentUpdate',
            'componentWillUpdate',
            'UNSAFE_componentWillUpdate',
            'getSnapshotBeforeUpdate',
            'componentDidUpdate',
            'componentDidCatch',
            'componentWillUnmount',
        ],
    },
};

/**
 * Get the methods order from the default config and the user config
 * @param initialUserConfig The user configuration.
 * @returns Methods order
 */
function getMethodsOrder(initialUserConfig: Options | undefined) {
    let userConfig = initialUserConfig;

    userConfig = userConfig || {};

    const groups: Record<string, string[]> = { ...defaultConfig.groups, ...userConfig.groups };
    const order = userConfig.order || defaultConfig.order;

    let config: string[] = [];
    let entry;
    for (let i = 0, j = order.length; i < j; i += 1) {
        entry = order[i]!;
        if (has(groups, entry)) {
            config = config.concat(groups[entry]!);
        } else {
            config.push(entry);
        }
    }

    return config;
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    unsortedProps: '{{propA}} should be placed {{position}} {{propB}}',
};

interface PropertyInfo {
    name: string | undefined;
    getter: boolean;
    setter: boolean;
    typeAnnotation: boolean;
    staticVariable: boolean | null | undefined;
    staticMethod: boolean | null | undefined;
    instanceVariable: boolean;
    instanceMethod: boolean | null | undefined;
}
const rule: LegacyRule<[Options?]> & {
    defaultConfig: typeof defaultConfig;
} = {
    meta: {
        docs: {
            description: 'Enforce component methods order',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('sort-comp'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    order: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    groups: {
                        type: 'object',
                        patternProperties: {
                            '^.*$': {
                                type: 'array',
                                items: {
                                    type: 'string',
                                },
                            },
                        },
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create: Components.detect((context, components) => {
        /**
         */
        const errors: Record<
            string,
            {
                node: Node;
                score: number;
                closest: { distance: number; ref: { node: Node | null; index: number } };
            }
        > = {};
        const methodsOrder = getMethodsOrder(context.options[0]);

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        const regExpRegExp = /\/(.*)\/([gimsuy]*)/;

        /**
         * Get indexes of the matching patterns in methods order configuration
         * @param method - Method metadata.
         * @returns The matching patterns indexes. Return [Infinity] if there is no match.
         */
        function getRefPropIndexes(method: PropertyInfo) {
            const methodGroupIndexes = [];

            methodsOrder.forEach((currentGroup, groupIndex) => {
                if (currentGroup === 'getters') {
                    if (method.getter) {
                        methodGroupIndexes.push(groupIndex);
                    }
                } else if (currentGroup === 'setters') {
                    if (method.setter) {
                        methodGroupIndexes.push(groupIndex);
                    }
                } else if (currentGroup === 'type-annotations') {
                    if (method.typeAnnotation) {
                        methodGroupIndexes.push(groupIndex);
                    }
                } else if (currentGroup === 'static-variables') {
                    if (method.staticVariable) {
                        methodGroupIndexes.push(groupIndex);
                    }
                } else if (currentGroup === 'static-methods') {
                    if (method.staticMethod) {
                        methodGroupIndexes.push(groupIndex);
                    }
                } else if (currentGroup === 'instance-variables') {
                    if (method.instanceVariable) {
                        methodGroupIndexes.push(groupIndex);
                    }
                } else if (currentGroup === 'instance-methods') {
                    if (method.instanceMethod) {
                        methodGroupIndexes.push(groupIndex);
                    }
                } else if (
                    arrayIncludes(
                        [
                            'displayName',
                            'propTypes',
                            'contextTypes',
                            'childContextTypes',
                            'mixins',
                            'statics',
                            'defaultProps',
                            'constructor',
                            'getDefaultProps',
                            'state',
                            'getInitialState',
                            'getChildContext',
                            'getDerivedStateFromProps',
                            'componentWillMount',
                            'UNSAFE_componentWillMount',
                            'componentDidMount',
                            'componentWillReceiveProps',
                            'UNSAFE_componentWillReceiveProps',
                            'shouldComponentUpdate',
                            'componentWillUpdate',
                            'UNSAFE_componentWillUpdate',
                            'getSnapshotBeforeUpdate',
                            'componentDidUpdate',
                            'componentDidCatch',
                            'componentWillUnmount',
                            'render',
                        ],
                        currentGroup,
                    )
                ) {
                    if (currentGroup === method.name) {
                        methodGroupIndexes.push(groupIndex);
                    }
                } else {
                    // Is the group a regex?
                    const isRegExp = currentGroup.match(regExpRegExp);
                    if (isRegExp) {
                        const isMatching = new RegExp(isRegExp[1]!, isRegExp[2]).test(
                            method.name as string,
                        );
                        if (isMatching) {
                            methodGroupIndexes.push(groupIndex);
                        }
                    } else if (currentGroup === method.name) {
                        methodGroupIndexes.push(groupIndex);
                    }
                }
            });

            // No matching pattern, return 'everything-else' index
            if (methodGroupIndexes.length === 0) {
                const everythingElseIndex = methodsOrder.indexOf('everything-else');

                if (everythingElseIndex !== -1) {
                    methodGroupIndexes.push(everythingElseIndex);
                } else {
                    // No matching pattern and no 'everything-else' group
                    methodGroupIndexes.push(Infinity);
                }
            }

            return methodGroupIndexes;
        }

        /**
         * Get properties name
         * @param node - Property.
         * @returns Property name.
         */
        function getPropertyName(node: Node) {
            if (node.kind === 'get') {
                return 'getter functions';
            }

            if (node.kind === 'set') {
                return 'setter functions';
            }

            return astUtil.getPropertyName(node);
        }

        /**
         * Store a new error in the error list
         * @param propA - Mispositioned property.
         * @param propA.node The value to inspect.
         * @param propA.index The value to inspect.
         * @param propB - Reference property.
         * @param propB.node The value to inspect.
         * @param propB.index The value to inspect.
         */
        function storeError(propA: { node: Node; index: number }, propB: { node: Node; index: number }) {
            // Initialize the error object if needed
            if (!errors[propA.index]) {
                errors[propA.index] = {
                    node: propA.node,
                    score: 0,
                    closest: {
                        distance: Infinity,
                        ref: {
                            node: null,
                            index: 0,
                        },
                    },
                };
            }
            // Increment the prop score
            errors[propA.index]!.score += 1;
            // Stop here if we already have pushed another node at this position
            if (getPropertyName(errors[propA.index]!.node) !== getPropertyName(propA.node)) {
                return;
            }
            // Stop here if we already have a closer reference
            if (Math.abs(propA.index - propB.index) > errors[propA.index]!.closest.distance) {
                return;
            }
            // Update the closest reference
            errors[propA.index]!.closest.distance = Math.abs(propA.index - propB.index);
            errors[propA.index]!.closest.ref.node = propB.node;
            errors[propA.index]!.closest.ref.index = propB.index;
        }

        /**
         * Dedupe errors, only keep the ones with the highest score and delete the others
         */
        function dedupeErrors() {
            entries(errors).forEach((entry) => {
                const i = entry[0];
                const error = entry[1];

                const { index } = error.closest.ref;
                if (errors[index]) {
                    if (error.score > errors[index].score) {
                        delete errors[index];
                    } else {
                        delete errors[i];
                    }
                }
            });
        }

        /**
         * Report errors
         */
        function reportErrors() {
            dedupeErrors();

            entries(errors).forEach((entry) => {
                const nodeA = entry[1].node;
                const nodeB = entry[1].closest.ref.node;
                const indexA = entry[0];
                const indexB = entry[1].closest.ref.index;

                report(context, messages.unsortedProps, 'unsortedProps', {
                    node: nodeA,
                    data: {
                        propA: getPropertyName(nodeA),
                        propB: getPropertyName(nodeB!),
                        position: Number(indexA) < indexB ? 'before' : 'after',
                    },
                });
            });
        }

        /**
         * Compare two properties and find out if they are in the right order
         * @param propertiesInfos Array containing all the properties metadata.
         * @param propA First property name and metadata
         * @param propB Second property name.
         * @returns Object containing a correct true/false flag and the correct indexes for the two properties.
         */
        function comparePropsOrder(
            propertiesInfos: PropertyInfo[],
            propA: PropertyInfo,
            propB: PropertyInfo,
        ) {
            let i;
            let j;
            let k;
            let l;
            let refIndexA;
            let refIndexB;

            // Get references indexes (the correct position) for given properties
            const refIndexesA = getRefPropIndexes(propA);
            const refIndexesB = getRefPropIndexes(propB);

            // Get current indexes for given properties
            const classIndexA = propertiesInfos.indexOf(propA);
            const classIndexB = propertiesInfos.indexOf(propB);

            // Loop around the references indexes for the 1st property
            for (i = 0, j = refIndexesA.length; i < j; i += 1) {
                refIndexA = refIndexesA[i];

                // Loop around the properties for the 2nd property (for comparison)
                for (k = 0, l = refIndexesB.length; k < l; k += 1) {
                    refIndexB = refIndexesB[k];

                    if (
                        // Comparing the same properties
                        refIndexA === refIndexB
                        // 1st property is placed before the 2nd one in reference and in current component
                        || (refIndexA! < refIndexB! && classIndexA < classIndexB)
                        // 1st property is placed after the 2nd one in reference and in current component
                        || (refIndexA! > refIndexB! && classIndexA > classIndexB)
                    ) {
                        return {
                            correct: true,
                            indexA: classIndexA,
                            indexB: classIndexB,
                        };
                    }
                }
            }

            // We did not find any correct match between reference and current component
            return {
                correct: false,
                indexA: refIndexA,
                indexB: refIndexB,
            };
        }

        /**
         * Check properties order from a properties list and store the eventual errors
         * @param properties Array containing all the properties.
         */
        function checkPropsOrder(properties: Node[]) {
            const propertiesInfos = properties.map((node: Node) => ({
                name: getPropertyName(node),
                getter: node.kind === 'get',
                setter: node.kind === 'set',
                staticVariable:
                    node.static
                    && (node.type === 'ClassProperty' || node.type === 'PropertyDefinition')
                    && (!node.value || !astUtil.isFunctionLikeExpression(node.value)),
                staticMethod:
                    node.static
                    && (node.type === 'ClassProperty'
                        || node.type === 'PropertyDefinition'
                        || node.type === 'MethodDefinition')
                    && node.value
                    && astUtil.isFunctionLikeExpression(node.value),
                instanceVariable:
                    !node.static
                    && (node.type === 'ClassProperty' || node.type === 'PropertyDefinition')
                    && (!node.value || !astUtil.isFunctionLikeExpression(node.value)),
                instanceMethod:
                    !node.static
                    && (node.type === 'ClassProperty' || node.type === 'PropertyDefinition')
                    && node.value
                    && astUtil.isFunctionLikeExpression(node.value),
                typeAnnotation: !!node.typeAnnotation && node.value === null,
            }));

            // Loop around the properties
            propertiesInfos.forEach((propA, i) => {
                // Loop around the properties a second time (for comparison)
                propertiesInfos.forEach((propB, k) => {
                    if (i === k) {
                        return;
                    }

                    // Compare the properties order
                    const order = comparePropsOrder(propertiesInfos, propA, propB);

                    if (!order.correct) {
                        // Store an error if the order is incorrect
                        storeError(
                            {
                                node: properties[i]!,
                                index: order.indexA!,
                            },
                            {
                                node: properties[k]!,
                                index: order.indexB!,
                            },
                        );
                    }
                });
            });
        }

        return {
            'Program:exit': function onProgramExit() {
                values(components.list()).forEach((component) => {
                    const properties = astUtil.getComponentProperties(component.node);
                    checkPropsOrder(properties);
                });

                reportErrors();
            },
        };
    }),

    defaultConfig,
};

export default rule;
