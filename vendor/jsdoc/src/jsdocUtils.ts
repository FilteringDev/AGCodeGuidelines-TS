import type { TSESTree } from '@typescript-eslint/types';
import { parseComment, stringify, tryParse } from '@es-joy/jsdoccomment';
import { hasReturnValue, hasValueOrExecutorHasNonEmptyResolveValue } from './utils/hasReturnValue';
// Options are validated against this rule's metadata schema before execution.
import getDefaultTagStructureForMode from './getDefaultTagStructureForMode';
import { closureTags, jsdocTags, typeScriptTags } from './tagNames';
import WarnSettings from './WarnSettings';

type Options = [import('../types').SharedOptions?];

export type Integer = number;
export type ESTreeOrTypeScriptNode =
    import('./utils/hasReturnValue').ESTreeOrTypeScriptNode;

export type ParserMode = 'jsdoc' | 'typescript' | 'closure' | 'permissive';

let tagStructure: import('./getDefaultTagStructureForMode').TagStructure;

/**
 * @param mode The mode value.
 */
const setTagStructure = (mode: ParserMode): void => {
    tagStructure = getDefaultTagStructureForMode(mode);
};

export type ParamCommon =
    | undefined
    | string
    | {
        name: Integer;
        restElement: boolean;
    }
    | {
        isRestProperty: boolean | undefined;
        name: string | (string | undefined)[] | undefined;
        restElement: boolean;
    }
    | {
        name: string | (string | undefined)[] | undefined;
        restElement: boolean;
    };
export type ParamNameInfo =
    | ParamCommon
    | [
          string | undefined,
          FlattendRootInfo & {
              annotationParamName?: string;
          },
    ]
    | NestedParamInfo;

export type FlattendRootInfo = {
    hasPropertyRest: boolean;
    hasRestElement: boolean;
    names: string[];
    rests: boolean[];
};
export type NestedParamInfo = [string, string[] | ParamInfo[]];
export type ParamInfo =
    | ParamCommon
    | [
          string | undefined,
          FlattendRootInfo & {
              annotationParamName?: string;
          },
    ]
    | NestedParamInfo;

export type FlattenRoots = (
    params: ParamInfo[],
    root?: string,
) => FlattendRootInfo;

const flattenRoots: FlattenRoots = (params, root = '') => {
    let hasRestElement = false;
    let hasPropertyRest = false;

    const rests: boolean[] = [];

    const names = params.reduce(
        /**
         * @param acc The acc value.
         * @param cur The cur value.
         * @returns The result of this check.
         */
        (acc: string[], cur: ParamInfo): string[] => {
            if (Array.isArray(cur)) {
                let nms: ParamInfo[];
                const [, nested] = cur;
                if (Array.isArray(nested)) {
                    nms = nested;
                } else {
                    if (nested.hasRestElement) {
                        hasRestElement = true;
                    }

                    if (nested.hasPropertyRest) {
                        hasPropertyRest = true;
                    }

                    nms = nested.names;
                }

                const flattened = flattenRoots(
                    nms,
                    root ? `${root}.${cur[0]}` : cur[0],
                );
                if (flattened.hasRestElement) {
                    hasRestElement = true;
                }

                if (flattened.hasPropertyRest) {
                    hasPropertyRest = true;
                }

                const inner = [
                    root ? `${root}.${cur[0]}` : cur[0],
                    ...flattened.names,
                ].filter(Boolean) as string[];
                rests.push(false, ...flattened.rests);

                return acc.concat(inner);
            }

            if (typeof cur === 'object') {
                if ('isRestProperty' in cur && cur.isRestProperty) {
                    hasPropertyRest = true;
                    rests.push(true);
                } else {
                    rests.push(false);
                }

                if ('restElement' in cur && cur.restElement) {
                    hasRestElement = true;
                }

                acc.push(
                    root ? `${root}.${String(cur.name)}` : String(cur.name),
                );
            } else if (typeof cur !== 'undefined') {
                rests.push(false);
                acc.push(root ? `${root}.${cur}` : cur);
            }

            return acc;
        },
        [],
    );

    return {
        hasPropertyRest,
        hasRestElement,
        names,
        rests,
    };
};

/**
 * @param propSignature The prop signature value.
 * @returns The result of this check.
 */
const getPropertiesFromPropertySignature = (
    propSignature:
        | TSESTree.TSIndexSignature
        | TSESTree.TSConstructSignatureDeclaration
        | TSESTree.TSCallSignatureDeclaration
        | TSESTree.TSPropertySignature,
): undefined | string | [string, string[]] => {
    if (
        propSignature.type === 'TSIndexSignature'
        || propSignature.type === 'TSConstructSignatureDeclaration'
        || propSignature.type === 'TSCallSignatureDeclaration'
    ) {
        return undefined;
    }

    if (
        propSignature.typeAnnotation
        && propSignature.typeAnnotation.typeAnnotation.type === 'TSTypeLiteral'
    ) {
        return [(
            propSignature.key as TSESTree.Identifier
        ).name,
        propSignature.typeAnnotation.typeAnnotation.members.map(
            (member) => getPropertiesFromPropertySignature(
                member as TSESTree.TSPropertySignature,
            ) as string
            ,
        ),
        ];
    }

    return (
        propSignature.key as TSESTree.Identifier
    ).name;
};

/**
 * @param functionNode The function node value.
 * @param [checkDefaultObjects] The check default objects value.
 * @param [ignoreInterfacedParameters] The ignore interfaced parameters value.
 * @throws When the function signature cannot be interpreted.
 * @returns The function parameter names, including destructured paths.
 */
const getFunctionParameterNames = (
    functionNode: ESTreeOrTypeScriptNode | null,
    checkDefaultObjects?: boolean,
    ignoreInterfacedParameters?: boolean,
): ParamNameInfo[] => {
    /**
     * @param param The param value.
     * @param [isProperty] The is property value.
     * @returns The result of this check.
     */
    const getParamName = (
        param:
            | import('estree').Identifier
            | import('estree').AssignmentPattern
            | import('estree').ObjectPattern
            | import('estree').Property
            | import('estree').RestElement
            | import('estree').ArrayPattern
            | TSESTree.TSParameterProperty
            | TSESTree.Property
            | TSESTree.RestElement
            | TSESTree.Identifier
            | TSESTree.ObjectPattern
            | TSESTree.BindingName
            | TSESTree.Parameter,
        isProperty?: boolean,
    ): ParamNameInfo | [string, ParamNameInfo[]] => {
        const hasLeftTypeAnnotation = 'left' in param && 'typeAnnotation' in param.left;

        if ('typeAnnotation' in param || hasLeftTypeAnnotation) {
            if (
                ignoreInterfacedParameters
                && 'typeAnnotation' in param
                && param.typeAnnotation
            ) {
                // No-op
                return [
                    undefined,
                    {
                        hasPropertyRest: false,
                        hasRestElement: false,
                        names: [],
                        rests: [],
                    },
                ];
            }

            const typeAnnotation = hasLeftTypeAnnotation
                ? (
                    param.left as TSESTree.Identifier
                ).typeAnnotation
                : (
                    param as
                          | TSESTree.Identifier
                          | TSESTree.ObjectPattern
                ).typeAnnotation;

            if (typeAnnotation?.typeAnnotation?.type === 'TSTypeLiteral') {
                const propertyNames = typeAnnotation.typeAnnotation.members.map(
                    (member) => getPropertiesFromPropertySignature(

                        member as TSESTree.TSPropertySignature,
                    ),
                );

                const flattened = {
                    ...flattenRoots(propertyNames),
                    annotationParamName:
                        'name' in param ? param.name : undefined,
                };
                const hasLeftName = 'left' in param && 'name' in param.left;

                if ('name' in param || hasLeftName) {
                    return [
                        hasLeftName
                            ? (
                                param.left as TSESTree.Identifier
                            ).name
                            : (
                                param as TSESTree.Identifier
                            ).name,
                        flattened,
                    ];
                }

                return [undefined, flattened];
            }
        }

        if ('name' in param) {
            return param.name;
        }

        if ('left' in param && 'name' in param.left) {
            return param.left.name;
        }

        if (
            param.type === 'ObjectPattern'
            || ('left' in param && param.left.type === 'ObjectPattern')
        ) {
            const properties = (
                param as TSESTree.ObjectPattern
            ).properties

                 || (
                     (
                         param as TSESTree.AssignmentPattern
                     ).left as import('estree').ObjectPattern
                 )?.properties;
            const roots = properties.map((prop) => getParamName(prop, true));

            return [undefined, flattenRoots(roots)];
        }

        if (param.type === 'Property') {
            switch (param.value.type) {
                case 'ArrayPattern': {
                    return [
                        (param.key as import('estree').Identifier).name, (
                            param.value as import('estree').ArrayPattern
                        ).elements.map((prop, idx) => ({
                            name: idx,
                            restElement: prop?.type === 'RestElement',
                        })),
                    ];
                }

                case 'ObjectPattern': {
                    return [(
                        param.key as import('estree').Identifier
                    ).name, (
                        param.value as import('estree').ObjectPattern
                    ).properties.map((prop) => getParamName(
                        prop,
                        isProperty,
                    ) as string | [string, string[]]),
                    ];
                }

                case 'AssignmentPattern': {
                    switch (param.value.left.type) {
                        case 'ArrayPattern':
                            return [
                                (param.key as import('estree').Identifier).name, (
                                    param.value
                                        .left as import('estree').ArrayPattern
                                ).elements.map((prop, idx) => ({
                                    name: idx,
                                    restElement:
                                            prop?.type === 'RestElement',
                                })),
                            ];
                        case 'Identifier':
                            // Default parameter
                            if (
                                checkDefaultObjects
                                && param.value.right.type === 'ObjectExpression'
                            ) {
                                return [(
                                    param.key as import('estree').Identifier
                                ).name,
                                param.value.right.properties.map((prop) => getParamName(

                                    prop as import('estree').Property,
                                    isProperty,
                                ) as string),
                                ];
                            }

                            break;
                        case 'ObjectPattern':
                            return [
                                (param.key as import('estree').Identifier).name, (
                                    param.value
                                        .left as import('estree').ObjectPattern
                                ).properties.map((prop) => getParamName(prop, isProperty)),
                            ];

                        default: break;
                    }

                    break;
                }

                default: break;
            }

            switch (param.key.type) {
                case 'Identifier':
                    return param.key.name;

                // The key of an object could also be a string or number
                case 'Literal':

                    return (param.key.raw
                        || (param.key.value as string)
                    );

                // case 'MemberExpression':
                default:
                    // Todo: We should really create a structure (and a corresponding
                    //   option analogous to `checkRestProperty`) which allows for
                    //   (and optionally requires) dynamic properties to have a single
                    //   line of documentation
                    return undefined;
            }
        }

        if (
            param.type === 'ArrayPattern' || (
                param as import('estree').AssignmentPattern
            ).left?.type === 'ArrayPattern'
        ) {
            const elements = (
                param as import('estree').ArrayPattern
            ).elements
                  || (
                      (param as import('estree').AssignmentPattern)
                          .left as import('estree').ArrayPattern
                  )?.elements;
            const roots = elements.map((prop, idx) => ({
                name: `"${idx}"`,
                restElement: prop?.type === 'RestElement',
            }));

            return [undefined, flattenRoots(roots)];
        }

        if (['ExperimentalRestProperty', 'RestElement'].includes(param.type)) {
            const restArgument = (param as {
                argument: { name?: string; elements?: { name?: string }[] };
            }).argument;
            return {
                isRestProperty: isProperty,
                name: restArgument.name ?? restArgument.elements?.map(({ name }) => name),
                restElement: true,
            };
        }

        if (param.type === 'TSParameterProperty') {
            return getParamName(
                (
                    param as TSESTree.TSParameterProperty
                )
                    .parameter as TSESTree.Identifier,
                true,
            );
        }

        throw new Error(
            `Unsupported function signature format: \`${param.type}\`.`,
        );
    };

    if (!functionNode) {
        return [];
    }

    return (
        ((
            (
                functionNode as TSESTree.TSPropertySignature
            )?.typeAnnotation
                ?.typeAnnotation as TSESTree.TSFunctionType
        )?.params
             || (
                 functionNode as TSESTree.FunctionDeclaration
             ).params
             || (
                 functionNode as TSESTree.MethodDefinition
             ).value?.params
            || []
        ).map((param) => getParamName(param))
    );
};

/**
 * @param functionNode The function node value.
 * @returns The result of this check.
 */
// MethodDefinition support would also need value.params.
const hasParams = (functionNode: ESTreeOrTypeScriptNode): Integer => (
    functionNode as TSESTree.FunctionDeclaration
).params.length;

/**
 * Gets all names of the target type, including those that refer to a path, e.g.
 * `foo` or `foo.bar`.
 * @param jsdoc The jsdoc value.
 * @param targetTagName The target tag name value.
 * @returns The result of this check.
 */
const getJsdocTagsDeep = (
    jsdoc: import('comment-parser').Block,
    targetTagName: string,
): {
    idx: Integer;
    name: string;
    type: string;
}[] => {
    const ret: { idx: number; name: string; type: string }[] = [];
    Array.from(jsdoc.tags.entries()).forEach(([idx, { name, tag, type }]) => {
        if (tag !== targetTagName) {
            return;
        }

        ret.push({
            idx,
            name,
            type,
        });
    });

    return ret;
};

const modeWarnSettings = WarnSettings();

/**
 * @param mode The mode value.
 * @param context The rule context.
 * @returns The result of this check.
 */
const getTagNamesForMode = (
    mode: ParserMode | undefined,
    context: Pick<import('../types').Context, 'report'>,
): import('./tagNames').AliasedTags => {
    switch (mode) {
        case 'closure':
        case 'permissive':
            return closureTags;
        case 'jsdoc':
            return jsdocTags;
        case 'typescript':
            return typeScriptTags;
        default:
            if (!modeWarnSettings.hasBeenWarned(context, 'mode')) {
                context.report({
                    loc: {
                        end: {
                            column: 1,
                            line: 1,
                        },
                        start: {
                            column: 1,
                            line: 1,
                        },
                    },
                    message: `Unrecognized value \`${mode}\` for \`settings.jsdoc.mode\`.`,
                });
                modeWarnSettings.markSettingAsWarned(context, 'mode');
            }

            // We'll avoid breaking too many other rules
            return jsdocTags;
    }
};

/**
 * @param tg The tg value.
 * @param [returnArray] The return array value.
 * @returns The result of this check.
 */
const getTagDescription = (
    tg: import('comment-parser').Spec,
    returnArray?: boolean,
): string[] | string => {
    const descriptions: string[] = [];
    tg.source.some(
        ({
            tokens: {
                description,
                end,
                lineEnd,
                name,
                postDelimiter,
                postTag,
                tag,
                type,
            },
        }) => {
            const desc = (
                (tag && postTag)
                    || (!tag && !name && !type && postDelimiter)
                    || ''
            )
            // Remove space
                .slice(1)
                + (description || '')
                + (lineEnd || '');

            if (end) {
                if (desc) {
                    descriptions.push(desc);
                }

                return true;
            }

            descriptions.push(desc);

            return false;
        },
    );

    return returnArray ? descriptions : descriptions.join('\n');
};

export type Reporter = {
    report: (descriptor: import('eslint').Rule.ReportDescriptor) => void;
};

/**
 * @param name The name value.
 * @param mode The mode value.
 * @param tagPreference The tag preference value.
 * @param context The rule context.
 * @returns The result of this check.
 */
const getPreferredTagNameSimple = (
    name: string,
    mode: ParserMode | undefined,
    tagPreference: TagNamePreference = {},

    context: Pick<import('../types').Context, 'report'> = {
        report() {
            // No-op
        },
    },
):
    | string
    | false
    | {
        message: string;
        replacement?: string | undefined;
    } => {
    const prefValues = Object.values(tagPreference);
    if (
        prefValues.includes(name)
        || prefValues.some((prefVal) => (
            prefVal
                && typeof prefVal === 'object'
                && prefVal.replacement === name
        ))
    ) {
        return name;
    }

    // Allow keys to have a 'tag ' prefix to avoid upstream bug in ESLint
    // that disallows keys that conflict with Object.prototype,
    // e.g. 'tag constructor' for 'constructor':
    // https://github.com/eslint/eslint/issues/13289
    // https://github.com/gajus/eslint-plugin-jsdoc/issues/537
    const tagPreferenceFixed = Object.fromEntries(
        Object.entries(tagPreference).map(([key, value]) => [key.replace(/^tag /v, ''), value]),
    );

    if (Object.hasOwn(tagPreferenceFixed, name)) {
        return tagPreferenceFixed[name]!;
    }

    const tagNames = getTagNamesForMode(mode, context);

    const preferredTagName = Object.entries(tagNames).find(([, aliases]) => aliases.includes(name))?.[0];
    if (preferredTagName) {
        return preferredTagName;
    }

    return name;
};

/**
 * @param context The rule context.
 * @param mode The mode value.
 * @param name The name value.
 * @param definedTags The defined tags value.
 * @returns The result of this check.
 */
const isValidTag = (
    context: import('../types').Context,
    mode: ParserMode | undefined,
    name: string,
    definedTags: string[],
): boolean => {
    const tagNames = getTagNamesForMode(mode, context);

    const validTagNames = Object.keys(tagNames).concat(
        Object.values(tagNames).flat(),
    );
    const additionalTags = definedTags;
    const allTags = validTagNames.concat(additionalTags);

    return allTags.includes(name);
};

/**
 * @param jsdoc The jsdoc value.
 * @param targetTagName The target tag name value.
 * @returns The result of this check.
 */
const hasTag = (
    jsdoc: import('./iterateJsdoc').JsdocBlockWithInline,
    targetTagName: string,
): boolean => {
    const targetTagLower = targetTagName.toLowerCase();

    return jsdoc.tags.some((doc) => doc.tag.toLowerCase() === targetTagLower);
};

/**
 * @param jsdoc The jsdoc value.
 * @param filter The filter value.
 * @returns The result of this check.
 */
const filterTags = (
    jsdoc: import('./iterateJsdoc').JsdocBlockWithInline,
    filter: (tag: import('@es-joy/jsdoccomment').JsdocTagWithInline) => boolean,
): import('@es-joy/jsdoccomment').JsdocTagWithInline[] => jsdoc.tags.filter((tag) => filter(tag));

/**
 * @param jsdoc The jsdoc value.
 * @param tagName The tag name value.
 * @returns The result of this check.
 */
const getTags = (
    jsdoc: import('./iterateJsdoc').JsdocBlockWithInline,
    tagName: string,
): import('comment-parser').Spec[] => filterTags(jsdoc, (item) => item.tag === tagName);

/**
 * @param jsdoc The jsdoc value.
 * @param cfg The cfg value.
 * @param cfg.tagName The tag name value.
 * @param cfg.context The rule context.
 * @param cfg.mode The mode value.
 * @param cfg.report The report value.
 * @param cfg.tagNamePreference The tag name preference value.
 * @param cfg.skipReportingBlockedTag The skip reporting blocked tag value.
 * @param cfg.allowObjectReturn The allow object return value.
 * @param cfg.defaultMessage The default message value.
 * @returns The result of this check.
 */
const getPreferredTagName = (
    jsdoc: import('./iterateJsdoc').JsdocBlockWithInline,
    cfg: {
        tagName: string;
        context?: import('../types').Context;
        mode?: ParserMode;
        report?: import('./iterateJsdoc').Report;
        tagNamePreference?: TagNamePreference;
        skipReportingBlockedTag?: boolean;
        allowObjectReturn?: boolean;
        defaultMessage?: string;
    },
):
    | string
    | undefined
    | false
    | {
        message: string;
        replacement?: string | undefined;
    }
    | {
        blocked: true;
        tagName: string;
    } => {
    const {
        allowObjectReturn = false,
        context,
        tagName,
        defaultMessage = `Unexpected tag \`@${tagName}\``,
        mode,
        report = () => {},
        skipReportingBlockedTag = false,
        tagNamePreference,
    } = cfg;

    const ret = getPreferredTagNameSimple(
        tagName,
        mode,
        tagNamePreference,
        context,
    );
    const isObject = ret && typeof ret === 'object';
    if (
        hasTag(jsdoc, tagName)
        && (ret === false || (isObject && !ret.replacement))
    ) {
        if (skipReportingBlockedTag) {
            return {
                blocked: true,
                tagName,
            };
        }

        const message = (isObject && ret.message) || defaultMessage;
        report(message, null, getTags(jsdoc, tagName)[0]);

        return false;
    }

    return isObject && !allowObjectReturn ? ret.replacement : ret;
};

/**
 * @param jsdoc The jsdoc value.
 * @param tagName The tag name value.
 * @param arrayHandler The array handler value.
 * @param cfg The cfg value.
 * @param [cfg.context] The rule context.
 * @param [cfg.mode] The mode value.
 * @param [cfg.report] The report value.
 * @param [cfg.tagNamePreference] The tag name preference value.
 * @param [cfg.skipReportingBlockedTag] The skip reporting blocked tag value.
 */
const forEachPreferredTag = (
    jsdoc: import('./iterateJsdoc').JsdocBlockWithInline,
    tagName: string,
    arrayHandler: (
        matchingJsdocTag: import('@es-joy/jsdoccomment').JsdocTagWithInline,
        targetTagName: string,
    ) => void,
    cfg: {
        context?: import('../types').Context;
        mode?: ParserMode;
        report?: import('./iterateJsdoc').Report;
        tagNamePreference?: TagNamePreference;
        skipReportingBlockedTag?: boolean;
    } = {},
): void => {
    const {
        context,
        mode,
        report,
        skipReportingBlockedTag = false,
        tagNamePreference,
    } = cfg;

    const targetTagName = getPreferredTagName(
        jsdoc,
        {
            context,
            mode,
            report,
            skipReportingBlockedTag,
            tagName,
            tagNamePreference,
        },
    ) as string | false;
    if (
        !targetTagName
        || (skipReportingBlockedTag
            && targetTagName
            && typeof targetTagName === 'object')
    ) {
        return;
    }

    const matchingJsdocTags = jsdoc.tags.filter(({ tag }) => tag === targetTagName);

    (matchingJsdocTags).forEach((matchingJsdocTag) => {
        arrayHandler(
            matchingJsdocTag as import('@es-joy/jsdoccomment').JsdocTagWithInline,
            targetTagName,
        );
    });
};

/**
 * Get all inline tags and inline tags in tags
 * @param jsdoc The jsdoc value.
 * @returns The result of this check.
 */
const getInlineTags = (
    jsdoc: import('./iterateJsdoc').JsdocBlockWithInline,
): (
    | import('comment-parser').Spec
    | (import('@es-joy/jsdoccomment').JsdocInlineTagNoType & {
        line?: number | undefined;
        column?: number | undefined;
    })
)[] => [
    ...jsdoc.inlineTags.map((inlineTag) => {
        // Tags don't have source or line numbers, so add before returning
        let line = -1;
        const sourceLines = Array.from(jsdoc.source);
        for (let sourceLinesIndex = 0; sourceLinesIndex < sourceLines.length; sourceLinesIndex += 1) {
            const {
                tokens: { description },
            } = sourceLines[sourceLinesIndex]!;
            line += 1;
            if (description && description.includes(`{@${inlineTag.tag}`)) {
                break;
            }
        }

        Object.assign(inlineTag, { line });

        return inlineTag;
    }),
    ...jsdoc.tags.flatMap((tag) => {
        (tag.inlineTags).forEach((inlineTag) => {
            let line: import('./iterateJsdoc').Integer = 0;
            const tagLines = Array.from(tag.source);
            for (let tagLinesIndex = 0; tagLinesIndex < tagLines.length; tagLinesIndex += 1) {
                const {
                    number,
                    tokens: { description },
                } = tagLines[tagLinesIndex]!;
                if (
                    description
                        && description.includes(`{@${inlineTag.tag}`)
                ) {
                    line = number;
                    break;
                }
            }

            Object.assign(inlineTag, { line });
        });

        return (
            (
                tag as import('comment-parser').Spec & {
                    inlineTags: import('@es-joy/jsdoccomment').JsdocInlineTagNoType[];
                }
            ).inlineTags
        );
    }),
];

/**
 * Get all tags, inline tags and inline tags in tags
 * @param jsdoc The jsdoc value.
 * @returns The result of this check.
 */
const getAllTags = (
    jsdoc: import('./iterateJsdoc').JsdocBlockWithInline,
): (
    | import('comment-parser').Spec
    | (import('@es-joy/jsdoccomment').JsdocInlineTagNoType & {
        line?: number | undefined;
        column?: number | undefined;
    })
)[] => [...jsdoc.tags, ...getInlineTags(jsdoc)];

/**
 * @param jsdoc The jsdoc value.
 * @param targetTagNames The target tag names value.
 * @returns The result of this check.
 */
const hasATag = (
    jsdoc: import('./iterateJsdoc').JsdocBlockWithInline,
    targetTagNames: string[],
): boolean => targetTagNames.some((targetTagName) => hasTag(jsdoc, targetTagName));

/**
 * Checks if the JSDoc comment has an undefined type.
 * @param tag The tag value.
 *   the tag which should be checked.
 * @param mode The mode value.
 * @returns *   true in case a defined type is undeclared; otherwise false.
 */
const mayBeUndefinedTypeTag = (
    tag: import('comment-parser').Spec | null | undefined,
    mode: ParserMode,
): boolean => {
    // The function should not continue in the event the type is not defined...
    if (typeof tag === 'undefined' || tag === null) {
        return true;
    }

    // .. same applies if it declares an `{undefined}` or `{void}` type
    const tagType = tag.type.trim();

    // Exit early if matching
    if (
        tagType === 'undefined'
        || tagType === 'void'
        || tagType === '*'
        || tagType === 'any'
    ) {
        return true;
    }

    let parsedTypes;
    try {
        parsedTypes = tryParse(
            tagType,
            mode === 'permissive' ? undefined : [mode],
        );
    } catch {
        // Ignore
    }

    if (
        // We do not traverse deeply as it could be, e.g., `Promise<void>`
        parsedTypes
        && parsedTypes.type === 'JsdocTypeUnion'
        && parsedTypes.elements.some((elem) => (
            elem.type === 'JsdocTypeUndefined'
                || (elem.type === 'JsdocTypeName' && elem.value === 'void')
        ))
    ) {
        return true;
    }

    // In any other case, a type is present
    return false;
};

/**
 * @param map The map value.
 * @param tag The tag value.
 * @returns The result of this check.
 */
const ensureMap = (
    map: import('./getDefaultTagStructureForMode').TagStructure,
    tag: string,
): Map<string, string | string[] | boolean | undefined> => {
    if (!map.has(tag)) {
        map.set(tag, new Map());
    }

    return map.get(tag) as Map<
        string,
        string | boolean
    >;
};

/**
 * @param structuredTags The structured tags value.
 * @param tagMap The tag map value.
 */
const overrideTagStructure = (
    structuredTags: import('./iterateJsdoc').StructuredTags,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure = tagStructure,
): void => {
    (Object.entries(
        structuredTags,
    )).forEach(([tag, { name, required = [], type }]) => {
        const tagStruct = ensureMap(tagMap, tag);

        tagStruct.set('namepathRole', name);
        tagStruct.set('typeAllowed', type);

        const requiredName = required.includes('name');
        if (requiredName && name === false) {
            throw new Error(
                'Cannot add "name" to `require` with the tag\'s `name` set to `false`',
            );
        }

        tagStruct.set('nameRequired', requiredName);

        const requiredType = required.includes('type');
        if (requiredType && type === false) {
            throw new Error(
                'Cannot add "type" to `require` with the tag\'s `type` set to `false`',
            );
        }

        tagStruct.set('typeRequired', requiredType);

        const typeOrNameRequired = required.includes('typeOrNameRequired');
        if (typeOrNameRequired && name === false) {
            throw new Error(
                'Cannot add "typeOrNameRequired" to `require` with the tag\'s `name` set to `false`',
            );
        }

        if (typeOrNameRequired && type === false) {
            throw new Error(
                'Cannot add "typeOrNameRequired" to `require` with the tag\'s `type` set to `false`',
            );
        }

        tagStruct.set('typeOrNameRequired', typeOrNameRequired);
    });
};

/**
 * @param mode The mode value.
 * @param structuredTags The structured tags value.
 * @returns The result of this check.
 */
const getTagStructureForMode = (
    mode: ParserMode,
    structuredTags: import('./iterateJsdoc').StructuredTags,
): import('./getDefaultTagStructureForMode').TagStructure => {
    const tagStruct = getDefaultTagStructureForMode(mode);

    try {
        overrideTagStructure(structuredTags, tagStruct);
    } catch {
        //
    }

    return tagStruct;
};

/**
 * @param tag The tag value.
 * @param tagMap The tag map value.
 * @returns The result of this check.
 */
const isNameOrNamepathDefiningTag = (
    tag: string,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure = tagStructure,
): boolean => {
    const tagStruct = ensureMap(tagMap, tag);

    return (
        ['name-defining', 'namepath-defining'] as (
            | string
            | boolean
            | undefined
        )[]
    ).includes(tagStruct.get(
        'namepathRole',
    ) as string | boolean | undefined);
};

/**
 * @param sourceCode The source text and token accessors.
 * @returns The result of this check.
 */
const getJSDocCommentBlocks = (
    sourceCode: import('eslint').SourceCode,
): import('@es-joy/jsdoccomment').JsdocBlockWithInline[] => sourceCode
    .getAllComments()
    .filter((comment) => /^\*(?!\*)/v.test(comment.value))
    .map((commentNode) => parseComment(commentNode, ''));

/**
 * @param sourceCode The source text and token accessors.
 * @returns The result of this check.
 */
const getDocumentNamepathDefiningTags = (
    sourceCode: import('eslint').SourceCode,
): import('comment-parser').Spec[] => getJSDocCommentBlocks(sourceCode).flatMap((doc) => doc.tags.filter(({ tag }) => (
    isNameOrNamepathDefiningTag(tag)
                && !['arg', 'argument', 'param', 'prop', 'property'].includes(tag)
)));

/**
 * @param tag The tag value.
 * @param tagMap The tag map value.
 * @returns The result of this check.
 */
const isNamepathReferencingTag = (
    tag: string,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure = tagStructure,
): boolean => {
    const tagStruct = ensureMap(tagMap, tag);
    return tagStruct.get('namepathRole') === 'namepath-referencing';
};

/**
 * @param tag The tag value.
 * @param tagMap The tag map value.
 * @returns The result of this check.
 */
const isNamepathOrUrlReferencingTag = (
    tag: string,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure = tagStructure,
): boolean => {
    const tagStruct = ensureMap(tagMap, tag);
    return tagStruct.get('namepathRole') === 'namepath-or-url-referencing';
};

/**
 * @param tag The tag value.
 * @param tagMap The tag map value.
 * @returns The result of this check.
 */
const tagMustHaveTypePosition = (
    tag: string,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure = tagStructure,
): boolean | undefined => {
    const tagStruct = ensureMap(tagMap, tag);

    return tagStruct.get('typeRequired') as
        | boolean
        | undefined;
};

/**
 * @param tag The tag value.
 * @param tagMap The tag map value.
 * @returns The result of this check.
 */
const tagMightHaveTypePosition = (
    tag: string,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure = tagStructure,
): boolean | string => {
    if (tagMustHaveTypePosition(tag, tagMap)) {
        return true;
    }

    const tagStruct = ensureMap(tagMap, tag);

    const ret = tagStruct.get(
        'typeAllowed',
    ) as boolean | undefined;

    return ret === undefined ? true : ret;
};

const namepathTypes = new Set([
    'name-defining',
    'namepath-defining',
    'namepath-referencing',
]);

/**
 * @param tag The tag value.
 * @param tagMap The tag map value.
 * @returns The result of this check.
 */
const tagMightHaveNamePosition = (
    tag: string,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure = tagStructure,
): boolean => {
    const tagStruct = ensureMap(tagMap, tag);

    const ret = tagStruct.get('namepathRole');

    return ret === undefined ? true : Boolean(ret);
};

/**
 * @param tag The tag value.
 * @param tagMap The tag map value.
 * @returns The result of this check.
 */
const tagMightHaveNameOrNamepath = (
    tag: string,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure = tagStructure,
): boolean => {
    const tagStruct = ensureMap(tagMap, tag);

    const nampathRole = tagStruct.get('namepathRole');

    return (
        nampathRole !== false
        && namepathTypes.has(nampathRole as string)
    );
};

/**
 * @param tag The tag value.
 * @param tagMap The tag map value.
 * @returns The result of this check.
 */
const tagMightHaveNamepath = (
    tag: string,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure = tagStructure,
): boolean => {
    const tagStruct = ensureMap(tagMap, tag);

    const nampathRole = tagStruct.get('namepathRole');

    return (
        nampathRole !== false
        && ['namepath-defining', 'namepath-referencing'].includes(nampathRole as string)
    );
};

/**
 * @param tag The tag value.
 * @param tagMap The tag map value.
 * @returns The result of this check.
 */
const tagMightHaveName = (
    tag: string,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure = tagStructure,
): boolean => {
    const tagStruct = ensureMap(tagMap, tag);

    const nampathRole = tagStruct.get('namepathRole');

    return nampathRole !== false && nampathRole === 'name-defining';
};

/**
 * @param tag The tag value.
 * @param tagMap The tag map value.
 * @returns The result of this check.
 */
const tagMustHaveNamePosition = (
    tag: string,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure = tagStructure,
): boolean | undefined => {
    const tagStruct = ensureMap(tagMap, tag);

    return tagStruct.get('nameRequired') as
        | boolean
        | undefined;
};

/**
 * @param tag The tag value.
 * @param tagMap The tag map value.
 * @returns The result of this check.
 */
const tagMightHaveEitherTypeOrNamePosition = (
    tag: string,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure,
): boolean => (
    Boolean(tagMightHaveTypePosition(tag, tagMap))
        || tagMightHaveNameOrNamepath(tag, tagMap)
);

/**
 * @param tag The tag value.
 * @param tagMap The tag map value.
 * @returns The result of this check.
 */
const tagMustHaveEitherTypeOrNamePosition = (
    tag: string,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure,
): boolean | undefined => {
    const tagStruct = ensureMap(tagMap, tag);

    return tagStruct.get(
        'typeOrNameRequired',
    ) as boolean;
};

/**
 * @param tag The tag value.
 * @param tagMap The tag map value.
 * @returns The result of this check.
 */
const tagMissingRequiredTypeOrNamepath = (
    tag: import('comment-parser').Spec,
    tagMap: import('./getDefaultTagStructureForMode').TagStructure = tagStructure,
): boolean | undefined => {
    const mustHaveTypePosition = tagMustHaveTypePosition(tag.tag, tagMap);
    const mightHaveTypePosition = tagMightHaveTypePosition(tag.tag, tagMap);
    const hasTypePosition = mightHaveTypePosition && Boolean(tag.type);
    const hasNameOrNamepathPosition = (tagMustHaveNamePosition(tag.tag, tagMap)
            || tagMightHaveNameOrNamepath(tag.tag, tagMap))
        && Boolean(tag.name);
    const mustHaveEither = tagMustHaveEitherTypeOrNamePosition(tag.tag, tagMap);
    const hasEither = tagMightHaveEitherTypeOrNamePosition(tag.tag, tagMap)
        && (hasTypePosition || hasNameOrNamepathPosition);

    return mustHaveEither && !hasEither && !mustHaveTypePosition;
};

/**
 * @param node The node to inspect.
 * @param [checkYieldReturnValue] The check yield return value value.
 * @returns The result of this check.
 */
const hasNonFunctionYield = (
    node: ESTreeOrTypeScriptNode | null | undefined,
    checkYieldReturnValue?: boolean,
): boolean => {
    if (!node) {
        return false;
    }

    switch (node.type) {
        case 'ArrayExpression':
        case 'ArrayPattern':
            return node.elements.some((element) => hasNonFunctionYield(element, checkYieldReturnValue));
        case 'AssignmentExpression':
        case 'BinaryExpression':
        case 'LogicalExpression': {
            return (
                hasNonFunctionYield(node.left, checkYieldReturnValue)
                || hasNonFunctionYield(node.right, checkYieldReturnValue)
            );
        }

        case 'AssignmentPattern':
            return hasNonFunctionYield(node.right, checkYieldReturnValue);
        case 'BlockStatement': {
            return node.body.some((bodyNode) => (
                ![
                    'ArrowFunctionExpression',
                    'FunctionDeclaration',
                    'FunctionExpression',
                ].includes(bodyNode.type)
                    && hasNonFunctionYield(bodyNode, checkYieldReturnValue)
            ));
        }

        case 'CallExpression':
        case 'OptionalCallExpression':
            return node.arguments.some((element) => hasNonFunctionYield(element, checkYieldReturnValue));
        case 'ChainExpression':
        case 'ExpressionStatement': {
            return hasNonFunctionYield(node.expression, checkYieldReturnValue);
        }

        case 'ClassProperty':
        case 'ObjectProperty':
        case 'Property':
        case 'PropertyDefinition':
            return (
                (node.computed
                    && hasNonFunctionYield(node.key, checkYieldReturnValue))
                || hasNonFunctionYield(node.value, checkYieldReturnValue)
            );

        case 'ConditionalExpression':
        case 'IfStatement': {
            return (
                hasNonFunctionYield(node.test, checkYieldReturnValue)
                || hasNonFunctionYield(node.consequent, checkYieldReturnValue)
                || hasNonFunctionYield(node.alternate, checkYieldReturnValue)
            );
        }

        case 'DoWhileStatement':
        case 'ForInStatement':
        case 'ForOfStatement':
        case 'ForStatement':
        case 'LabeledStatement':
        case 'WhileStatement':
        case 'WithStatement': {
            return hasNonFunctionYield(node.body, checkYieldReturnValue);
        }

        case 'Import':
        case 'ImportExpression':
            return hasNonFunctionYield(node.source, checkYieldReturnValue);

            // ?.

        case 'MemberExpression':
        case 'OptionalMemberExpression':
            return (
                hasNonFunctionYield(node.object, checkYieldReturnValue)
                || hasNonFunctionYield(node.property, checkYieldReturnValue)
            );

        case 'ObjectExpression':
        case 'ObjectPattern':
            return node.properties.some((property) => hasNonFunctionYield(property, checkYieldReturnValue));

        case 'ObjectMethod':

            return (
                (node.computed
                    && hasNonFunctionYield(node.key, checkYieldReturnValue))
                || node.arguments.some((nde) => hasNonFunctionYield(nde, checkYieldReturnValue))
            );
        case 'ReturnStatement': {
            if (node.argument === null) {
                return false;
            }

            return hasNonFunctionYield(node.argument, checkYieldReturnValue);
        }

        // Comma
        case 'SequenceExpression':
        case 'TemplateLiteral':
            return node.expressions.some((subExpression) => hasNonFunctionYield(
                subExpression,
                checkYieldReturnValue,
            ));
        case 'SpreadElement':
        case 'UnaryExpression':
            return hasNonFunctionYield(node.argument, checkYieldReturnValue);

        case 'SwitchStatement': {
            return node.cases.some(({ consequent }) => {
                const yieldsValue = consequent.some((nde) => hasNonFunctionYield(nde, checkYieldReturnValue));
                return yieldsValue;
            });
        }

        case 'TaggedTemplateExpression':
            return hasNonFunctionYield(node.quasi, checkYieldReturnValue);

        case 'TryStatement': {
            return (
                hasNonFunctionYield(node.block, checkYieldReturnValue)
                || hasNonFunctionYield(
                    node.handler && node.handler.body,
                    checkYieldReturnValue,
                )
                || hasNonFunctionYield(
                    node.finalizer as TSESTree.BlockStatement,
                    checkYieldReturnValue,
                )
            );
        }

        case 'VariableDeclaration': {
            return node.declarations.some((nde) => hasNonFunctionYield(nde, checkYieldReturnValue));
        }

        case 'VariableDeclarator': {
            return (
                hasNonFunctionYield(node.id, checkYieldReturnValue)
                || hasNonFunctionYield(node.init, checkYieldReturnValue)
            );
        }

        case 'YieldExpression': {
            if (checkYieldReturnValue) {
                if ((
                    node as import('eslint').Rule.Node
                ).parent?.type === 'VariableDeclarator'
                ) {
                    return true;
                }

                return false;
            }

            // void return does not count.
            if (node.argument === null) {
                return false;
            }

            return true;
        }

        default: {
            return false;
        }
    }
};

/**
 * Checks if a node has a return statement. Void return does not count.
 * @param node The node to inspect.
 * @param [checkYieldReturnValue] The check yield return value value.
 * @returns The result of this check.
 */
const hasYieldValue = (
    node: ESTreeOrTypeScriptNode,
    checkYieldReturnValue?: boolean,
): boolean => (
    (
        node as TSESTree.FunctionDeclaration
    ).generator
         && ((
             node as TSESTree.FunctionDeclaration
         ).expression
            || hasNonFunctionYield(

                (
                    node as TSESTree.FunctionDeclaration
                ).body,
                checkYieldReturnValue,
            ))
);

/**
 * Checks if a node has a throws statement.
 * @param node The node to inspect.
 * @param [innerFunction] The inner function value.
 * @returns The result of this check.
 */
const hasThrowValue = (
    node: ESTreeOrTypeScriptNode | null | undefined,
    innerFunction?: boolean,
): boolean => {
    if (!node) {
        return false;
    }

    // There are cases where a function may execute its inner function which
    //   throws, but we're treating functions atomically rather than trying to
    //   follow them
    switch (node.type) {
        case 'ArrowFunctionExpression':
        case 'FunctionDeclaration':
        case 'FunctionExpression': {
            return (
                !innerFunction && !node.async && hasThrowValue(node.body, true)
            );
        }

        case 'BlockStatement': {
            return node.body.some((bodyNode) => (
                bodyNode.type !== 'FunctionDeclaration'
                    && hasThrowValue(bodyNode)
            ));
        }

        case 'DoWhileStatement':
        case 'ForInStatement':
        case 'ForOfStatement':
        case 'ForStatement':
        case 'LabeledStatement':
        case 'WhileStatement':
        case 'WithStatement': {
            return hasThrowValue(node.body);
        }

        case 'IfStatement': {
            return (
                hasThrowValue(node.consequent) || hasThrowValue(node.alternate)
            );
        }

        case 'SwitchStatement': {
            return node.cases.some((someCase) => someCase.consequent.some((nde) => hasThrowValue(nde)));
        }

        case 'ThrowStatement': {
            return true;
        }

        // We only consider it to throw an error if the catch or finally blocks throw an error.
        case 'TryStatement': {
            return (
                hasThrowValue(node.handler && node.handler.body)
                || hasThrowValue(node.finalizer)
            );
        }

        default: {
            return false;
        }
    }
};

/**
 * @param tag The tag value.
 */
/**
const isInlineTag = (tag) => {
  return /^(@link|@linkcode|@linkplain|@tutorial) /v.test(tag);
};
 */

/**
 * Splits a `@template` tag's names on commas that separate template entries,
 * ignoring commas nested within a type expression so that default values such
 * as `[T=Record<string, unknown>]` are not split apart.
 *
 * Only `<`, `(` and `{` are treated as nesting: a comma within them is part of
 * a type (generic arguments, function params, object type). Square brackets are
 * deliberately not counted, since `[...]` is the optional/default wrapper in
 * which commas do separate entries, e.g. `[T=string, U=number]`.
 * @param str The str value.
 * @returns The result of this check.
 */
const splitTopLevelCommas = (str: string): string[] => {
    const parts = [];
    let depth = 0;
    let current = '';
    Array.from(str).forEach((char) => {
        if (char === '<' || char === '{' || char === '(') {
            depth += 1;
        } else if (char === '>' || char === '}' || char === ')') {
            depth = Math.max(0, depth - 1);
        }

        if (char === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else {
            current += char;
        }
    });

    parts.push(current);

    return parts;
};

/**
 * Parses GCC Generic/Template types
 * @see {@link https://github.com/google/closure-compiler/wiki/Generic-Types}
 * @see {@link https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html#template}
 * @param tag The tag value.
 * @returns The result of this check.
 */
const parseClosureTemplateTag = (
    tag: import('comment-parser').Spec,
): string[] => splitTopLevelCommas(tag.name).map((type) => type.trim().replace(/^\[?(?<name>.*?)=.*$/v, '$<name>'));

export type DefaultContexts = true | string[];

/**
 * Checks user option for `contexts` array, defaulting to
 * contexts designated by the rule. Returns an array of
 * ESTree AST types, indicating allowable contexts.
 * @param context The rule context.
 * @param defaultContexts The default contexts value.
 * @param settings The settings value.
 * @param settings.contexts The contexts value.
 * @returns The result of this check.
 */
const enforcedContexts = (
    context: import('../types').Context,
    defaultContexts: DefaultContexts | undefined,
    settings: {
        contexts?: import('./iterateJsdoc').Context[];
    },
): (string | import('./iterateJsdoc').ContextObject)[] => {
    const contexts = (context.options as Options)[0]?.contexts
        || settings.contexts
        || (defaultContexts === true
            ? [
                'ArrowFunctionExpression',
                'FunctionDeclaration',
                'FunctionExpression',
                'TSDeclareFunction',
            ]
            : defaultContexts);

    return contexts!;
};

/**
 * @param contexts The contexts value.
 * @param checkJsdoc The check jsdoc value.
 * @param [handler] The handler value.
 * @param [convertAny] The convert any value.
 * @returns The result of this check.
 */
const getContextObject = (
    contexts: import('./iterateJsdoc').Context[],
    checkJsdoc: import('./iterateJsdoc').CheckJsdoc,
    handler?: import('@es-joy/jsdoccomment').CommentHandler,
    convertAny?: boolean,
): import('eslint').Rule.RuleListener => {
    const properties: import('eslint').Rule.RuleListener = {};

    Array.from(contexts.entries()).forEach(([idx, prop]) => {
        let property: string;

        let value: (node: import('eslint').Rule.Node) => void;

        if (typeof prop === 'object') {
            const selInfo = {
                lastIndex: idx,
                selector: prop.context,
            };
            if (prop.comment) {
                property = prop.context as string;
                value = checkJsdoc.bind(
                    null,
                    {
                        ...selInfo,
                        comment: prop.comment,
                    },

                    (
                        handler as import('@es-joy/jsdoccomment').CommentHandler
                    ).bind(null, prop.comment) as (
                        jsdoc: import('@es-joy/jsdoccomment').JsdocBlockWithInline,
                    ) => boolean,
                );
            } else {
                property = prop.context as string;
                value = checkJsdoc.bind(null, selInfo, null);
            }
        } else {
            property = prop;

            if (convertAny && property === 'any') {
                property = ':not(Program)';
            }

            const selInfo = {
                lastIndex: idx,
                selector: property,
            };
            value = checkJsdoc.bind(null, selInfo, null);
        }

        const old = properties[property] as (node: import('eslint').Rule.Node) => void;
        properties[property] = old
            ? function visitValue(node: import('eslint').Rule.Node) {
                old(node);
                value(node);
            }
            : value;
    });

    return properties;
};

const tagsWithNamesAndDescriptions = new Set([
    'arg',
    'argument',
    'param',
    'prop',
    'property',
    'return',

    // These two are parsed by our custom parser as though having a `name`
    'returns',
    'template',
]);

export type TagNamePreference = {
    [key: string]: false | string | { message: string; replacement?: string };
};

/**
 * @param context The rule context.
 * @param mode The mode value.
 * @param tags The tags value.
 * @returns The result of this check.
 */
const getTagsByType = (
    context: import('../types').Context,
    mode: ParserMode | undefined,
    tags: import('comment-parser').Spec[],
): {
    tagsWithNames: import('comment-parser').Spec[];
    tagsWithoutNames: import('comment-parser').Spec[];
} => {
    const tagsWithoutNames: import('comment-parser').Spec[] = [];
    const tagsWithNames = tags.filter((tag) => {
        const { tag: tagName } = tag;
        const tagWithName = tagsWithNamesAndDescriptions.has(tagName);
        if (!tagWithName) {
            tagsWithoutNames.push(tag);
        }

        return tagWithName;
    });

    return {
        tagsWithNames,
        tagsWithoutNames,
    };
};

/**
 * @param sourceCode The source text and token accessors.
 * @returns The result of this check.
 */
const getIndent = (
    sourceCode:
        | import('eslint').SourceCode
        | {
            text: string;
        },
): string => `${sourceCode.text.match(/^\n*([ \t]+)/v)?.[1] ?? ''} `;

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
const isConstructor = (node: import('eslint').Rule.Node | null): boolean => (
    (node?.type === 'MethodDefinition' && node.kind === 'constructor')
         || (
             node?.parent as TSESTree.MethodDefinition
         )?.kind === 'constructor'
);

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
const isGetter = (node: import('eslint').Rule.Node | null): boolean => (
    node !== null
         && (
             node.parent as
                | TSESTree.MethodDefinition
                | TSESTree.Property
         )?.kind === 'get'
);

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
const isSetter = (node: import('eslint').Rule.Node | null): boolean => (
    node !== null
         && (
             node.parent as
                | TSESTree.MethodDefinition
                | TSESTree.Property
         )?.kind === 'set'
);

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
const hasAccessorPair = (node: import('eslint').Rule.Node): boolean => {
    const {
        key,
        kind: sourceKind,
        type,
    } = node as
        | TSESTree.MethodDefinition
        | TSESTree.Property;

    const sourceName = (
        key as TSESTree.Identifier
    ).name;

    const oppositeKind = sourceKind === 'get' ? 'set' : 'get';

    const sibling = type === 'MethodDefinition'
        ? (
            node.parent as TSESTree.ClassBody
        ).body
        : (
            node.parent as TSESTree.ObjectExpression
        ).properties;

    return sibling.some((child) => {
        const { key: ky, kind } = child as
            | TSESTree.MethodDefinition
            | TSESTree.Property;

        const { name } = (ky as TSESTree.Identifier);

        return kind === oppositeKind && name === sourceName;
    });
};

/**
 * @param jsdoc The jsdoc value.
 * @param node The node to inspect.
 * @param context The rule context.
 * @param schema The schema value.
 * @returns The result of this check.
 */
export interface SpecialMethodSchema {
    properties: Partial<Record<'checkGetters' | 'checkSetters' | 'checkConstructors', {
        default?: boolean | 'no-setter' | 'no-getter';
    }>>;
}

const exemptSpeciaMethods = (
    jsdoc: import('./iterateJsdoc').JsdocBlockWithInline,
    node: import('eslint').Rule.Node | null,
    context: import('../types').Context,
    schema: SpecialMethodSchema[],
): boolean => {
    /**
     * @param prop The prop value.
     * @returns The result of this check.
     */
    const hasSchemaOption = (
        prop: 'checkGetters' | 'checkSetters' | 'checkConstructors',
    ): boolean | 'no-setter' | 'no-getter' | undefined => {
        const schemaProperties = schema[0]!.properties;

        return (
            (context.options as [{ checkGetters?: boolean | 'no-setter'; checkSetters?: boolean | 'no-getter'; checkConstructors?: boolean }?])[0]?.[prop]
            ?? schemaProperties[prop]?.default
        );
    };

    const checkGetters = hasSchemaOption('checkGetters');
    const checkSetters = hasSchemaOption('checkSetters');

    return (
        (!hasSchemaOption('checkConstructors')
            && (isConstructor(node)
                || hasATag(jsdoc, ['class', 'constructor'])))
        || (isGetter(node)
            && (!checkGetters
                || (checkGetters === 'no-setter'
                    && hasAccessorPair(
                        (
                            node as import('./iterateJsdoc').Node
                        ).parent as import('./iterateJsdoc').Node,
                    ))))
        || (isSetter(node)
            && (!checkSetters
                || (checkSetters === 'no-getter'
                    && hasAccessorPair(
                        (
                            node as import('./iterateJsdoc').Node
                        ).parent as import('./iterateJsdoc').Node,
                    ))))
    );
};

/**
 * Since path segments may be unquoted (if matching a reserved word,
 * identifier or numeric literal) or single or double quoted, in either
 * the `@param` or in source, we need to strip the quotes to give a fair
 * comparison.
 * @param str The str value.
 * @returns The result of this check.
 */
const dropPathSegmentQuotes = (str: string): string => str.replaceAll(/\.(['"])(.*)\1/gv, '.$2');

/**
 * @param name The name value.
 * @returns The result of this check.
 */
const comparePaths = (name: string): ((otherPathName: string) => boolean) => (otherPathName) => (
    otherPathName === name
            || dropPathSegmentQuotes(otherPathName) === dropPathSegmentQuotes(name)
);

export type PathDoesNotBeginWith = (
    name: string,
    otherPathName: string,
) => boolean;

const pathDoesNotBeginWith: PathDoesNotBeginWith = (name, otherPathName) => (
    !name.startsWith(otherPathName)
        && !dropPathSegmentQuotes(name).startsWith(
            dropPathSegmentQuotes(otherPathName),
        )
);

/**
 * @param regexString The regex string value.
 * @param [requiredFlags] The required flags value.
 * @returns The result of this check.
 */
const getRegexFromString = (
    regexString: string,
    requiredFlags?: string,
): RegExp => {
    const match = regexString.match(/^\/(.*)\/([gimyvus]*)$/sv);
    let flags = 'v';
    let regex = regexString;
    if (match) {
        regex = match[1]!;
        flags = match[2]!;
        if (!flags) {
            flags = 'v';
        }
    }

    const uniqueFlags = [...new Set(flags + (requiredFlags || ''))];
    flags = uniqueFlags.join('');

    return new RegExp(regex, flags);
};

const strictNativeTypes = [
    'undefined',
    'null',
    'boolean',
    'number',
    'bigint',
    'string',
    'symbol',
    'object',
    'Array',
    'Function',
    'Date',
    'RegExp',
];

/**
 * @param jsdoc The jsdoc value.
 * @param tag The tag value.
 * @param parsedType The parsed type value.
 * @param indent The indent value.
 * @param typeBracketSpacing The type bracket spacing value.
 */
const rewireByParsedType = (
    jsdoc: import('@es-joy/jsdoccomment').JsdocBlockWithInline,
    tag: import('@es-joy/jsdoccomment').JsdocTagWithInline,
    parsedType: import('jsdoc-type-pratt-parser').RootResult,
    indent: string,
    typeBracketSpacing: string = '',
) => {
    const typeLines = stringify(parsedType).split('\n');
    const firstTypeLine = typeLines.shift();
    const lastTypeLine = typeLines.pop();

    const beginNameOrDescIdx = tag.source.findIndex(({ tokens }) => tokens.name || tokens.description);

    const nameAndDesc = beginNameOrDescIdx === -1 ? null : tag.source.slice(beginNameOrDescIdx);

    const initialNumber = tag.source[0]!.number;

    let continuationTokens: Partial<import('comment-parser').Tokens> = {};
    if (typeLines.length || lastTypeLine) {
        continuationTokens = {
            end: '', name: '', postName: '', postType: '',
        };
    } else if (nameAndDesc) {
        continuationTokens = { name: nameAndDesc[0]!.tokens.name, postType: ' ' };
    }

    const src = [
        // Get inevitably present tag from first `tag.source`
        {
            number: initialNumber,
            source: '',
            tokens: {
                ...tag.source[0]!.tokens,
                ...continuationTokens,
                type:
                    `{${
                        typeBracketSpacing
                    }${firstTypeLine
                    }${!typeLines.length && lastTypeLine === undefined
                        ? `${typeBracketSpacing}}`
                        : ''}`,
            },
        },
        // Get any intervening type lines
        ...(typeLines.length
            ? typeLines.map((typeLine, idx) => ({
                number: initialNumber + idx + 1,
                source: '',
                tokens: {
                    // Grab any delimiter info from first item
                    ...tag.source[0]!.tokens,
                    delimiter:
                              tag.source[0]!.tokens.delimiter === '/**'
                                  ? '*'
                                  : tag.source[0]!.tokens.delimiter,
                    end: '',
                    name: '',
                    postName: '',
                    postTag: '',
                    postType: '',
                    start: `${indent} `,
                    tag: '',
                    type: typeLine,
                },
            }))
            : []),
    ];

    // Merge any final type line and name and description
    if (
        // Name and description may be already included if present with the tag
        nameAndDesc
        && beginNameOrDescIdx > 0
    ) {
        if (typeLines.length || lastTypeLine !== undefined) {
            src.push({
                number: src.length + 1,
                source: '',
                tokens: {
                    ...nameAndDesc[0]!.tokens,
                    type: `${lastTypeLine + typeBracketSpacing}}`,
                },
            });
        }

        if (
            // Get any remaining description lines
            nameAndDesc.length > 1
        ) {
            src.push(
                ...nameAndDesc.slice(1).map(({ source, tokens }, idx) => ({
                    number: src.length + idx + 2,
                    source,
                    tokens,
                })),
            );
        }
    } else if (nameAndDesc) {
        if ((typeLines.length || lastTypeLine !== undefined) && lastTypeLine) {
            src.push({
                number: src.length + 1,
                source: '',
                tokens: {
                    ...nameAndDesc[0]!.tokens,
                    delimiter:
                        nameAndDesc[0]!.tokens.delimiter === '/**'
                            ? '*'
                            : nameAndDesc[0]!.tokens.delimiter,
                    postTag: '',
                    start: `${indent} `,
                    tag: '',
                    type: `${lastTypeLine + typeBracketSpacing}}`,
                },
            });
        }

        if (
            // Get any remaining description lines
            nameAndDesc.length > 1
        ) {
            src.push(
                ...nameAndDesc.slice(1).map(({ source, tokens }, idx) => ({
                    number: src.length + idx + 2,
                    source,
                    tokens,
                })),
            );
        }
    } else if (lastTypeLine) {
        src.push({
            number: src.length + 1,
            source: '',
            tokens: {
                ...tag.source[0]!.tokens,
                delimiter:
                    tag.source[0]!.tokens.delimiter === '/**'
                        ? '*'
                        : tag.source[0]!.tokens.delimiter,
                postTag: '',
                start: `${indent} `,
                tag: '',
                type: `${lastTypeLine + typeBracketSpacing}}`,
            },
        });
    }

    Object.assign(tag, { source: src });

    // Properly rewire `jsdoc.source`
    const firstTagIdx = jsdoc.source.findIndex(({ tokens: { tag: tg } }) => tg);

    const initialEndSource = jsdoc.source.find(({ tokens: { end } }) => end);

    Object.assign(jsdoc, {
        source: [
            ...jsdoc.source.slice(0, firstTagIdx),
            ...jsdoc.tags.flatMap(({ source }) => source),
        ],
    });

    if (initialEndSource && !jsdoc.source.at(-1)?.tokens?.end) {
        jsdoc.source.push(initialEndSource);
    }
};

export {
    comparePaths,
    dropPathSegmentQuotes,
    enforcedContexts,
    exemptSpeciaMethods,
    filterTags,
    flattenRoots,
    forEachPreferredTag,
    getAllTags,
    getContextObject,
    getDocumentNamepathDefiningTags,
    getFunctionParameterNames,
    getIndent,
    getInlineTags,
    getJSDocCommentBlocks,
    getJsdocTagsDeep,
    getPreferredTagName,
    getPreferredTagNameSimple,
    getRegexFromString,
    getTagDescription,
    getTags,
    getTagsByType,
    getTagStructureForMode,
    hasATag,
    hasParams,
    hasTag,
    hasThrowValue,
    hasYieldValue,
    isConstructor,
    isGetter,
    isNameOrNamepathDefiningTag,
    isNamepathOrUrlReferencingTag,
    isNamepathReferencingTag,
    isSetter,
    isValidTag,
    mayBeUndefinedTypeTag,
    overrideTagStructure,
    parseClosureTemplateTag,
    pathDoesNotBeginWith,
    rewireByParsedType,
    setTagStructure,
    strictNativeTypes,
    tagMightHaveEitherTypeOrNamePosition,
    tagMightHaveName,
    tagMightHaveNameOrNamepath,
    tagMightHaveNamepath,
    tagMightHaveNamePosition,
    tagMightHaveTypePosition,
    tagMissingRequiredTypeOrNamepath,
    tagMustHaveNamePosition,
    tagMustHaveTypePosition,
};
export { hasReturnValue, hasValueOrExecutorHasNonEmptyResolveValue };
