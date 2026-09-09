import dependency0 from 'array-includes';
import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file Forbid target='_blank' attribute
 * @author Kevin Miller
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

/**
 * @param arr The arr value.
 * @param condition The condition value.
 * @returns The result of this check.
 */
function findLastIndex<T>(arr: readonly T[], condition: (item: T) => unknown) {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
        if (condition(arr[i]!)) {
            return i;
        }
    }

    return -1;
}

/**
 * @param attribute The attribute value.
 * @returns The result of this check.
 */
function attributeValuePossiblyBlank(
    attribute: Node<'JSXSpreadAttribute'> | Node<'JSXAttribute'> | undefined,
) {
    if (!attribute || !attribute.value) {
        return false;
    }
    const { value } = attribute;
    if (value.type === 'Literal') {
        return typeof value.value === 'string' && value.value.toLowerCase() === '_blank';
    }
    if (value.type === 'JSXExpressionContainer') {
        const expr = value.expression;
        if (expr.type === 'Literal') {
            return typeof expr.value === 'string' && expr.value.toLowerCase() === '_blank';
        }
        if (expr.type === 'ConditionalExpression') {
            if (
                expr.alternate.type === 'Literal'
                && expr.alternate.value
                && (expr.alternate.value as string).toLowerCase() === '_blank'
            ) {
                return true;
            }
            if (
                expr.consequent.type === 'Literal'
                && expr.consequent.value
                && (expr.consequent.value as string).toLowerCase() === '_blank'
            ) {
                return true;
            }
        }
    }
    return false;
}

/**
 * @param node The node to inspect.
 * @param linkAttributes The link attributes value.
 * @param warnOnSpreadAttributes The warn on spread attributes value.
 * @param spreadAttributeIndex The spread attribute index value.
 * @returns The result of this check.
 */
function hasExternalLink(
    node: Node<'JSXOpeningElement'>,
    linkAttributes: string[],
    warnOnSpreadAttributes?: boolean,
    spreadAttributeIndex?: number,
) {
    const linkIndex = findLastIndex(
        node.attributes,
        (attr) => attr.name && includes(linkAttributes, attr.name.name),
    );
    const foundExternalLink = linkIndex !== -1
        && ((attr) => attr.value
            && attr.value.type === 'Literal'
            && /^(?:\w+:|\/\/)/.test(attr.value.value as string))(node.attributes![linkIndex]!);
    return foundExternalLink || (warnOnSpreadAttributes && linkIndex < spreadAttributeIndex!);
}

/**
 * @param node The node to inspect.
 * @param linkAttributes The link attributes value.
 * @returns The result of this check.
 */
function hasDynamicLink(node: Node<'JSXOpeningElement'>, linkAttributes: string[]) {
    const dynamicLinkIndex = findLastIndex(
        node.attributes,
        (attr) => attr.name
            && includes(linkAttributes, attr.name.name)
            && attr.value
            && attr.value.type === 'JSXExpressionContainer',
    );
    if (dynamicLinkIndex !== -1) {
        return true;
    }

    return undefined;
}

/**
 * Get the string(s) from a value
 * @param value The AST node being checked.
 * @param targetValue The AST node being checked.
 * @returns The string value, or null if not a string.
 */
function getStringFromValue(
    value: Node | null | undefined,
    targetValue: Node | null | undefined,
): unknown {
    if (value) {
        if (value.type === 'Literal') {
            return value.value;
        }
        if (value.type === 'JSXExpressionContainer') {
            if (value.expression.type === 'TemplateLiteral') {
                return value.expression.quasis[0]!.value.cooked;
            }
            const expr = value.expression;
            if (expr && expr.type === 'ConditionalExpression') {
                const relValues = [expr.consequent.value, expr.alternate.value];
                if (
                    targetValue!.type === 'JSXExpressionContainer'
                    && targetValue!.expression
                    && targetValue!.expression.type === 'ConditionalExpression'
                ) {
                    const targetTestCond = targetValue!.expression.test.name;
                    const relTestCond = value.expression.test!.name;
                    if (targetTestCond === relTestCond) {
                        const targetBlankIndex = [
                            targetValue!.expression.consequent.value,
                            targetValue!.expression.alternate.value,
                        ].indexOf('_blank');
                        return relValues[targetBlankIndex];
                    }
                }
                return relValues;
            }
            return expr.value;
        }
    }
    return null;
}

/**
 * @param node The node to inspect.
 * @param allowReferrer The allow referrer value.
 * @param warnOnSpreadAttributes The warn on spread attributes value.
 * @param spreadAttributeIndex The spread attribute index value.
 * @returns The result of this check.
 */
function hasSecureRel(
    node: Node<'JSXOpeningElement'>,
    allowReferrer?: boolean,
    warnOnSpreadAttributes?: boolean,
    spreadAttributeIndex?: number,
) {
    const relIndex = findLastIndex(
        node.attributes,
        (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'rel',
    );
    const targetIndex = findLastIndex(
        node.attributes,
        (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'target',
    );
    if (relIndex === -1 || (warnOnSpreadAttributes && relIndex < spreadAttributeIndex!)) {
        return false;
    }

    const relAttribute = node.attributes![relIndex];
    const targetAttributeValue = node.attributes![targetIndex] && node.attributes![targetIndex]!.value;
    const value = getStringFromValue(relAttribute!.value, targetAttributeValue);
    return ([] as unknown[]).concat(value).every((item) => {
        const tags = typeof item === 'string' ? item.toLowerCase().split(' ') : false;
        const noreferrer = tags && tags.indexOf('noreferrer') >= 0;
        if (noreferrer) {
            return true;
        }
        const noopener = tags && tags.indexOf('noopener') >= 0;
        return allowReferrer && noopener;
    });
}

const messages = {
    noTargetBlankWithoutNoreferrer:
        'Using target="_blank" without rel="noreferrer" (which implies rel="noopener") is a security risk in older browsers: see https://mathiasbynens.github.io/rel-noopener/#recommendations',
    noTargetBlankWithoutNoopener:
        'Using target="_blank" without rel="noreferrer" or rel="noopener" (the former implies the latter and is preferred due to wider support) is a security risk: see https://mathiasbynens.github.io/rel-noopener/#recommendations',
};

const rule: LegacyRule<
    [
        {
            allowReferrer?: boolean;
            enforceDynamicLinks?: 'always' | 'never';
            warnOnSpreadAttributes?: boolean;
            links?: boolean;
            forms?: boolean;
        }?,
    ]
> = {
    meta: {
        fixable: 'code',
        docs: {
            description: 'Disallow `target="_blank"` attribute without `rel="noreferrer"`',
            category: 'Best Practices',
            recommended: true,
            url: docsUrl('jsx-no-target-blank'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    allowReferrer: {
                        type: 'boolean',
                    },
                    enforceDynamicLinks: {
                        enum: ['always', 'never'],
                    },
                    warnOnSpreadAttributes: {
                        type: 'boolean',
                    },
                    links: {
                        type: 'boolean',
                        default: true,
                    },
                    forms: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const configuration = {
            allowReferrer: false,
            warnOnSpreadAttributes: false,
            links: true,
            forms: false,
            ...context.options[0],
        };
        const { allowReferrer } = configuration;
        const { warnOnSpreadAttributes } = configuration;
        const enforceDynamicLinks = configuration.enforceDynamicLinks || 'always';
        const linkComponents = linkComponentsUtil.getLinkComponents(context);
        const formComponents = linkComponentsUtil.getFormComponents(context);

        return {
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                const targetIndex = findLastIndex(
                    node.attributes,
                    (attr) => attr.name && attr.name.name === 'target',
                );
                const spreadAttributeIndex = findLastIndex(
                    node.attributes,
                    (attr) => attr.type === 'JSXSpreadAttribute',
                );

                if (linkComponents.has(node.name.name as string)) {
                    if (!attributeValuePossiblyBlank(node.attributes[targetIndex])) {
                        const hasSpread = spreadAttributeIndex >= 0;

                        if (warnOnSpreadAttributes && hasSpread) {
                            // continue to check below
                        } else if (
                            (hasSpread && targetIndex < spreadAttributeIndex)
                            || !hasSpread
                            || !warnOnSpreadAttributes
                        ) {
                            return;
                        }
                    }

                    const linkAttributes = linkComponents.get(node.name.name as string)!;
                    const hasDangerousLink = hasExternalLink(
                        node,
                        linkAttributes,
                        warnOnSpreadAttributes,
                        spreadAttributeIndex,
                    )
                        || (enforceDynamicLinks === 'always' && hasDynamicLink(node, linkAttributes));
                    if (
                        hasDangerousLink
                        && !hasSecureRel(node, allowReferrer, warnOnSpreadAttributes, spreadAttributeIndex)
                    ) {
                        const messageId = allowReferrer
                            ? 'noTargetBlankWithoutNoopener'
                            : 'noTargetBlankWithoutNoreferrer';
                        const relValue = allowReferrer ? 'noopener' : 'noreferrer';
                        report(context, messages[messageId], messageId, {
                            node,
                            fix(fixer: Fixer) {
                                // eslint 5 uses `node.attributes`; eslint 6+ uses `node.parent.attributes`
                                const nodeWithAttrs = (
                                    node.parent.attributes ? node.parent : node
                                ) as Node<'JSXOpeningElement'>;
                                // eslint 5 does not provide a `name` property on JSXSpreadElements
                                const relAttribute = nodeWithAttrs.attributes!.find(
                                    (attr) => attr.name && attr.name.name === 'rel',
                                );

                                if (
                                    targetIndex < spreadAttributeIndex
                                    || (spreadAttributeIndex >= 0 && !relAttribute)
                                ) {
                                    return null;
                                }

                                if (!relAttribute) {
                                    return fixer.insertTextAfter(
                                        nodeWithAttrs.attributes!.slice(-1)[0]!,
                                        ` rel="${relValue}"`,
                                    );
                                }

                                if (!relAttribute.value) {
                                    return fixer.insertTextAfter(relAttribute, `="${relValue}"`);
                                }

                                if (relAttribute.value.type === 'Literal') {
                                    const parts = (relAttribute.value.value as string)
                                        .split('noreferrer')
                                        .filter(Boolean);
                                    return fixer.replaceText(
                                        relAttribute.value,
                                        `"${parts.concat('noreferrer').join(' ')}"`,
                                    );
                                }

                                if (relAttribute.value.type === 'JSXExpressionContainer') {
                                    if (relAttribute.value.expression.type === 'Literal') {
                                        if (typeof relAttribute.value.expression.value === 'string') {
                                            const parts = relAttribute.value.expression.value
                                                .split('noreferrer')
                                                .filter(Boolean);
                                            return fixer.replaceText(
                                                relAttribute.value.expression,
                                                `"${parts.concat('noreferrer').join(' ')}"`,
                                            );
                                        }

                                        // for undefined, boolean, number, symbol, bigint, and null
                                        return fixer.replaceText(relAttribute.value, '"noreferrer"');
                                    }
                                }

                                return null;
                            },
                        });
                    }
                }
                if (formComponents.has(node.name.name as string)) {
                    if (!attributeValuePossiblyBlank(node.attributes[targetIndex])) {
                        const hasSpread = spreadAttributeIndex >= 0;

                        if (warnOnSpreadAttributes && hasSpread) {
                            // continue to check below
                        } else if (
                            (hasSpread && targetIndex < spreadAttributeIndex)
                            || !hasSpread
                            || !warnOnSpreadAttributes
                        ) {
                            return;
                        }
                    }

                    if (!configuration.forms || hasSecureRel(node)) {
                        return;
                    }

                    const formAttributes = formComponents.get(node.name.name as string)!;

                    if (
                        hasExternalLink(node, formAttributes)
                        || (enforceDynamicLinks === 'always' && hasDynamicLink(node, formAttributes))
                    ) {
                        const messageId = allowReferrer
                            ? 'noTargetBlankWithoutNoopener'
                            : 'noTargetBlankWithoutNoreferrer';
                        report(context, messages[messageId], messageId, {
                            node,
                        });
                    }
                }
            },
        };
    },
};

export default rule;
