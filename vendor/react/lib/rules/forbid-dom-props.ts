import type { LegacyRule, Node } from '../../types';
/**
 * @file Forbid certain props on DOM Nodes
 * @author David Vázquez
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/report';

const docsUrl = dependency0;
const report = dependency1;

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const DEFAULTS: string[] = [];

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/**
 * @param forbidMap // { disallowList: null | string[], message: null | string }
 * @param prop The value to inspect.
 * @param tagName The value to inspect.
 * @returns The result of this check.
 */
function isForbidden(
    forbidMap: Map<string | undefined, { disallowList: string[] | null }>,
    prop: string | undefined,
    tagName: string,
) {
    const options = forbidMap.get(prop);
    return (
        options
        && (typeof tagName === 'undefined'
            || !options.disallowList
            || options.disallowList.indexOf(tagName) !== -1)
    );
}

const messages = {
    propIsForbidden: 'Prop "{{prop}}" is forbidden on DOM Nodes',
};

const rule: LegacyRule<
    [
        {
            forbid?: (
                | string
                | {
                    propName?: string;
                    disallowedFor?: string[];
                    message?: string;
                    [key: string]: unknown;
                }
            )[];
        }?,
    ]
> = {
    meta: {
        docs: {
            description: 'Disallow certain props on DOM Nodes',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('forbid-dom-props'),
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
                                {
                                    type: 'string',
                                },
                                {
                                    type: 'object',
                                    properties: {
                                        propName: {
                                            type: 'string',
                                        },
                                        disallowedFor: {
                                            type: 'array',
                                            uniqueItems: true,
                                            items: {
                                                type: 'string',
                                            },
                                        },
                                        message: {
                                            type: 'string',
                                        },
                                    },
                                },
                            ],
                            minLength: 1,
                        },
                        uniqueItems: true,
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || {};
        const forbid = new Map(
            (configuration.forbid || DEFAULTS).map((value) => {
                const propName = typeof value === 'string' ? value : value.propName;
                return [
                    propName,
                    {
                        disallowList: typeof value === 'string' ? null : value.disallowedFor || null,
                        message: typeof value === 'string' ? null : value.message,
                    },
                ];
            }),
        );

        return {
            JSXAttribute(node: Node<'JSXAttribute'>) {
                const tag = node.parent.name!.name;
                if (!(tag && typeof tag === 'string' && tag[0] !== tag[0]!.toUpperCase())) {
                    // This is a Component, not a DOM node, so exit.
                    return;
                }

                const prop = node.name.name as string;

                if (!isForbidden(forbid, prop, tag)) {
                    return;
                }

                const customMessage = forbid.get(prop)!.message;

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
