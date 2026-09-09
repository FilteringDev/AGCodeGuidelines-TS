import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent JSX prop spreading
 * @author Ashish Gambhir
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/report';

const docsUrl = dependency0;
const report = dependency1;

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const OPTIONS = { ignore: 'ignore', enforce: 'enforce' };
const DEFAULTS = {
    html: OPTIONS.enforce,
    custom: OPTIONS.enforce,
    explicitSpread: OPTIONS.enforce,
    exceptions: [] as string[],
};

const isException = (tag: string | undefined, allExceptions: string[]) => allExceptions.indexOf(tag as string) !== -1;
const isProperty = (property: Node) => property.type === 'Property';
const getTagNameFromMemberExpression = (node: Node) => {
    if (node.property!.parent) {
        return `${node.property!.parent.object!.name}.${node.property!.name}`;
    }
    // for eslint 3
    return `${node.object!.name}.${node.property!.name}`;
};

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noSpreading: 'Prop spreading is forbidden',
};

const rule: LegacyRule<
    [
        ({
            html?: 'enforce' | 'ignore';
            custom?: 'enforce' | 'ignore';
            explicitSpread?: 'enforce' | 'ignore';
            exceptions?: string[];
            [key: string]: unknown;
        } & { [key: string]: unknown })?,
    ]
> = {
    meta: {
        docs: {
            description: 'Disallow JSX prop spreading',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('jsx-props-no-spreading'),
        },

        messages,

        schema: [
            {
                allOf: [
                    {
                        type: 'object',
                        properties: {
                            html: {
                                enum: [OPTIONS.enforce, OPTIONS.ignore],
                            },
                            custom: {
                                enum: [OPTIONS.enforce, OPTIONS.ignore],
                            },
                            explicitSpread: {
                                enum: [OPTIONS.enforce, OPTIONS.ignore],
                            },
                            exceptions: {
                                type: 'array',
                                items: {
                                    type: 'string',
                                    uniqueItems: true,
                                },
                            },
                        },
                    },
                    {
                        not: {
                            type: 'object',
                            required: ['html', 'custom'],
                            properties: {
                                html: {
                                    enum: [OPTIONS.ignore],
                                },
                                custom: {
                                    enum: [OPTIONS.ignore],
                                },
                                exceptions: {
                                    type: 'array',
                                    minItems: 0,
                                    maxItems: 0,
                                },
                            },
                        },
                    },
                ],
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || {};
        const ignoreHtmlTags = (configuration.html || DEFAULTS.html) === OPTIONS.ignore;
        const ignoreCustomTags = (configuration.custom || DEFAULTS.custom) === OPTIONS.ignore;
        const ignoreExplicitSpread = (configuration.explicitSpread || DEFAULTS.explicitSpread) === OPTIONS.ignore;
        const exceptions = configuration.exceptions || DEFAULTS.exceptions;
        return {
            JSXSpreadAttribute(node: Node<'JSXSpreadAttribute'>) {
                const jsxOpeningElement = node.parent.name;
                const { type } = jsxOpeningElement!;

                let tagName: string | undefined;
                if (type === 'JSXIdentifier') {
                    tagName = jsxOpeningElement!.name as string;
                } else if (type === 'JSXMemberExpression') {
                    tagName = getTagNameFromMemberExpression(jsxOpeningElement);
                } else {
                    tagName = undefined;
                }

                const isHTMLTag = tagName && tagName[0] !== tagName[0]!.toUpperCase();
                const isCustomTag = tagName && (tagName[0] === tagName[0]!.toUpperCase() || tagName.includes('.'));
                if (
                    isHTMLTag
                    && ((ignoreHtmlTags && !isException(tagName, exceptions))
                        || (!ignoreHtmlTags && isException(tagName, exceptions)))
                ) {
                    return;
                }
                if (
                    isCustomTag
                    && ((ignoreCustomTags && !isException(tagName, exceptions))
                        || (!ignoreCustomTags && isException(tagName, exceptions)))
                ) {
                    return;
                }
                if (
                    ignoreExplicitSpread
                    && node.argument.type === 'ObjectExpression'
                    && node.argument.properties.every(isProperty)
                ) {
                    return;
                }
                report(context, messages.noSpreading, 'noSpreading', {
                    node,
                });
            },
        };
    },
};

export default rule;
