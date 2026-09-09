import dependency0 from 'minimatch';
import type { LegacyRule, Node } from '../../types';
/**
 * @file Forbid certain props on components
 * @author Joe Lencioni
 */
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/report';

const minimatch = dependency0;
const docsUrl = dependency1;
const report = dependency2;

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const DEFAULTS = ['className', 'style'];

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    propIsForbidden: 'Prop "{{prop}}" is forbidden on Components',
};

export interface ForbiddenProp {
    propName?: string;
    propNamePattern?: string;
    allowedFor?: string[];
    allowedForPatterns?: string[];
    disallowedFor?: string[];
    disallowedForPatterns?: string[];
    message?: string;
}
const rule: LegacyRule<[{ forbid?: (string | ForbiddenProp)[] }?]> = {
    meta: {
        docs: {
            description: 'Disallow certain props on components',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('forbid-component-props'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    forbid: {
                        type: 'array',
                        items: {
                            anyOf: [
                                { type: 'string' },
                                {
                                    type: 'object',
                                    properties: {
                                        propName: { type: 'string' },
                                        allowedFor: {
                                            type: 'array',
                                            uniqueItems: true,
                                            items: { type: 'string' },
                                        },
                                        allowedForPatterns: {
                                            type: 'array',
                                            uniqueItems: true,
                                            items: { type: 'string' },
                                        },
                                        message: { type: 'string' },
                                    },
                                    additionalProperties: false,
                                },
                                {
                                    type: 'object',
                                    properties: {
                                        propName: { type: 'string' },
                                        disallowedFor: {
                                            type: 'array',
                                            uniqueItems: true,
                                            minItems: 1,
                                            items: { type: 'string' },
                                        },
                                        disallowedForPatterns: {
                                            type: 'array',
                                            uniqueItems: true,
                                            minItems: 1,
                                            items: { type: 'string' },
                                        },
                                        message: { type: 'string' },
                                    },
                                    anyOf: [
                                        { required: ['disallowedFor'] },
                                        { required: ['disallowedForPatterns'] },
                                    ],
                                    additionalProperties: false,
                                },
                                {
                                    type: 'object',
                                    properties: {
                                        propNamePattern: { type: 'string' },
                                        allowedFor: {
                                            type: 'array',
                                            uniqueItems: true,
                                            items: { type: 'string' },
                                        },
                                        allowedForPatterns: {
                                            type: 'array',
                                            uniqueItems: true,
                                            items: { type: 'string' },
                                        },
                                        message: { type: 'string' },
                                    },
                                    additionalProperties: false,
                                },
                                {
                                    type: 'object',
                                    properties: {
                                        propNamePattern: { type: 'string' },
                                        disallowedFor: {
                                            type: 'array',
                                            uniqueItems: true,
                                            minItems: 1,
                                            items: { type: 'string' },
                                        },
                                        disallowedForPatterns: {
                                            type: 'array',
                                            uniqueItems: true,
                                            minItems: 1,
                                            items: { type: 'string' },
                                        },
                                        message: { type: 'string' },
                                    },
                                    anyOf: [
                                        { required: ['disallowedFor'] },
                                        { required: ['disallowedForPatterns'] },
                                    ],
                                    additionalProperties: false,
                                },
                            ],
                        },
                    },
                },
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || {};
        const forbid = new Map(
            (configuration.forbid || DEFAULTS).map((value) => {
                // Strings have no option fields; preserve the upstream property probes.
                const fields = value as ForbiddenProp;
                const propName = typeof value === 'string' ? value : fields.propName;
                const propPattern = fields.propNamePattern;
                const prop = propName || propPattern;
                const options = {
                    allowList: ([] as string[]).concat(fields.allowedFor || []),
                    allowPatternList: ([] as string[]).concat(fields.allowedForPatterns || []),
                    disallowList: ([] as string[]).concat(fields.disallowedFor || []),
                    disallowPatternList: ([] as string[]).concat(fields.disallowedForPatterns || []),
                    message: typeof value === 'string' ? null : fields.message,
                    isPattern: !!fields.propNamePattern,
                };
                return [prop, options];
            }),
        );

        /**
         * @returns The result of this check.
         * @param prop The prop value.
         */
        function getPropOptions(prop: string | Node<'JSXIdentifier'>) {
            // Get config options having pattern
            const propNamePatternArray = Array.from(forbid.entries()).filter(
                (propEntry) => propEntry[1].isPattern,
            );
            // Match current prop with pattern options, return if matched
            const propNamePattern = propNamePatternArray.find(
                (propPatternVal) => minimatch(prop as string, propPatternVal[0]!),
            );
            // Get options for matched propNamePattern
            const propNamePatternOptions = propNamePattern && propNamePattern[1];

            const options = forbid.get(prop as string) || propNamePatternOptions;
            return options;
        }

        /**
         * @returns The result of this check.
         * @param prop The prop value.
         * @param tagName The tag name value.
         */
        function isForbidden(prop: string | Node<'JSXIdentifier'>, tagName: string) {
            const options = getPropOptions(prop);
            if (!options) {
                return false;
            }

            /**
             * @returns The result of this check.
             */
            function checkIsTagForbiddenByAllowOptions() {
                if (options!.allowList.indexOf(tagName) !== -1) {
                    return false;
                }

                if (options!.allowPatternList.length === 0) {
                    return true;
                }

                return options!.allowPatternList.every((pattern) => !minimatch(tagName, pattern));
            }

            /**
             * @returns The result of this check.
             */
            function checkIsTagForbiddenByDisallowOptions() {
                if (options!.disallowList.indexOf(tagName) !== -1) {
                    return true;
                }

                if (options!.disallowPatternList.length === 0) {
                    return false;
                }

                return options!.disallowPatternList.some((pattern) => minimatch(tagName, pattern));
            }

            const hasDisallowOptions = options!.disallowList.length > 0 || options!.disallowPatternList.length > 0;

            // disallowList should have a least one item (schema configuration)
            const isTagForbidden = hasDisallowOptions
                ? checkIsTagForbiddenByDisallowOptions()
                : checkIsTagForbiddenByAllowOptions();

            // if the tagName is undefined (`<this.something>`), we assume it's a forbidden element
            return typeof tagName === 'undefined' || isTagForbidden;
        }

        return {
            JSXAttribute(node: Node<'JSXAttribute'>) {
                const parentName = (node.parent as Node<'JSXOpeningElement'>).name;
                // Extract a component name when using a "namespace", e.g. `<AntdLayout.Content />`.
                const tag = parentName!.name || `${parentName!.object!.name}.${parentName!.property!.name}`;
                const componentName = parentName!.name || parentName!.property!.name;
                if (
                    componentName
                    && typeof (componentName as string)[0] === 'string'
                    && (componentName as string)[0] !== (componentName as string)[0]!.toUpperCase()
                ) {
                    // This is a DOM node, not a Component, so exit.
                    return;
                }

                const prop = node.name.name;

                if (!isForbidden(prop, tag as string)) {
                    return;
                }

                const customMessage = getPropOptions(prop)!.message;

                report(
                    context,
                    customMessage || messages.propIsForbidden,
                    !customMessage && 'propIsForbidden',
                    {
                        node,
                        data: {
                            prop,
                        },
                    },
                );
            },
        };
    },
};

export default rule;
