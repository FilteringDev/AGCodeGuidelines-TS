/**
 * @file Prevent using string literals in React component definition
 * @author Caleb Morris
 * @author David Buchan-Swanson
 */
import dependency4 from 'object.fromentries';
import dependency5 from 'object.entries';
import {
    from as dependency0,
    map as dependency1,
    some as dependency2,
    flatMap as dependency3,
} from '../../compat/iterators';

import type { LegacyRule, Node } from '../../types';
import dependency6 from '../util/docsUrl';
import dependency7 from '../util/report';
import dependency8 from '../util/eslint';

type Config = import('../../types/rules/jsx-no-literals').Config;
type RawConfig = import('../../types/rules/jsx-no-literals').RawConfig;
type ResolvedConfig = import('../../types/rules/jsx-no-literals').ResolvedConfig;

type ElementConfig = import('../../types/rules/jsx-no-literals').ElementConfig;

const iterFrom = dependency0;
const map = dependency1;
const some = dependency2;
const flatMap = dependency3;
const fromEntries = dependency4;
const entries = dependency5;

const docsUrl = dependency6;
const report = dependency7;
const { getText } = dependency8;

/**
 */

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/**
 * @param value The value to inspect.
 * @returns The result of this check.
 */
function trimIfString(value: unknown) {
    return typeof value === 'string' ? value.trim() : value;
}

const reOverridableElement = /^[A-Z][\w.]*$/;
const reIsWhiteSpace = /^[\s]+$/;
const jsxElementTypes = new Set(['JSXElement', 'JSXFragment']);
const standardJSXNodeParentTypes = new Set([
    'JSXAttribute',
    'JSXElement',
    'JSXExpressionContainer',
    'JSXFragment',
]);

const messages = {
    invalidPropValue: 'Invalid prop value: "{{text}}"',
    invalidPropValueInElement: 'Invalid prop value: "{{text}}" in {{element}}',
    noStringsInAttributes: 'Strings not allowed in attributes: "{{text}}"',
    noStringsInAttributesInElement: 'Strings not allowed in attributes: "{{text}}" in {{element}}',
    noStringsInJSX: 'Strings not allowed in JSX files: "{{text}}"',
    noStringsInJSXInElement: 'Strings not allowed in JSX files: "{{text}}" in {{element}}',
    literalNotInJSXExpression: 'Missing JSX expression container around literal string: "{{text}}"',
    literalNotInJSXExpressionInElement:
        'Missing JSX expression container around literal string: "{{text}}" in {{element}}',
};

const commonPropertiesSchema: Record<string, import('json-schema').JSONSchema4> = {
    noStrings: {
        type: 'boolean',
    },
    allowedStrings: {
        type: 'array',
        uniqueItems: true,
        items: {
            type: 'string',
        },
    },
    ignoreProps: {
        type: 'boolean',
    },
    noAttributeStrings: {
        type: 'boolean',
    },
};

/**
 * Normalizes the element portion of the config
 * @param config The value to inspect.
 * @returns The result of this check.
 */
function normalizeElementConfig(config: RawConfig): ElementConfig {
    return {
        type: 'element',
        noStrings: !!config.noStrings,
        allowedStrings: config.allowedStrings
            ? new Set(map(iterFrom(config.allowedStrings), (value) => trimIfString(value) as string))
            : new Set<string>(),
        ignoreProps: !!config.ignoreProps,
        noAttributeStrings: !!config.noAttributeStrings,
    };
}

/**
 * Normalizes the config and applies default values to all config options
 * @param config The value to inspect.
 * @returns The result of this check.
 */
function normalizeConfig(config: RawConfig) {
    const normalizedConfig: Config = Object.assign(normalizeElementConfig(config), {
        elementOverrides: {},
    });

    if (config.elementOverrides) {
        normalizedConfig.elementOverrides = fromEntries(
            flatMap(iterFrom(entries(config.elementOverrides)), (entry) => {
                const elementName = entry[0];
                const rawElementConfig = entry[1];

                if (!reOverridableElement.test(elementName)) {
                    return [];
                }

                return [
                    [
                        elementName,
                        Object.assign(normalizeElementConfig(rawElementConfig), {
                            type: 'override' as const,
                            name: elementName,
                            allowElement: !!rawElementConfig.allowElement,
                            applyToNestedElements:
                                typeof rawElementConfig.applyToNestedElements === 'undefined'
                                || !!rawElementConfig.applyToNestedElements,
                        }),
                    ],
                ];
            }),
        );
    }

    return normalizedConfig;
}

const elementOverrides = {
    type: 'object',
    patternProperties: {
        [reOverridableElement.source]: {
            type: 'object',
            properties: { applyToNestedElements: { type: 'boolean' }, ...commonPropertiesSchema },
        },
    },
};

const rule: LegacyRule<[RawConfig?]> = {
    meta: {
        docs: {
            description: 'Disallow usage of string literals in JSX',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-no-literals'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: { elementOverrides, ...commonPropertiesSchema },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const rawConfig: RawConfig = (context.options.length && context.options[0]) || {};
        const config = normalizeConfig(rawConfig);

        const hasElementOverrides = Object.keys(config.elementOverrides).length > 0;

        const renamedImportMap: Map<string, string> = new Map();

        /**
         * Determines if the given expression is a require statement. Supports
         * nested MemberExpresions. ie `require('foo').nested.property`
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function isRequireStatement(node: Node) {
            if (node.type === 'CallExpression') {
                if (node.callee.type === 'Identifier') {
                    return node.callee.name === 'require';
                }
            }
            if (node.type === 'MemberExpression') {
                return isRequireStatement(node.object);
            }

            return false;
        }

        /**
         * Gets the name of the given JSX element. Supports nested
         * JSXMemeberExpressions. ie `<Namesapce.Component.SubComponent />`
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function getJSXElementName(node: Node) {
            if (node.openingElement!.name.type === 'JSXIdentifier') {
                const { name } = node.openingElement!.name;
                return {
                    name: renamedImportMap.get(name) || name,
                    compoundName: undefined,
                };
            }

            const nameFragments: string[] = [];

            if (node.openingElement!.name.type === 'JSXMemberExpression') {
                let current: Node = node.openingElement!.name;
                while (current.type === 'JSXMemberExpression') {
                    if (current.property.type === 'JSXIdentifier') {
                        nameFragments.unshift(current.property.name);
                    }

                    current = current.object;
                }

                if (current.type === 'JSXIdentifier') {
                    nameFragments.unshift(current.name);

                    const rootFragment = nameFragments[0];
                    if (rootFragment) {
                        const rootFragmentRenamed = renamedImportMap.get(rootFragment);
                        if (rootFragmentRenamed) {
                            nameFragments[0] = rootFragmentRenamed;
                        }
                    }

                    const nameFragment = nameFragments[nameFragments.length - 1];
                    if (nameFragment) {
                        return {
                            name: nameFragment,
                            compoundName: nameFragments.join('.'),
                        };
                    }
                }
            }

            return undefined;
        }

        /**
         * Gets all JSXElement ancestor nodes for the given node
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function getJSXElementAncestors(node: Node) {
            const ancestors: Node[] = [];

            let current = node;
            while (current) {
                if (current.type === 'JSXElement') {
                    ancestors.push(current);
                }

                current = current.parent;
            }

            return ancestors;
        }

        /**
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function getParentIgnoringBinaryExpressions(node: Node) {
            let current = node;
            while (current.parent.type === 'BinaryExpression') {
                current = current.parent;
            }
            return current.parent;
        }

        /**
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function getParentAndGrandParent(node: Node) {
            const parent = getParentIgnoringBinaryExpressions(node);
            return {
                parent,
                grandParent: parent.parent,
            };
        }

        /**
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function hasJSXElementParentOrGrandParent(node: Node) {
            const ancestors = getParentAndGrandParent(node);
            return some(
                iterFrom([ancestors.parent, ancestors.grandParent]),
                (parent) => jsxElementTypes.has(parent.type),
            );
        }

        /**
         * Determines whether a given node's value and its immediate parent are
         * viable text nodes that can/should be reported on
         * @param node The value to inspect.
         * @param resolvedConfig The value to inspect.
         * @returns The result of this check.
         */
        function isViableTextNode(node: Node, resolvedConfig: ResolvedConfig) {
            const textValues = iterFrom([trimIfString(node.raw), trimIfString(node.value)]);
            if (some(textValues, (value) => resolvedConfig.allowedStrings.has(value as string))) {
                return false;
            }

            const parent = getParentIgnoringBinaryExpressions(node);

            let isStandardJSXNode = false;
            if (
                typeof node.value === 'string'
                && !reIsWhiteSpace.test(node.value)
                && standardJSXNodeParentTypes.has(parent.type)
            ) {
                if (resolvedConfig.noAttributeStrings) {
                    isStandardJSXNode = parent.type === 'JSXAttribute' || parent.type === 'JSXElement';
                } else {
                    isStandardJSXNode = parent.type !== 'JSXAttribute';
                }
            }

            if (resolvedConfig.noStrings) {
                return isStandardJSXNode;
            }

            return isStandardJSXNode && parent.type !== 'JSXExpressionContainer';
        }

        /**
         * Gets an override config for a given node. For any given node, we also
         * need to traverse the ancestor tree to determine if an ancestor's config
         * will also apply to the current node.
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function getOverrideConfig(node: Node) {
            if (!hasElementOverrides) {
                return undefined;
            }

            const allAncestorElements = getJSXElementAncestors(node);
            if (!allAncestorElements.length) {
                return undefined;
            }

            for (let ancestorIndex = 0; ancestorIndex < allAncestorElements.length; ancestorIndex += 1) {
                const ancestorElement = allAncestorElements[ancestorIndex]!;
                const isClosestJSXAncestor = ancestorElement === allAncestorElements[0];

                const ancestor = getJSXElementName(ancestorElement);
                if (ancestor) {
                    if (ancestor.name) {
                        const ancestorElements = config.elementOverrides[ancestor.name];
                        const ancestorConfig = ancestor.compoundName
                            ? config.elementOverrides[ancestor.compoundName] || ancestorElements
                            : ancestorElements;

                        if (ancestorConfig) {
                            if (isClosestJSXAncestor || ancestorConfig.applyToNestedElements) {
                                return ancestorConfig;
                            }
                        }
                    }
                }
            }

            return undefined;
        }

        /**
         * @param resolvedConfig The value to inspect.
         * @returns The result of this check.
         */
        function shouldAllowElement(resolvedConfig: ResolvedConfig) {
            return (
                resolvedConfig.type === 'override'
                && 'allowElement' in resolvedConfig
                && !!resolvedConfig.allowElement
            );
        }

        /**
         * @param ancestorIsJSXElement The value to inspect.
         * @param resolvedConfig The value to inspect.
         * @returns The result of this check.
         */
        function defaultMessageId(ancestorIsJSXElement: boolean, resolvedConfig: ResolvedConfig) {
            if (resolvedConfig.noAttributeStrings && !ancestorIsJSXElement) {
                return resolvedConfig.type === 'override'
                    ? 'noStringsInAttributesInElement'
                    : 'noStringsInAttributes';
            }

            if (resolvedConfig.noStrings) {
                return resolvedConfig.type === 'override' ? 'noStringsInJSXInElement' : 'noStringsInJSX';
            }

            return resolvedConfig.type === 'override'
                ? 'literalNotInJSXExpressionInElement'
                : 'literalNotInJSXExpression';
        }

        /**
         * @param node The value to inspect.
         * @param messageId The value to inspect.
         * @param resolvedConfig The value to inspect.
         */
        function reportLiteralNode(
            node: Node,
            messageId: keyof typeof messages,
            resolvedConfig: ResolvedConfig,
        ) {
            report(context, messages[messageId], messageId, {
                node,
                data: {
                    text: getText(context, node).trim(),
                    element:
                        resolvedConfig.type === 'override' && 'name' in resolvedConfig
                            ? resolvedConfig.name
                            : undefined,
                },
            });
        }

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        return Object.assign(
            hasElementOverrides
                ? {
                    // Get renamed import local names mapped to their imported name
                    ImportDeclaration(node: Node<'ImportDeclaration'>) {
                        node.specifiers
                            .filter((s) => s.type === 'ImportSpecifier')
                            .forEach((specifier) => {
                                renamedImportMap.set(
                                    (specifier.local || specifier.imported).name,
                                    specifier.imported.name!,
                                );
                            });
                    },

                    // Get renamed destructured local names mapped to their imported name
                    VariableDeclaration(node: Node<'VariableDeclaration'>) {
                        node.declarations
                            .filter(
                                (d) => d.type === 'VariableDeclarator'
                                      && isRequireStatement(d.init!)
                                      && d.id.type === 'ObjectPattern',
                            )
                            .forEach((declaration) => {
                                declaration.id
                                    .properties!.filter(
                                    (property) => property.type === 'Property'
                                              && property.key.type === 'Identifier'
                                              && property.value.type === 'Identifier',
                                )
                                    .forEach((property) => {
                                        renamedImportMap.set(
                                            property.value!.name!,
                                            property.key!.name!,
                                        );
                                    });
                            });
                    },
                }
                : {},
            {
                Literal(node: Node<'Literal'>) {
                    const resolvedConfig = getOverrideConfig(node) || config;

                    const hasJSXParentOrGrandParent = hasJSXElementParentOrGrandParent(node);
                    if (hasJSXParentOrGrandParent && shouldAllowElement(resolvedConfig)) {
                        return;
                    }

                    if (isViableTextNode(node, resolvedConfig)) {
                        if (hasJSXParentOrGrandParent || !config.ignoreProps) {
                            reportLiteralNode(
                                node,
                                defaultMessageId(hasJSXParentOrGrandParent, resolvedConfig),
                                resolvedConfig,
                            );
                        }
                    }
                },

                JSXAttribute(node: Node<'JSXAttribute'>) {
                    const isLiteralString = node.value
                        && node.value.type === 'Literal'
                        && typeof node.value.value === 'string';
                    const isStringLiteral = node.value && node.value.type === 'StringLiteral';

                    if (isLiteralString || isStringLiteral) {
                        const resolvedConfig = getOverrideConfig(node) || config;

                        if (
                            resolvedConfig.noStrings
                            && !resolvedConfig.ignoreProps
                            && !resolvedConfig.allowedStrings.has(node.value!.value as string)
                        ) {
                            const messageId = resolvedConfig.type === 'override'
                                ? 'invalidPropValueInElement'
                                : 'invalidPropValue';
                            reportLiteralNode(node, messageId, resolvedConfig);
                        }
                    }
                },

                JSXText(node: Node<'JSXText'>) {
                    const resolvedConfig = getOverrideConfig(node) || config;

                    if (shouldAllowElement(resolvedConfig)) {
                        return;
                    }

                    if (isViableTextNode(node, resolvedConfig)) {
                        const hasJSXParendOrGrantParent = hasJSXElementParentOrGrandParent(node);
                        reportLiteralNode(
                            node,
                            defaultMessageId(hasJSXParendOrGrantParent, resolvedConfig),
                            resolvedConfig,
                        );
                    }
                },

                TemplateLiteral(node: Node<'TemplateLiteral'>) {
                    const ancestors = getParentAndGrandParent(node);
                    const isParentJSXExpressionCont = ancestors.parent.type === 'JSXExpressionContainer';
                    const isParentJSXElement = ancestors.grandParent.type === 'JSXElement';

                    if (isParentJSXExpressionCont) {
                        const resolvedConfig = getOverrideConfig(node) || config;

                        if (
                            resolvedConfig.noStrings
                            && (isParentJSXElement || !resolvedConfig.ignoreProps)
                        ) {
                            reportLiteralNode(
                                node,
                                defaultMessageId(isParentJSXElement, resolvedConfig),
                                resolvedConfig,
                            );
                        }
                    }
                },
            },
        );
    },
};

export default rule;
