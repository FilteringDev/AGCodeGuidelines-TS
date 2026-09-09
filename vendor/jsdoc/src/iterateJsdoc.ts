// Options are validated against this rule's metadata schema before execution.
import {
    commentHandler,
    getJSDocComment,
    parseComment,
} from '@es-joy/jsdoccomment';
import { stringify as commentStringify, util } from 'comment-parser';
import esquery from 'esquery';
import * as jsdocUtils from './jsdocUtils';

type Options = [import('../types').SharedOptions?];

export type Integer = number;

export type JsdocBlockWithInline =
    import('@es-joy/jsdoccomment').JsdocBlockWithInline;

export type ContextObject = {
    disallowName?: string;
    allowName?: string;
    context?: string;
    comment?: string;
    tags?: string[];
    replacement?: string;
    minimum?: Integer;
    message?: string;
    forceRequireReturn?: boolean;
};
export type Context = string | ContextObject;

export type CheckJsdoc = (
    info: {
        lastIndex?: Integer;
        isFunctionContext?: boolean;
        selector?: string;
        comment?: string;
    },
    handler:
        | null
        | ((
            jsdoc: import('@es-joy/jsdoccomment').JsdocBlockWithInline,
        ) => boolean | undefined),
    node: import('eslint').Rule.Node,
) => void;

export type ForEachPreferredTag = (
    tagName: string,
    arrayHandler: (
        matchingJsdocTag: import('@es-joy/jsdoccomment').JsdocTagWithInline,
        targetTagName: string,
    ) => void,
    skipReportingBlockedTag?: boolean,
) => void;

export type ReportSettings = (message: string) => void;

export type ParseClosureTemplateTag = (
    tag: import('comment-parser').Spec,
) => string[];

export type GetPreferredTagNameObject = (cfg: { tagName: string }) =>
    | string
    | false
    | {
        message: string;
        replacement?: string | undefined;
    }
    | {
        blocked: true;
        tagName: string;
    };

export type BasicUtils = {
    forEachPreferredTag: ForEachPreferredTag;
    reportSettings: ReportSettings;
    parseClosureTemplateTag: ParseClosureTemplateTag;
    getPreferredTagNameObject: GetPreferredTagNameObject;
    pathDoesNotBeginWith: import('./jsdocUtils').PathDoesNotBeginWith;
    isNameOrNamepathDefiningTag: IsNamepathX;
    isNamepathReferencingTag: IsNamepathX;
    isNamepathOrUrlReferencingTag: IsNamepathX;
    tagMightHaveNameOrNamepath: IsNamepathX;
    tagMightHaveName: IsNamepathX;
};

export type IsIteratingFunction = () => boolean;

export type IsVirtualFunction = () => boolean;

export type Stringify = (
    tagBlock: import('comment-parser').Block,
    specRewire?: boolean,
) => string;

export type JsdocSuggestions = {
    desc: string;
    handler: (
        fixer: import('eslint').Rule.RuleFixer,
    ) => import('eslint').Rule.Fix | void;
}[];

export type ReportJSDoc = (
    msg: string,
    tag?:
        | null
        | import('comment-parser').Spec
        | {
            line: Integer;
            column?: Integer;
        },
    handler?:
        | ((
            fixer: import('eslint').Rule.RuleFixer,
        ) => import('eslint').Rule.Fix | void)
        | null,
    specRewire?: boolean,
    data?:
        | undefined
        | {
            [key: string]: string;
        },
    suggestions?: JsdocSuggestions,
) => void;

export type GetRegexFromString = (
    str: string,
    requiredFlags?: string,
) => RegExp;

export type GetTagDescription = (
    tg: import('comment-parser').Spec,
    returnArray?: boolean,
) => string[] | string;

export type SetTagDescription = (
    tg: import('comment-parser').Spec,
    matcher: RegExp,
    setter: (description: string) => string,
) => Integer;

export type GetDescription = () => {
    description: string;
    descriptions: string[];
    lastDescriptionLine: Integer;
};

export type SetBlockDescription = (
    setter: (
        info: {
            delimiter: string;
            postDelimiter: string;
            start: string;
        },
        seedTokens: (
            tokens?: Partial<import('comment-parser').Tokens>,
        ) => import('comment-parser').Tokens,
        descLines: string[],
        postDelims: string[],
    ) => import('comment-parser').Line[],
) => void;

export type SetDescriptionLines = (
    matcher: RegExp,
    setter: (description: string) => string,
) => Integer;

export type ChangeTag = (
    tag: import('comment-parser').Spec,
    ...tokens: Partial<import('comment-parser').Tokens>[]
) => void;

export type SetTag = (
    tag: import('comment-parser').Spec & {
        line: Integer;
    },
    tokens?: Partial<import('comment-parser').Tokens>,
) => void;

export type RemoveTag = (
    tagIndex: Integer,
    cfg?: {
        removeEmptyBlock?: boolean;
        tagSourceOffset?: Integer;
    },
) => void;

export type AddTag = (
    targetTagName: string,
    number?: Integer,
    tokens?: Partial<import('comment-parser').Tokens>,
) => void;

export type GetFirstLine = () => Integer | undefined;

export type SeedTokens = (
    tokens?: Partial<import('comment-parser').Tokens> | undefined,
) => import('comment-parser').Tokens;

export type EmptyTokens = (tokens: import('comment-parser').Tokens) => void;

export type AddLine = (
    sourceIndex: Integer,
    tokens: Partial<import('comment-parser').Tokens>,
) => void;

export type AddLines = (
    tagIndex: Integer,
    tagSourceOffset: Integer,
    numLines: Integer,
) => void;

export type MakeMultiline = () => void;

export type GetFunctionParameterNames = (
    useDefaultObjectProperties?: boolean,
    ignoreInterfacedParameters?: boolean,
) => import('./jsdocUtils').ParamNameInfo[];

export type HasParams = () => Integer;

export type IsGenerator = () => boolean;

export type IsConstructor = () => boolean;

export type GetJsdocTagsDeep = (tagName: string) =>
    | false
    | {
        idx: Integer;
        name: string;
        type: string;
    }[];

export type GetPreferredTagName = (cfg: {
    tagName: string;
    skipReportingBlockedTag?: boolean;
    allowObjectReturn?: boolean;
    defaultMessage?: string;
}) =>
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
    };

export type IsValidTag = (name: string, definedTags: string[]) => boolean;

export type HasATag = (names: string[]) => boolean;

export type HasTag = (name: string) => boolean;

export type ComparePaths = (name: string) => (otherPathName: string) => boolean;

export type DropPathSegmentQuotes = (name: string) => string;

export type AvoidDocs = (exemptSpecialMethods?: boolean) => boolean;

export type TagMightHaveNamePositionTypePosition = (
    tagName: string,
    otherModeMaps?: import('./getDefaultTagStructureForMode').TagStructure[],
) =>
    | boolean
    | {
        otherMode: true;
    };

export type TagMustHave = (
    tagName: string,
    otherModeMaps: import('./getDefaultTagStructureForMode').TagStructure[],
) =>
    | boolean
    | {
        otherMode: false;
    };

export type TagMissingRequiredTypeOrNamepath = (
    tag: import('comment-parser').Spec,
    otherModeMaps: import('./getDefaultTagStructureForMode').TagStructure[],
) =>
    | boolean
    | {
        otherMode: false;
    };

export type IsNamepathX = (tagName: string) => boolean;

export type GetTagStructureForMode = (
    mde: import('./jsdocUtils').ParserMode,
) => import('./getDefaultTagStructureForMode').TagStructure;

export type MayBeUndefinedTypeTag = (
    tag: import('comment-parser').Spec,
) => boolean;

export type HasValueOrExecutorHasNonEmptyResolveValue = (
    anyPromiseAsReturn: boolean,
    allBranches?: boolean,
) => boolean;

export type HasYieldValue = () => boolean;

export type HasYieldReturnValue = () => boolean;

export type HasThrowValue = () => boolean;

export type IsAsync = () => boolean | undefined;

export type GetTags = (tagName: string) => import('comment-parser').Spec[];

export type GetPresentTags = (
    tagList: string[],
) => import('@es-joy/jsdoccomment').JsdocTagWithInline[];

export type FilterTags = (
    filter: (tag: import('@es-joy/jsdoccomment').JsdocTagWithInline) => boolean,
) => import('@es-joy/jsdoccomment').JsdocTagWithInline[];

export type FilterAllTags = (
    filter: (
        tag:
            | import('comment-parser').Spec
            | import('@es-joy/jsdoccomment').JsdocInlineTagNoType,
    ) => boolean,
) => (
    | import('comment-parser').Spec
    | import('@es-joy/jsdoccomment').JsdocInlineTagNoType
)[];

export type getInlineTags = () => (
    | import('comment-parser').Spec
    | (import('@es-joy/jsdoccomment').JsdocInlineTagNoType & {
        line?: number | undefined;
        column?: number | undefined;
    })
)[];

export type GetTagsByType = (tags: import('comment-parser').Spec[]) => {
    tagsWithNames: import('comment-parser').Spec[];
    tagsWithoutNames: import('comment-parser').Spec[];
};

export type HasOptionTag = (tagName: string) => boolean;

export type GetClassNode = () => import('estree').Node | null;

export type GetClassJsdoc = () => null | JsdocBlockWithInline;

export type ClassHasTag = (tagName: string) => boolean;

export type FindContext = (
    contexts: Context[],
    comment: string | undefined,
) => {
    foundContext: Context | undefined;
    contextStr: string;
};

export type Utils = BasicUtils & {
    isIteratingFunction: IsIteratingFunction;
    isIteratingFunctionOrVariable: IsIteratingFunction;
    isVirtualFunction: IsVirtualFunction;
    stringify: Stringify;
    reportJSDoc: ReportJSDoc;
    getRegexFromString: GetRegexFromString;
    getTagDescription: GetTagDescription;
    setTagDescription: SetTagDescription;
    getDescription: GetDescription;
    setBlockDescription: SetBlockDescription;
    setDescriptionLines: SetDescriptionLines;
    changeTag: ChangeTag;
    setTag: SetTag;
    removeTag: RemoveTag;
    addTag: AddTag;
    getFirstLine: GetFirstLine;
    seedTokens: SeedTokens;
    emptyTokens: EmptyTokens;
    addLine: AddLine;
    addLines: AddLines;
    makeMultiline: MakeMultiline;
    flattenRoots: import('./jsdocUtils').FlattenRoots;
    getFunctionParameterNames: GetFunctionParameterNames;
    hasParams: HasParams;
    isGenerator: IsGenerator;
    isConstructor: IsConstructor;
    getJsdocTagsDeep: GetJsdocTagsDeep;
    getPreferredTagName: GetPreferredTagName;
    isValidTag: IsValidTag;
    hasATag: HasATag;
    hasTag: HasTag;
    comparePaths: ComparePaths;
    dropPathSegmentQuotes: DropPathSegmentQuotes;
    avoidDocs: AvoidDocs;
    tagMightHaveNamePosition: TagMightHaveNamePositionTypePosition;
    tagMightHaveTypePosition: TagMightHaveNamePositionTypePosition;
    tagMustHaveNamePosition: TagMustHave;
    tagMustHaveTypePosition: TagMustHave;
    tagMissingRequiredTypeOrNamepath: TagMissingRequiredTypeOrNamepath;
    isNameOrNamepathDefiningTag: IsNamepathX;
    isNamepathReferencingTag: IsNamepathX;
    isNamepathOrUrlReferencingTag: IsNamepathX;
    tagMightHaveNameOrNamepath: IsNamepathX;
    tagMightHaveName: IsNamepathX;
    tagMightHaveNamepath: IsNamepathX;
    getTagStructureForMode: GetTagStructureForMode;
    mayBeUndefinedTypeTag: MayBeUndefinedTypeTag;
    hasValueOrExecutorHasNonEmptyResolveValue: HasValueOrExecutorHasNonEmptyResolveValue;
    hasYieldValue: HasYieldValue;
    hasYieldReturnValue: HasYieldReturnValue;
    hasThrowValue: HasThrowValue;
    isAsync: IsAsync;
    getTags: GetTags;
    getPresentTags: GetPresentTags;
    filterTags: FilterTags;
    filterAllTags: FilterAllTags;
    getInlineTags: getInlineTags;
    getTagsByType: GetTagsByType;
    hasOptionTag: HasOptionTag;
    getClassNode: GetClassNode;
    getClassJsdoc: GetClassJsdoc;
    classHasTag: ClassHasTag;
    findContext: FindContext;
};

const { rewireSpecs, seedTokens } = util;

/**
 * Should use ESLint rule's typing.
 */
export type EslintRuleMeta = import('eslint').Rule.RuleMetaData;

/**
 * A plain object for tracking state as needed by rules across iterations.
 */
export type StateObject = {
    globalTags: boolean;
    hasDuplicates: {
        [key: string]: boolean;
    };
    selectorMap: {
        [selector: string]: {
            [comment: string]: Integer;
        };
    };
    hasTag: {
        [key: string]: boolean | undefined;
    };
    hasNonComment: number;
    hasNonCommentBeforeTag: {
        [key: string]: boolean | number;
    };
    foundTypedefValues: string[];
};

/**
 * The Node AST as supplied by the parser.
 */
export type Node = import('eslint').Rule.Node;

/**
const {
   align as commentAlign,
  flow: commentFlow,
  indent: commentIndent,
} = transforms;
 */

const globalState = new Map<string, Map<string, string>>();
/**
 * @param context The rule context.
 * @param cfg The cfg value.
 * @param cfg.tagNamePreference The tag name preference value.
 * @param cfg.mode The mode value.
 * @returns The result of this check.
 */
const getBasicUtils = (
    context: import('../types').Context,
    cfg: {
        tagNamePreference?: import('./jsdocUtils').TagNamePreference;
        mode?: import('./jsdocUtils').ParserMode;
    },
): BasicUtils => {
    const {
        mode,
        tagNamePreference,
    } = cfg;

    const utils = {} as BasicUtils;

    ([
        'isNameOrNamepathDefiningTag',
        'isNamepathReferencingTag',
        'isNamepathOrUrlReferencingTag',
        'tagMightHaveNameOrNamepath',
        'tagMightHaveName',
        'tagMightHaveNamepath',
    ]).forEach((method) => {
        utils[method as
                | 'isNameOrNamepathDefiningTag'
                | 'isNamepathReferencingTag'
                | 'isNamepathOrUrlReferencingTag'
                | 'tagMightHaveNameOrNamepath'
                | 'tagMightHaveName'
        ] = (tagName) => jsdocUtils[

            method as
                    | 'isNameOrNamepathDefiningTag'
                    | 'isNamepathReferencingTag'
                    | 'isNamepathOrUrlReferencingTag'
                    | 'tagMightHaveNameOrNamepath'
                    | 'tagMightHaveName'
        ](tagName);
    });

    utils.reportSettings = (message) => {
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
            message,
        });
    };

    utils.parseClosureTemplateTag = (tag) => jsdocUtils.parseClosureTemplateTag(tag);

    utils.pathDoesNotBeginWith = jsdocUtils.pathDoesNotBeginWith;

    utils.getPreferredTagNameObject = ({ tagName }) => {
        const ret = jsdocUtils.getPreferredTagNameSimple(
            tagName,
            mode as import('./jsdocUtils').ParserMode,
            tagNamePreference,
            context,
        );
        const isObject = ret && typeof ret === 'object';
        if (ret === false || (isObject && !ret.replacement)) {
            return {
                blocked: true,
                tagName,
            };
        }

        return ret;
    };

    return utils;
};

export type Report = (
    message: string,
    fix?: import('eslint').Rule.ReportFixer | null,
    jsdocLoc?:
        | null
        | {
            line?: Integer;
            column?: Integer;
        }
        | (import('comment-parser').Spec & {
            line?: Integer;
        }),
    data?:
        | undefined
        | {
            [key: string]: string;
        },
    suggest?: import('eslint').Rule.SuggestionReportDescriptor[],
) => void;

/**
 * @param node The node to inspect.
 * @param jsdoc The jsdoc value.
 * @param jsdocNode The jsdoc node value.
 * @param settings The settings value.
 * @param report The report value.
 * @param context The rule context.
 * @param sc The sc value.
 * @param iteratingAll The iterating all value.
 * @param ruleConfig The rule config value.
 * @param indent The indent value.
 * @returns The result of this check.
 */
const getUtils = (
    node: Node | null,
    jsdoc: JsdocBlockWithInline,
    jsdocNode: import('eslint').AST.Token,
    settings: Settings,
    report: Report,
    context: import('../types').Context,
    sc: import('eslint').SourceCode,
    iteratingAll: boolean | undefined,
    ruleConfig: RuleConfig,
    indent: string,
): Utils => {
    let ancestors: import('estree').Node[] = [];
    if (node) {
        ancestors = sc.getAncestors ? sc.getAncestors(node) : context.getAncestors();
    }

    const { sourceCode = context.getSourceCode() } = context;

    const utils = getBasicUtils(
        context,
        settings,
    ) as Utils;

    const {
        augmentsExtendsReplacesDocs,
        ignoreReplacesDocs,
        implementsReplacesDocs,
        maxLines,
        minLines,
        mode,
        overrideReplacesDocs,
        tagNamePreference,
    } = settings;

    const functionTypes = [
        'ArrowFunctionExpression',
        'FunctionDeclaration',
        'FunctionExpression',
        'MethodDefinition',
    ];

    utils.isIteratingFunction = () => !iteratingAll || functionTypes.includes(String(node?.type));

    utils.isIteratingFunctionOrVariable = () => {
        if (utils.isIteratingFunction()) {
            return true;
        }

        let declarations: import('estree').VariableDeclarator[] = [];
        if (node?.type === 'VariableDeclaration') {
            declarations = node.declarations;
        } else if (node?.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration') {
            declarations = node.declaration.declarations;
        }

        return declarations.some(({ init }) => functionTypes.includes(String(init?.type)));
    };

    utils.isVirtualFunction = () => (
        Boolean(iteratingAll)
            && utils.hasATag(['callback', 'function', 'func', 'method'])
    );

    utils.stringify = (tagBlock, specRewire) => {
        let block;
        if (specRewire) {
            block = rewireSpecs(tagBlock);
        }

        return commentStringify((specRewire
            ? block
            : (tagBlock as import('comment-parser').Block))!);
    };

    utils.reportJSDoc = (msg, tag, handler, specRewire, data, suggestions) => {
        /**
         * @param fixHandler The fix handler value.
         * @returns The result of this check.
         */
        const makeFix = (
            fixHandler: (
                fixer: import('eslint').Rule.RuleFixer,
            ) => import('eslint').Rule.Fix | void,
        ): import('eslint').Rule.ReportFixer => (fixer) => {
            const extraFix = fixHandler(fixer);

            const replacement = utils.stringify(jsdoc, specRewire);

            if (!replacement) {
                const text = sourceCode.getText();
                const lastLineBreakPos = text
                    .slice(0, jsdocNode.range[0])
                    .search(/\n[ \t]*$/v);
                if (lastLineBreakPos > -1) {
                    return [
                        fixer.removeRange([
                            lastLineBreakPos,
                            jsdocNode.range[1],
                        ]),

                        ...(extraFix ? [extraFix] : []),
                    ];
                }

                return [
                    fixer.removeRange(
                        /\s/v.test(text.charAt(jsdocNode.range[1]))
                            ? [jsdocNode.range[0], jsdocNode.range[1] + 1]
                            : jsdocNode.range,
                    ),

                    ...(extraFix ? [extraFix] : []),
                ];
            }

            return [
                fixer.replaceText(jsdocNode, replacement),
                ...(extraFix ? [extraFix] : []),
            ];
        };

        report(
            msg,
            handler ? makeFix(handler) : null,
            tag,
            data,
            suggestions?.map(({ desc, handler: suggestionHandler }) => ({
                desc,
                fix: makeFix(suggestionHandler),
            })),
        );
    };

    utils.getRegexFromString = (str, requiredFlags) => jsdocUtils.getRegexFromString(str, requiredFlags);

    utils.getTagDescription = (tg, returnArray) => jsdocUtils.getTagDescription(tg, returnArray);

    utils.setTagDescription = (tg, matcher, setter) => {
        let finalIdx = 0;
        tg.source.some(({ tokens: { description } }, idx) => {
            if (description && matcher.test(description)) {
                Object.assign(tg.source[idx]!.tokens, { description: setter(description) });
                finalIdx = idx;
                return true;
            }

            return false;
        });

        return finalIdx;
    };

    utils.getDescription = () => {
        const descriptions: string[] = [];
        let lastDescriptionLine = 0;
        let tagsBegun = false;
        jsdoc.source.some(({ tokens: { description, end, tag } }, idx) => {
            if (tag) {
                tagsBegun = true;
            }

            if (idx && (tag || end)) {
                lastDescriptionLine = idx - 1;
                if (!tagsBegun && description) {
                    descriptions.push(description);
                }

                return true;
            }

            if (!tagsBegun && (idx || description)) {
                descriptions.push(
                    description || (descriptions.length ? '' : '\n'),
                );
            }

            return false;
        });

        return {
            description: descriptions.join('\n'),
            descriptions,
            lastDescriptionLine,
        };
    };

    utils.setBlockDescription = (setter) => {
        const descLines: string[] = [];
        const postDelims: string[] = [];

        let startIdx: undefined | Integer;

        let endIdx: undefined | Integer;

        let info:
            | undefined
            | {
                delimiter: string;
                postDelimiter: string;
                start: string;
            };

        jsdoc.source.some(
            (
                {
                    tokens: {
                        delimiter,
                        description,
                        end,
                        postDelimiter,
                        start,
                        tag,
                    },
                },
                idx,
            ) => {
                if (delimiter === '/**') {
                    return false;
                }

                if (startIdx === undefined) {
                    startIdx = idx;
                    info = {
                        delimiter,
                        postDelimiter,
                        start,
                    };
                }

                if (tag || end) {
                    endIdx = idx;
                    return true;
                }

                postDelims.push(postDelimiter);
                descLines.push(description);
                return false;
            },
        );

        if (descLines.length) {
            jsdoc.source.splice(
                startIdx as Integer,
                (endIdx as Integer)
                     - (startIdx as Integer),
                ...setter(

                    info as {
                        delimiter: string;
                        postDelimiter: string;
                        start: string;
                    },
                    seedTokens,
                    descLines,
                    postDelims,
                ),
            );
        }
    };

    utils.setDescriptionLines = (matcher, setter) => {
        let finalIdx = 0;
        jsdoc.source.some(({ tokens: { description, end, tag } }, idx) => {
            if (idx && (tag || end)) {
                return true;
            }

            if (description && matcher.test(description)) {
                Object.assign(jsdoc.source[idx]!.tokens, { description: setter(description) });
                finalIdx = idx;
                return true;
            }

            return false;
        });

        return finalIdx;
    };

    utils.changeTag = (tag, ...tokens) => {
        Array.from(tag.source.entries()).forEach(([idx, src]) => {
            Object.assign(src, {
                tokens: {
                    ...src.tokens,
                    ...tokens[idx],
                },
            });
        });
    };

    utils.setTag = (tag, tokens) => {
        Object.assign(tag, {
            source: [
                {
                    number: tag.line,
                    // Or tag.source[0].number?
                    source: '',
                    tokens: seedTokens({
                        delimiter: '*',
                        postDelimiter: ' ',
                        start: `${indent} `,
                        tag: `@${tag.tag}`,
                        ...tokens,
                    }),
                },
            ],
        });
    };

    utils.removeTag = (
        tagIndex,
        { removeEmptyBlock = false, tagSourceOffset = 0 } = {},
    ) => {
        const { source: tagSource } = jsdoc.tags[tagIndex]!;
        let lastIndex: Integer | undefined;
        const firstNumber = jsdoc.source[0]!.number;
        tagSource.some(({ number }, tagIdx) => {
            const sourceIndex = jsdoc.source.findIndex(
                ({ number: srcNumber }) => number === srcNumber,
            );

            if (sourceIndex > -1) {
                let spliceCount = 1;
                tagSource
                    .slice(tagIdx + 1)
                    .some(({ tokens: { end: ending, tag } }) => {
                        if (!tag && !ending) {
                            spliceCount += 1;

                            return false;
                        }

                        return true;
                    });

                const spliceIdx = sourceIndex + tagSourceOffset;

                const { delimiter, end } = jsdoc.source[spliceIdx]!.tokens;

                if (
                    (spliceIdx === 0 && jsdoc.tags.length >= 2)
                    || (!removeEmptyBlock && (end || delimiter === '/**'))
                ) {
                    const { tokens } = jsdoc.source[spliceIdx]!;
                    ([
                        'postDelimiter',
                        'tag',
                        'postTag',
                        'type',
                        'postType',
                        'name',
                        'postName',
                        'description',
                    ]).forEach((item) => {
                        tokens[
                            item as
                                | 'postDelimiter'
                                | 'tag'
                                | 'type'
                                | 'postType'
                                | 'postTag'
                                | 'name'
                                | 'postName'
                                | 'description'
                        ] = '';
                    });
                } else {
                    jsdoc.source.splice(
                        spliceIdx,
                        spliceCount
                            - tagSourceOffset
                            + (spliceIdx ? 0 : jsdoc.source.length),
                    );
                    tagSource.splice(
                        tagIdx + tagSourceOffset,
                        spliceCount
                            - tagSourceOffset
                            + (spliceIdx ? 0 : jsdoc.source.length),
                    );
                }

                lastIndex = sourceIndex;

                return true;
            }

            return false;
        });
        Array.from(jsdoc.source.slice(lastIndex).entries()).forEach(([idx, src]) => {
            Object.assign(src, {
                number: firstNumber
                 + (lastIndex as Integer)
                + idx,
            });
        });

        // Todo: Once rewiring of tags may be fixed in comment-parser to reflect
        //         missing tags, this step should be added here (so that, e.g.,
        //         if accessing `jsdoc.tags`, such as to add a new tag, the
        //         correct information will be available)
    };

    utils.addTag = (
        targetTagName,
        number = (jsdoc.tags[jsdoc.tags.length - 1]?.source[0]?.number
            ?? jsdoc.source.findIndex(({ tokens: { tag } }) => tag) - 1) + 1,
        tokens = {},
    ) => {
        jsdoc.source.splice(number, 0, {
            number,
            source: '',
            tokens: seedTokens({
                delimiter: '*',
                postDelimiter: ' ',
                start: `${indent} `,
                tag: `@${targetTagName}`,
                ...tokens,
            }),
        });
        (jsdoc.source.slice(number + 1)).forEach((src) => {
            Object.assign(src, { number: src.number + 1 });
        });
    };

    utils.getFirstLine = () => {
        let firstLine;
        const sourceLines = Array.from(jsdoc.source);
        for (let sourceLinesIndex = 0; sourceLinesIndex < sourceLines.length; sourceLinesIndex += 1) {
            const {
                number,
                tokens: { tag },
            } = sourceLines[sourceLinesIndex]!;
            if (tag) {
                firstLine = number;
                break;
            }
        }

        return firstLine;
    };

    utils.seedTokens = seedTokens;

    utils.emptyTokens = (tokens) => {
        ([
            'start',
            'postDelimiter',
            'tag',
            'type',
            'postType',
            'postTag',
            'name',
            'postName',
            'description',
            'end',
            'lineEnd',
        ]).forEach((prop) => {
            Object.assign(tokens, {
                [prop as
                    | 'start'
                    | 'postDelimiter'
                    | 'tag'
                    | 'type'
                    | 'postType'
                    | 'postTag'
                    | 'name'
                    | 'postName'
                    | 'description'
                    | 'end'
                    | 'lineEnd']: '',
            });
        });
    };

    utils.addLine = (sourceIndex, tokens) => {
        const number = (jsdoc.source[sourceIndex - 1]?.number || 0) + 1;
        jsdoc.source.splice(sourceIndex, 0, {
            number,
            source: '',
            tokens: seedTokens(tokens),
        });

        (jsdoc.source.slice(number + 1)).forEach((src) => {
            Object.assign(src, { number: src.number + 1 });
        });
        // If necessary, we can rewire the tags (misnamed method)
        // rewireSource(jsdoc);
    };

    utils.addLines = (tagIndex, tagSourceOffset, numLines) => {
        const { source: tagSource } = jsdoc.tags[tagIndex]!;
        let lastIndex: Integer | undefined;
        const firstNumber = jsdoc.source[0]!.number;
        tagSource.some(({ number }) => {
            const makeLine = () => ({
                number,
                source: '',
                tokens: seedTokens({
                    delimiter: '*',
                    start: `${indent} `,
                }),
            });

            const makeLines = () => Array.from(
                {
                    length: numLines,
                },
                makeLine,
            );

            const sourceIndex = jsdoc.source.findIndex(
                ({ number: srcNumber, tokens: { end } }) => number === srcNumber && !end,
            );

            if (sourceIndex > -1) {
                const lines = makeLines();
                jsdoc.source.splice(sourceIndex + tagSourceOffset, 0, ...lines);

                // tagSource.splice(tagIdx + 1, 0, ...makeLines());
                lastIndex = sourceIndex;

                return true;
            }

            return false;
        });

        Array.from(jsdoc.source.slice(lastIndex).entries()).forEach(([idx, src]) => {
            Object.assign(src, {
                number: firstNumber
                 + (lastIndex as Integer)
                + idx,
            });
        });
    };

    utils.makeMultiline = () => {
        const { tokens } = jsdoc.source[0]!;
        const {
            description, lineEnd, name, postDelimiter, tag, type,
        } = tokens;

        let {
            tokens: { postName, postTag, postType },
        } = jsdoc.source[0]!;

        // Strip trailing leftovers from single line ending
        if (!description) {
            if (postName) {
                postName = '';
            } else if (postType) {
                postType = '';
            } else if (postTag) {
                postTag = '';
            }
        }

        utils.emptyTokens(tokens);

        utils.addLine(1, {
            delimiter: '*',

            // If a description were present, it may have whitespace attached
            //   due to being at the end of the single line
            description: description.trimEnd(),
            name,
            postDelimiter,
            postName,
            postTag,
            postType,
            start: `${indent} `,
            tag,
            type,
        });
        utils.addLine(2, {
            end: '*/',
            lineEnd,
            start: `${indent} `,
        });
    };

    utils.flattenRoots = jsdocUtils.flattenRoots;

    utils.getFunctionParameterNames = (
        useDefaultObjectProperties,
        ignoreInterfacedParameters,
    ) => jsdocUtils.getFunctionParameterNames(
        node,
        useDefaultObjectProperties,
        ignoreInterfacedParameters,
    );

    utils.hasParams = () => jsdocUtils.hasParams(node as Node);

    utils.isGenerator = () => (
        node !== null
            && Boolean(
                (
                    node as
                        | import('estree').FunctionDeclaration
                        | import('estree').FunctionExpression
                ).generator
                    || (node.type === 'MethodDefinition'
                        && node.value.generator)
                    || ([
                        'ExportDefaultDeclaration',
                        'ExportNamedDeclaration',
                    ].includes(node.type)

                         && (
                             (
                                 node as
                                    | import('estree').ExportNamedDeclaration
                                    | import('estree').ExportDefaultDeclaration
                             )
                                 .declaration as import('estree').FunctionDeclaration
                         )?.generator),
            )
    );

    utils.isConstructor = () => jsdocUtils.isConstructor(node as Node);

    utils.getJsdocTagsDeep = (tagName) => {
        const name = utils.getPreferredTagName({
            tagName,
        }) as string | false;
        if (!name) {
            return false;
        }

        return jsdocUtils.getJsdocTagsDeep(jsdoc, name);
    };

    utils.getPreferredTagName = (args) => jsdocUtils.getPreferredTagName(jsdoc, {
        ...args,
        context,
        mode,
        report,
        tagNamePreference,
    });

    utils.isValidTag = (name, definedTags) => jsdocUtils.isValidTag(context, mode, name, definedTags);

    utils.hasATag = (names) => jsdocUtils.hasATag(jsdoc, names);

    utils.hasTag = (name) => jsdocUtils.hasTag(jsdoc, name);

    utils.comparePaths = (name) => jsdocUtils.comparePaths(name);

    utils.dropPathSegmentQuotes = (name) => jsdocUtils.dropPathSegmentQuotes(name);

    utils.avoidDocs = (exemptSpecialMethods = true) => {
        if (
            (ignoreReplacesDocs !== false
                && (utils.hasTag('ignore') || utils.classHasTag('ignore')))
            || (overrideReplacesDocs !== false
                && (utils.hasTag('override') || utils.classHasTag('override')))
            || (implementsReplacesDocs !== false
                && (utils.hasTag('implements')
                    || utils.classHasTag('implements')))
            || (augmentsExtendsReplacesDocs
                && (utils.hasATag(['augments', 'extends'])
                    || utils.classHasTag('augments')
                    || utils.classHasTag('extends')))
        ) {
            return true;
        }

        if (
            exemptSpecialMethods
            && jsdocUtils.exemptSpeciaMethods(
                jsdoc,
                node,
                context,
                ruleConfig.meta.schema as jsdocUtils.SpecialMethodSchema[],
            )
        ) {
            return true;
        }

        const exemptedBy = (context.options as Options)[0]?.exemptedBy ?? [
            'inheritDoc',
            ...(mode === 'closure' ? [] : ['inheritdoc']),
        ];
        if (exemptedBy.length && utils.getPresentTags(exemptedBy).length) {
            return true;
        }

        return false;
    };

    ([
        'tagMightHaveNamePosition',
        'tagMightHaveTypePosition',
    ]).forEach((method) => {
        utils[method as
                | 'tagMightHaveNamePosition'
                | 'tagMightHaveTypePosition'
        ] = (tagName, otherModeMaps) => {
            const result = jsdocUtils[
                method as
                        | 'tagMightHaveNamePosition'
                        | 'tagMightHaveTypePosition'
            ](tagName);
            if (result) {
                return true;
            }

            if (!otherModeMaps) {
                return false;
            }

            const otherResult = otherModeMaps.some((otherModeMap) => jsdocUtils[

                method as
                        | 'tagMightHaveNamePosition'
                        | 'tagMightHaveTypePosition'
            ](tagName, otherModeMap));

            return otherResult
                ? {
                    otherMode: true,
                }
                : false;
        };
    });

    utils.tagMissingRequiredTypeOrNamepath = (tagName, otherModeMaps) => {
        const result = jsdocUtils.tagMissingRequiredTypeOrNamepath(tagName);
        if (!result) {
            return false;
        }

        const otherResult = otherModeMaps.every((otherModeMap) => jsdocUtils.tagMissingRequiredTypeOrNamepath(
            tagName,
            otherModeMap,
        ));

        return otherResult
            ? true
            : {
                otherMode: false,
            };
    };

    ([
        'tagMustHaveNamePosition',
        'tagMustHaveTypePosition',
    ]).forEach((method) => {
        utils[
            method as 'tagMustHaveNamePosition' | 'tagMustHaveTypePosition'
        ] = (tagName, otherModeMaps) => {
            const result = jsdocUtils[
                method as
                        | 'tagMustHaveNamePosition'
                        | 'tagMustHaveTypePosition'
            ](tagName);
            if (!result) {
                return false;
            }

            // if (!otherModeMaps) { return true; }

            const otherResult = otherModeMaps.every((otherModeMap) => jsdocUtils[

                method as
                        | 'tagMustHaveNamePosition'
                        | 'tagMustHaveTypePosition'
            ](tagName, otherModeMap));

            return otherResult
                ? true
                : {
                    otherMode: false,
                };
        };
    });

    utils.getTagStructureForMode = (mde) => jsdocUtils.getTagStructureForMode(mde, settings.structuredTags);

    utils.mayBeUndefinedTypeTag = (tag) => jsdocUtils.mayBeUndefinedTypeTag(tag, settings.mode);

    utils.hasValueOrExecutorHasNonEmptyResolveValue = (
        anyPromiseAsReturn,
        allBranches,
    ) => jsdocUtils.hasValueOrExecutorHasNonEmptyResolveValue(
        node as Node,
        anyPromiseAsReturn,
        allBranches,
    );

    utils.hasYieldValue = () => {
        if (
            ['ExportDefaultDeclaration', 'ExportNamedDeclaration'].includes((node as Node).type)
        ) {
            return jsdocUtils.hasYieldValue((
                node as
                        | import('estree').ExportNamedDeclaration
                        | import('estree').ExportDefaultDeclaration
            ).declaration as
                    | import('estree').Declaration
                    | import('estree').Expression);
        }

        return jsdocUtils.hasYieldValue(node as Node);
    };

    utils.hasYieldReturnValue = () => jsdocUtils.hasYieldValue(node as Node, true);

    utils.hasThrowValue = () => jsdocUtils.hasThrowValue(node);

    utils.isAsync = () => Boolean(node && 'async' in node && node.async);

    utils.getTags = (tagName) => jsdocUtils.getTags(jsdoc, tagName);

    utils.getPresentTags = (tagList) => jsdocUtils.filterTags(jsdoc, (tag) => tagList.includes(tag.tag));

    utils.filterTags = (filter) => jsdocUtils.filterTags(jsdoc, (tag) => filter(tag));

    utils.filterAllTags = (filter) => {
        const tags = jsdocUtils.getAllTags(jsdoc);
        return tags.filter((tag) => filter(tag));
    };

    utils.getInlineTags = () => jsdocUtils.getInlineTags(jsdoc);

    utils.getTagsByType = (tags) => jsdocUtils.getTagsByType(context, mode, tags);

    utils.hasOptionTag = (tagName) => {
        const { tags } = (context.options as Options)[0] ?? {};

        return Boolean(tags && tags.includes(tagName));
    };

    utils.getClassNode = () => (
        [...ancestors, node].toReversed().find((parent) => (
            parent
                    && ['ClassDeclaration', 'ClassExpression'].includes(
                        parent.type,
                    )
        )) ?? null
    );

    utils.getClassJsdoc = () => {
        const classNode = utils.getClassNode();

        if (!classNode) {
            return null;
        }

        const classJsdocNode = getJSDocComment(sourceCode, classNode, {
            maxLines,
            minLines,
        });

        if (classJsdocNode) {
            return parseComment(classJsdocNode, '');
        }

        return null;
    };

    utils.classHasTag = (tagName) => {
        const classJsdoc = utils.getClassJsdoc();

        return classJsdoc !== null && jsdocUtils.hasTag(classJsdoc, tagName);
    };

    utils.forEachPreferredTag = (
        tagName,
        arrayHandler,
        skipReportingBlockedTag,
    ) => jsdocUtils.forEachPreferredTag(jsdoc, tagName, arrayHandler, {
        context,
        mode,
        report,
        skipReportingBlockedTag,
        tagNamePreference,
    });

    utils.findContext = (contexts, comment) => {
        const foundContext = contexts.find((cntxt) => (typeof cntxt === 'string'
            ? esquery.matches(
                node as Node,
                esquery.parse(cntxt),
                undefined,
                {
                    visitorKeys: sourceCode.visitorKeys,
                },
            )
            : (!cntxt.context
                      || cntxt.context === 'any'
                      || esquery.matches(
                          node as Node,
                          esquery.parse(cntxt.context),
                          undefined,
                          {
                              visitorKeys: sourceCode.visitorKeys,
                          },
                      ))
                      && comment === cntxt.comment));

        const contextStr = typeof foundContext === 'object'
            ? (foundContext.context ?? 'any')
            : String(foundContext);

        return {
            contextStr,
            foundContext,
        };
    };

    return utils;
};

export type PreferredTypes = {
    [key: string]:
        | false
        | string
        | {
            message: string;
            replacement?: false | string;
            skipRootChecking?: boolean;
            unifyParentAndChildTypeChecks?: boolean;
        };
};
export type StructuredTags = {
    [key: string]: {
        name?:
            | 'text'
            | 'name-defining'
            | 'namepath-defining'
            | 'namepath-referencing'
            | false;
        type?: boolean | string[];
        required?: ('name' | 'type' | 'typeOrNameRequired')[];
    };
};
/**
 * Settings from ESLint types.
 */
export type Settings = {
    maxLines: Integer;
    minLines: Integer;
    tagNamePreference: import('./jsdocUtils').TagNamePreference;
    mode: import('./jsdocUtils').ParserMode;
    preferredTypes: PreferredTypes;
    structuredTags: StructuredTags;
    contexts?: Context[];
    augmentsExtendsReplacesDocs?: boolean;
    ignoreReplacesDocs?: boolean;
    implementsReplacesDocs?: boolean;
    overrideReplacesDocs?: boolean;
    ignoreInternal?: boolean;
    ignorePrivate?: boolean;
    exemptDestructuredRootsFromChecks?: boolean;
    skipInvokedExpressionsForCommentFinding?: boolean;
};

export type JSDocSettings = {
    settings?: {
        jsdoc?: {
            ignorePrivate: boolean;
            ignoreInternal: boolean;
            maxLines: Integer;
            minLines: Integer;
            tagNamePreference: import('./jsdocUtils').TagNamePreference;
            preferredTypes: PreferredTypes;
            structuredTags: StructuredTags;
            overrideReplacesDocs: boolean;
            ignoreReplacesDocs: boolean;
            implementsReplacesDocs: boolean;
            augmentsExtendsReplacesDocs: boolean;
            exemptDestructuredRootsFromChecks: boolean;
            skipInvokedExpressionsForCommentFinding: boolean;
            mode: import('./jsdocUtils').ParserMode;
            contexts: Context[];
        };
    };
};

/**
 * @param context The rule context.
 * @returns The result of this check.
 */
const getSettings = (
    context: import('../types').Context,
): Settings | false => {
    const settings = {
        // All rules
        ignorePrivate: Boolean(context.settings.jsdoc?.ignorePrivate),
        ignoreInternal: Boolean(context.settings.jsdoc?.ignoreInternal),
        maxLines: Number(context.settings.jsdoc?.maxLines ?? 1),
        minLines: Number(context.settings.jsdoc?.minLines ?? 0),
        skipInvokedExpressionsForCommentFinding: Boolean(
            context.settings.jsdoc?.skipInvokedExpressionsForCommentFinding,
        ),

        // `check-tag-names` and many returns/param rules
        tagNamePreference: context.settings.jsdoc?.tagNamePreference ?? {},

        // `check-types` and `no-undefined-types`
        preferredTypes: context.settings.jsdoc?.preferredTypes ?? {},

        // `check-types`, `no-undefined-types`, `valid-types`
        structuredTags: context.settings.jsdoc?.structuredTags ?? {},

        // `require-param`, `require-description`, `require-example`,
        // `require-returns`, `require-throw`, `require-yields`
        overrideReplacesDocs: context.settings.jsdoc?.overrideReplacesDocs,
        ignoreReplacesDocs: context.settings.jsdoc?.ignoreReplacesDocs,
        implementsReplacesDocs: context.settings.jsdoc?.implementsReplacesDocs,
        augmentsExtendsReplacesDocs:
            context.settings.jsdoc?.augmentsExtendsReplacesDocs,

        // `require-param-type`, `require-param-description`
        exemptDestructuredRootsFromChecks:
            context.settings.jsdoc?.exemptDestructuredRootsFromChecks,

        // Many rules, e.g., `check-tag-names`
        mode: context.settings.jsdoc?.mode ?? 'typescript',

        // Many rules
        contexts: context.settings.jsdoc?.contexts,
    };

    jsdocUtils.setTagStructure(settings.mode);
    try {
        jsdocUtils.overrideTagStructure(settings.structuredTags);
    } catch (error) {
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
            message: (error as Error).message,
        });

        return false;
    }

    return settings;
};

export type MakeReport = (
    context: import('../types').Context,
    commentNode: import('estree').Node,
) => Report;

const makeReport: MakeReport = (context, commentNode) => {
    const report: Report = (
        message,
        fix = null,
        jsdocLoc = null,
        data = undefined,
        suggest = undefined,
    ) => {
        let loc;

        if (jsdocLoc) {
            if (!('line' in jsdocLoc)) {
                Object.assign(jsdocLoc, {
                    line: (
                        jsdocLoc as import('comment-parser').Spec & {
                            line?: Integer;
                        }
                    ).source[0]!.number,
                });
            }

            const lineNumber = (
                commentNode.loc as import('eslint').AST.SourceLocation
            ).start.line
                 + (jsdocLoc.line as Integer);

            loc = {
                end: {
                    column: 0,
                    line: lineNumber,
                },
                start: {
                    column: 0,
                    line: lineNumber,
                },
            };

            if ('column' in jsdocLoc && typeof jsdocLoc.column === 'number') {
                const colNumber = (
                    commentNode.loc as import('eslint').AST.SourceLocation
                ).start.column + jsdocLoc.column;

                loc.end.column = colNumber;
                loc.start.column = colNumber;
            }
        }

        context.report({
            data,
            fix,
            ...(loc ? { loc } : {}),
            message,
            node: commentNode,
            suggest,
        });
    };

    return report;
};

export type JsdocVisitorBasic = (arg: {
    context: import('../types').Context;
    sourceCode: import('eslint').SourceCode;
    indent?: string;
    info?: {
        comment?: string | undefined;
        lastIndex?: Integer | undefined;
    };
    state?: StateObject;
    globalState?: Map<string, Map<string, string>>;
    jsdoc?: JsdocBlockWithInline;
    jsdocNode?: import('eslint').Rule.Node & {
        range: [number, number];
    };
    node?: Node;
    allComments?: import('estree').Node[];
    report?: Report;
    makeReport?: MakeReport;
    settings: Settings;
    utils: BasicUtils;
}) => void;
export type JsdocVisitor = (arg: {
    context: import('../types').Context;
    sourceCode: import('eslint').SourceCode;
    indent: string;
    info: {
        comment?: string | undefined;
        lastIndex?: Integer | undefined;
    };
    state: StateObject;
    globalState: Map<string, Map<string, string>>;
    jsdoc: JsdocBlockWithInline;
    jsdocNode: import('eslint').Rule.Node & {
        range: [number, number];
    };
    node: Node | null;
    allComments?: import('estree').Node[];
    report: Report;
    makeReport?: MakeReport;
    settings: Settings;
    utils: Utils;
}) => void;

/**
 * @param info The info value.
 * @param info.comment The comment value.
 * @param info.lastIndex The last index value.
 * @param info.selector The selector value.
 * @param info.isFunctionContext The is function context value.
 * @param indent The indent value.
 * @param jsdoc The jsdoc value.
 * @param ruleConfig The rule config value.
 * @param context The rule context.
 * @param jsdocNode The jsdoc node value.
 * @param node The node to inspect.
 * @param settings The settings value.
 * @param sourceCode The source text and token accessors.
 * @param iterator The iterator value.
 * @param state The state value.
 * @param [iteratingAll] The iterating all value.
 */
const iterate = (
    info: {
        comment?: string;
        lastIndex?: Integer;
        selector?: string;
        isFunctionContext?: boolean;
    },
    indent: string,
    jsdoc: JsdocBlockWithInline,
    ruleConfig: RuleConfig,
    context: import('../types').Context,
    jsdocNode: import('@es-joy/jsdoccomment').Token,
    node: Node | null,
    settings: Settings,
    sourceCode: import('eslint').SourceCode,
    iterator: JsdocVisitor,
    state: StateObject,
    iteratingAll?: boolean,
): void => {
    const jsdocNde = jsdocNode as unknown;
    const report = makeReport(
        context,
        jsdocNde as import('estree').Node,
    );

    const utils = getUtils(
        node,
        jsdoc,
        jsdocNode as import('eslint').AST.Token,
        settings,
        report,
        context,
        sourceCode,
        iteratingAll,
        ruleConfig,
        indent,
    );

    if (
        !ruleConfig.checkInternal
        && settings.ignoreInternal
        && utils.hasTag('internal')
    ) {
        return;
    }

    if (
        !ruleConfig.checkPrivate
        && settings.ignorePrivate
        && (utils.hasTag('private')
            || jsdocUtils
                .filterTags(jsdoc, ({ tag }) => tag === 'access')
                .some(({ description }) => description === 'private'))
    ) {
        return;
    }

    iterator({
        context,
        globalState,
        indent,
        info,
        jsdoc,
        jsdocNode: jsdocNde as import('eslint').Rule.Node & {
            range: [number, number];
        },
        node,
        report,
        settings,
        sourceCode,
        state,
        utils,
    });
};

/**
 * @param lines The lines value.
 * @param jsdocNode The jsdoc node value.
 * @returns The result of this check.
 */
const getIndentAndJSDoc = function getIndentAndJSDoc(
    lines: string[],
    jsdocNode: import('estree').Comment,
): [indent: string, jsdoc: JsdocBlockWithInline] {
    const sourceLine = lines[
        (jsdocNode.loc as import('estree').SourceLocation).start.line - 1
    ];

    let indentChar = sourceLine!.charAt(0);
    if (indentChar !== ' ' && indentChar !== '\t') {
        indentChar = ' ';
    }

    const indnt = indentChar.repeat(
        (jsdocNode.loc as import('estree').SourceLocation).start.column,
    );

    const jsdc = parseComment(jsdocNode, '');

    return [indnt, jsdc];
};

export type NonCommentArgs = { node: Node; state: StateObject };

interface RuleConfig {
    meta: EslintRuleMeta;
    contextDefaults?: import('./jsdocUtils').DefaultContexts;
    contextSelected?: true;
    modifyContext?: (
        context: import('../types').Context,
    ) => import('../types').Context;
    iterateAllJsdocs?: true;
    checkPrivate?: true;
    checkInternal?: true;
    checkFile?: true;
    nonGlobalSettings?: true;
    noTracking?: true;
    matchContext?: true;
    exit?: (args: {
        context: import('../types').Context;
        state: StateObject;
        settings: Settings;
        utils?: BasicUtils;
    }) => void;
    nonComment?: (nca: NonCommentArgs) => void;
}

/**
 * Create an eslint rule that iterates over all JSDocs, regardless of whether
 * they are attached to a function-like node.
 * @param iterator The iterator value.
 * @param ruleConfig The rule's configuration
 * @param [contexts] The `contexts` containing relevant `comment` info.
 * @param [additiveCommentContexts] If true, will have a separate
 *   iteration for each matching comment context. Otherwise, will iterate
 *   once if there is a single matching comment context.
 * @returns The result of this check.
 */
const iterateAllJsdocs = (
    iterator: JsdocVisitor,
    ruleConfig: RuleConfig,
    contexts?: ContextObject[] | null,
    additiveCommentContexts?: boolean,
): import('../types').Rule => {
    let handler: import('@es-joy/jsdoccomment').CommentHandler;

    let settings: Settings | false;

    /**
     * @param context The rule context.
     * @param node The node to inspect.
     * @param jsdocNodes The jsdoc nodes value.
     * @param state The state value.
     * @param [lastCall] The last call value.
     */
    const callIterator = (
        context: import('../types').Context,
        node: Node | null,
        jsdocNodes: import('estree').Comment[],
        state: StateObject,
        lastCall?: boolean,
    ): void => {
        const { sourceCode = context.getSourceCode() } = context;
        const { lines } = sourceCode;

        const utils = getBasicUtils(context, settings as Settings);
        (jsdocNodes).forEach((jsdocNode) => {
            const jsdocNde = jsdocNode as unknown;
            if (
                !/^\/\*\*\s/v.test(
                    sourceCode.getText(
                        jsdocNde as import('estree').Node,
                    ),
                )
            ) {
                return;
            }

            const [indent, jsdoc] = getIndentAndJSDoc(lines, jsdocNode);

            if (additiveCommentContexts) {
                Array.from((
                    contexts as ContextObject[]
                ).entries()).forEach(([
                    idx,
                    { comment },
                ]) => {
                    if (comment && handler(comment, jsdoc) === false) {
                        return;
                    }

                    iterate(
                        {
                            comment,
                            lastIndex: idx,
                            selector: node?.type,
                        },
                        indent,
                        jsdoc,
                        ruleConfig,
                        context,
                        jsdocNode,
                        node as Node,
                        settings as Settings,
                        sourceCode,
                        iterator,
                        state,
                        true,
                    );
                });

                return;
            }

            let lastComment;
            let lastIndex;

            if (
                contexts
                && contexts.every(({ comment }, idx) => {
                    lastComment = comment;
                    lastIndex = idx;

                    return comment && handler(comment, jsdoc) === false;
                })
            ) {
                return;
            }

            iterate(
                lastComment
                    ? {
                        comment: lastComment,
                        lastIndex,
                        selector: node?.type,
                    }
                    : {
                        lastIndex,
                        selector: node?.type,
                    },
                indent,
                jsdoc,
                ruleConfig,
                context,
                jsdocNode,
                node,
                settings as Settings,
                sourceCode,
                iterator,
                state,
                true,
            );
        });

        const settngs = settings as Settings;

        if (lastCall && ruleConfig.exit) {
            ruleConfig.exit({
                context,
                settings: settngs,
                state,
                utils,
            });
        }
    };

    return {
        create(context) {
            const { sourceCode = context.getSourceCode() } = context;

            // Custom languages provide their own `SourceCode` implementations.
            // JSDoc traversal requires the JavaScript token API.
            if (typeof sourceCode.getTokenBefore !== 'function') {
                return {};
            }

            settings = getSettings(context);
            if (!settings) {
                return {};
            }

            if (contexts) {
                handler = commentHandler({
                    ...settings,
                    mode:
                        settings.mode === 'permissive'
                            ? 'typescript'
                            : settings.mode,
                });
            }

            const trackedJsdocs = new Set<object | null>();
            const state = {};

            return {
                /**
                 * @param node The node to inspect.
                 */
                '*:not(Program)': function notProgram(node: import('eslint').Rule.Node): void {
                    const commentNode = getJSDocComment(
                        sourceCode,
                        node,
                        settings as Settings,
                    );
                    if (
                        !ruleConfig.noTracking
                        && trackedJsdocs.has(commentNode)
                    ) {
                        return;
                    }

                    if (!commentNode) {
                        if (ruleConfig.nonComment) {
                            const ste = state as StateObject;
                            ruleConfig.nonComment({
                                node,
                                state: ste,
                            });
                        }

                        return;
                    }

                    trackedJsdocs.add(commentNode);
                    callIterator(
                        context,
                        node,
                        [
                            commentNode as import('estree').Comment,
                        ],
                        state as StateObject,
                    );
                },
                'Program:exit': function ProgramExit() {
                    const allComments = sourceCode.getAllComments() as import('estree').Comment[];
                    const untrackedJSdoc = allComments.filter((node) => !trackedJsdocs.has(node));

                    callIterator(
                        context,
                        null,
                        untrackedJSdoc,
                        state as StateObject,
                        true,
                    );
                },
            };
        },
        meta: ruleConfig.meta,
    };
};

/**
 * Create an eslint rule that iterates over all JSDocs, regardless of whether
 * they are attached to a function-like node.
 * @param iterator The iterator value.
 * @param ruleConfig The rule config value.
 * @returns The result of this check.
 */
const checkFile = (
    iterator: JsdocVisitorBasic,
    ruleConfig: RuleConfig,
): import('../types').Rule => ({
    create(context) {
        const { sourceCode = context.getSourceCode() } = context;
        const settings = getSettings(context);
        if (!settings) {
            return {};
        }

        return {
            'Program:exit': function ProgramExit() {
                const allComms = sourceCode.getAllComments() as unknown;
                const utils = getBasicUtils(context, settings);

                iterator({
                    allComments:
                             allComms as import('estree').Node[],
                    context,
                    makeReport,
                    settings,
                    sourceCode,
                    utils,
                });
            },
        };
    },
    meta: ruleConfig.meta,
});

export {
    getSettings,
    // dslint-disable-next-line unicorn/prefer-export-from -- Avoid experimental parser
};

/**
 * @param iterator The iterator value.
 * @param ruleConfig The rule config value.
 * @returns The result of this check.
 */
export default function iterateJsdoc(
    iterator: JsdocVisitor,
    ruleConfig: RuleConfig,
): import('../types').Rule {
    const metaType = ruleConfig?.meta?.type;
    if (!metaType || !['layout', 'problem', 'suggestion'].includes(metaType)) {
        throw new TypeError(
            'Rule must include `meta.type` option (with value "problem", "suggestion", or "layout")',
        );
    }

    if (typeof iterator !== 'function') {
        throw new TypeError('The iterator argument must be a function.');
    }

    if (ruleConfig.checkFile) {
        return checkFile(
            iterator as JsdocVisitorBasic,
            ruleConfig,
        );
    }

    if (ruleConfig.iterateAllJsdocs) {
        return iterateAllJsdocs(iterator, ruleConfig);
    }

    return {
        /**
         * The entrypoint for the JSDoc rule.
         * @param ctx The ctx value.
         *   a reference to the context which hold all important information
         *   like settings and the sourcecode to check.
         * @returns *   a listener with parser callback function.
         */
        create(
            ctx: import('../types').Context,
        ): import('eslint').Rule.RuleListener {
            const context = ruleConfig.modifyContext
                ? ruleConfig.modifyContext(ctx)
                : ctx;

            const settings = getSettings(context);
            if (!settings) {
                return {};
            }

            let contexts: Context[] | undefined;
            if (
                ruleConfig.contextDefaults
                || ruleConfig.contextSelected
                || ruleConfig.matchContext
            ) {
                contexts = ruleConfig.matchContext
                    && (context.options as Options)[0]?.match
                    ? (context.options as Options)[0]!.match
                    : jsdocUtils.enforcedContexts(
                        context,
                        ruleConfig.contextDefaults,
                        ruleConfig.nonGlobalSettings ? {} : settings,
                    );

                if (contexts) {
                    contexts = contexts.map((obj) => {
                        if (typeof obj === 'object' && !obj.context) {
                            return {
                                ...obj,
                                context: 'any',
                            };
                        }

                        return obj;
                    });
                }

                const hasPlainAny = contexts?.includes('any');
                const hasObjectAny = !hasPlainAny
                    && contexts?.find((ctxt) => {
                        if (typeof ctxt === 'string') {
                            return false;
                        }

                        return ctxt?.context === 'any';
                    });
                if (hasPlainAny || hasObjectAny) {
                    return iterateAllJsdocs(
                        iterator,
                        ruleConfig,
                        hasObjectAny
                            ? (contexts as ContextObject[])
                            : null,
                        ruleConfig.matchContext,
                    ).create(context);
                }
            }

            const { sourceCode = context.getSourceCode() } = context;
            const { lines } = sourceCode;

            const state: Partial<StateObject> = {};

            const checkJsdoc: CheckJsdoc = (info, handler, node) => {
                const jsdocNode = getJSDocComment(sourceCode, node, settings);
                if (!jsdocNode) {
                    return;
                }

                const [indent, jsdoc] = getIndentAndJSDoc(
                    lines,
                    jsdocNode as import('estree').Comment,
                );

                if (
                    // Note, `handler` should already be bound in its first argument
                    //  with these only to be called after the value of
                    //  `comment`
                    handler
                    && handler(jsdoc) === false
                ) {
                    return;
                }

                iterate(
                    info,
                    indent,
                    jsdoc,
                    ruleConfig,
                    context,
                    jsdocNode,
                    node,
                    settings,
                    sourceCode,
                    iterator,
                    state as StateObject,
                );
            };

            let contextObject: import('eslint').Rule.RuleListener = {};

            if (
                contexts
                && (ruleConfig.contextDefaults
                    || ruleConfig.contextSelected
                    || ruleConfig.matchContext)
            ) {
                contextObject = jsdocUtils.getContextObject(
                    contexts,
                    checkJsdoc,
                    commentHandler({
                        ...settings,
                        mode:
                            settings.mode === 'permissive'
                                ? 'typescript'
                                : settings.mode,
                    }),
                );
            } else {
                ([
                    'ArrowFunctionExpression',
                    'FunctionDeclaration',
                    'FunctionExpression',
                    'TSDeclareFunction',
                ]).forEach((prop) => {
                    contextObject[prop] = checkJsdoc.bind(
                        null,
                        {
                            selector: prop,
                        },
                        null,
                    );
                });
            }

            if (typeof ruleConfig.exit === 'function') {
                contextObject['Program:exit'] = () => {
                    const ste = state as StateObject;
                    (
                        ruleConfig as Required<RuleConfig>
                    ).exit({
                        context,
                        settings,
                        state: ste,
                    });
                };
            }

            return contextObject;
        },
        meta: ruleConfig.meta,
    };
}

export { parseComment };
