import dependency0 from 'array-includes';
import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent usage of `javascript:` URLs
 * @author Sergei Startsev
 */
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/linkComponents';
import dependency3 from '../util/report';

const includes = dependency0;
const docsUrl = dependency1;
const linkComponentsUtil = dependency2;
const report = dependency3;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

// https://github.com/facebook/react/blob/d0ebde77f6d1/packages/react-dom/src/shared/sanitizeURL.js#L30

const isJavaScriptProtocol = /^j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;

/**
 * @param attr The attr value.
 * @returns The result of this check.
 */
function hasJavaScriptProtocol(attr: Node<'JSXAttribute'>) {
    if (!attr.value || attr.value.type !== 'Literal') {
        return false;
    }
    const value = String(attr.value.value);
    let start = 0;
    // Match the original URL sanitization prefix: every C0 control and ASCII space.
    while (start < value.length && value.charCodeAt(start) <= 0x20) {
        start += 1;
    }
    return isJavaScriptProtocol.test(value.slice(start));
}

/**
 * @param node The node to inspect.
 * @param config The configured rule options.
 * @returns The result of this check.
 */
function shouldVerifyProp(node: Node<'JSXAttribute'>, config: Map<string, string[]>) {
    const name = node.name && node.name.name;
    const parentName = node.parent.name && node.parent.name.name;

    if (!name || !parentName || !config.has(parentName as string)) {
        return false;
    }

    const attributes = config.get(parentName as string);
    return includes(attributes!, name);
}

/**
 * @param config The configured rule options.
 * @param option The option value.
 */
function parseLegacyOption(config: Map<string, string[]>, option: { name: string; props: string[] }[]) {
    option.forEach((opt) => {
        config.set(opt.name, opt.props);
    });
}

const messages = {
    noScriptURL:
        'A future version of React will block javascript: URLs as a security precaution. Use event handlers instead if you can. If you need to generate unsafe HTML, try using dangerouslySetInnerHTML instead.',
};

const rule: LegacyRule<
    | [{ name: string; props: string[] }[]?, { includeFromSettings?: boolean; [key: string]: unknown }?]
    | [{ includeFromSettings?: boolean; [key: string]: unknown }?]
> = {
    meta: {
        docs: {
            description: 'Disallow usage of `javascript:` URLs',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('jsx-no-script-url'),
        },

        messages,

        schema: {
            anyOf: [
                {
                    type: 'array',
                    items: [
                        {
                            type: 'array',
                            uniqueItems: true,
                            items: {
                                type: 'object',
                                properties: {
                                    name: {
                                        type: 'string',
                                    },
                                    props: {
                                        type: 'array',
                                        items: {
                                            type: 'string',
                                            uniqueItems: true,
                                        },
                                    },
                                },
                                required: ['name', 'props'],
                                additionalProperties: false,
                            },
                        },
                        {
                            type: 'object',
                            properties: {
                                includeFromSettings: {
                                    type: 'boolean',
                                },
                            },
                            additionalItems: false,
                        },
                    ],
                    additionalItems: false,
                },
                {
                    type: 'array',
                    items: [
                        {
                            type: 'object',
                            properties: {
                                includeFromSettings: {
                                    type: 'boolean',
                                },
                            },
                            additionalItems: false,
                        },
                    ],
                    additionalItems: false,
                },
            ],
        },
    },

    create(context) {
        const { options } = context;
        const hasLegacyOption = Array.isArray(options[0]);
        const legacyOptions = hasLegacyOption ? (options[0] as { name: string; props: string[] }[]) : [];

        const firstOption = options.length > 0 ? options[0] : { includeFromSettings: false };
        const objectOption = hasLegacyOption && options.length > 1 ? options[1] : firstOption;
        const { includeFromSettings } = objectOption as { includeFromSettings?: boolean };

        const linkComponents = linkComponentsUtil.getLinkComponents(includeFromSettings ? context : {});
        parseLegacyOption(linkComponents, legacyOptions);

        return {
            JSXAttribute(node: Node<'JSXAttribute'>) {
                if (shouldVerifyProp(node, linkComponents) && hasJavaScriptProtocol(node)) {
                    report(context, messages.noScriptURL, 'noScriptURL', {
                        node,
                    });
                }
            },
        };
    },
};

export default rule;
