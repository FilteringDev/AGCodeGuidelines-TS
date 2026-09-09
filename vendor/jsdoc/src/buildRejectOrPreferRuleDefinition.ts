// Options are validated against this rule's metadata schema before execution.
import {
    parse, stringify, traverse, tryParse,
} from '@es-joy/jsdoccomment';
import iterateJsdoc from './iterateJsdoc';

type Options = [
    {
        exemptTagContexts?: { tag: string; types: true | string[] }[];
        noDefaults?: boolean;
        unifyParentAndChildTypeChecks?: boolean;
    }?,
];

/**
 * Adjusts the parent type node `meta` for generic matches (or type node
 * `type` for `JsdocTypeAny`) and sets the type node `value`.
 * @param type The actual type
 * @param preferred The preferred type
 * @param isGenericMatch The is generic match value.
 * @param typeNodeName The type node name value.
 * @param node The node to inspect.
 * @param parentNode The parent node value.
 */
const adjustNames = (
    type: string,
    preferred: string,
    isGenericMatch: boolean,
    typeNodeName: string,
    node: import('jsdoc-type-pratt-parser').NonRootResult,
    parentNode: import('jsdoc-type-pratt-parser').NonRootResult | undefined,
): void => {
    let ret = preferred;
    if (isGenericMatch) {
        const parentMeta = (
            parentNode as import('jsdoc-type-pratt-parser').GenericResult
        ).meta;
        if (preferred === '[]') {
            parentMeta.brackets = 'square';
            parentMeta.dot = false;
            ret = 'Array';
        } else {
            const dotBracketEnd = preferred.match(/\.(?:<>)?$/v);
            if (dotBracketEnd) {
                parentMeta.brackets = 'angle';
                parentMeta.dot = true;
                ret = preferred.slice(0, -dotBracketEnd[0].length);
            } else {
                const bracketEnd = preferred.endsWith('<>');
                if (bracketEnd) {
                    parentMeta.brackets = 'angle';
                    parentMeta.dot = false;
                    ret = preferred.slice(0, -2);
                } else if (
                    parentMeta?.brackets === 'square'
                    && (typeNodeName === '[]' || typeNodeName === 'Array')
                ) {
                    parentMeta.brackets = 'angle';
                    parentMeta.dot = false;
                }
            }
        }
    } else if (type === 'JsdocTypeAny') {
        Object.assign(node, { type: 'JsdocTypeName' });
    }
    Object.assign(
        (
            node as import('jsdoc-type-pratt-parser').NameResult
        ), { value: ret.replace(/(?:\.|<>|\.<>|\[\])$/v, '') },
    );

    // For bare pseudo-types like `<>`
    if (!ret) {
        Object.assign(
            (
                node as import('jsdoc-type-pratt-parser').NameResult
            ), { value: typeNodeName },
        );
    }
};

/**
 * @param [upperCase] The upper case value.
 * @returns The result of this check.
 */
const getMessage = (upperCase?: boolean): string => (
    'Use object shorthand or index signatures instead of '
        + `\`${
            upperCase ? 'O' : 'o'
        }bject\`, e.g., \`{[key: string]: string}\``
);

const info: {
    message: string;
    replacement: false;
} = {
    message: getMessage(),
    replacement: false,
};

const infoUC: {
    message: string;
    replacement: false;
} = {
    message: getMessage(true),
    replacement: false,
};

/**
 * @param cfg The cfg value.
 * @param cfg.checkNativeTypes The check native types value.
 * @param cfg.overrideSettings The override settings value.
 * @param cfg.description The description value.
 * @param cfg.schema The schema value.
 * @param cfg.typeName The type name value.
 * @param cfg.url The url value.
 * @returns The result of this check.
 */
const buildRejectOrPreferRuleDefinition = (cfg: {
    checkNativeTypes?: import('./rules/checkTypes').CheckNativeTypes | null;
    overrideSettings?:
        | import('./iterateJsdoc').Settings['preferredTypes']
        | null;
    description?: string;
    schema?: import('eslint').Rule.RuleMetaData['schema'];
    typeName?: string;
    url?: string;
}): import('../types').Rule => {
    const {
        checkNativeTypes = null,
        typeName,
        description = typeName
        ?? 'Reports types deemed invalid (customizable and with defaults, for preventing and/or recommending replacements).',
        overrideSettings = null,
        schema = [],
        url = 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/check-types.md#repos-sticky-header',
    } = cfg; return iterateJsdoc(
        ({
            context, jsdocNode, report, settings, sourceCode, utils,
        }) => {
            const jsdocTagsWithPossibleType = utils.filterTags((tag) => {
                const hasTypePosition = utils.tagMightHaveTypePosition(tag.tag);
                return Boolean(hasTypePosition);
            });

            const
                {
                    mode,
                    preferredTypes: preferredTypesOriginal,
                    structuredTags,
                } = overrideSettings
                    ? {
                        mode: settings.mode,
                        preferredTypes: overrideSettings,
                        structuredTags: {},
                    }
                    : settings;

            const injectObjectPreferredTypes = !overrideSettings
                && !(
                    'Object' in preferredTypesOriginal
                    || 'object' in preferredTypesOriginal
                    || 'object.<>' in preferredTypesOriginal
                    || 'Object.<>' in preferredTypesOriginal
                    || 'object<>' in preferredTypesOriginal
                );

            const typeToInject: import('./iterateJsdoc').PreferredTypes = mode === 'typescript'
                ? {
                    Object: 'object',
                    'object.<>': info,
                    'Object.<>': infoUC,
                    'object<>': info,
                    'Object<>': infoUC,
                }
                : {
                    Object: 'object',
                    'object.<>': 'Object<>',
                    'Object.<>': 'Object<>',
                    'object<>': 'Object<>',
                };

            const preferredTypes: import('./iterateJsdoc').PreferredTypes = {
                ...(injectObjectPreferredTypes ? typeToInject : {}),
                ...preferredTypesOriginal,
            };

            const {
                exemptTagContexts = [],
                noDefaults,
                unifyParentAndChildTypeChecks,
            } = (context.options as Options)[0] || {};

            /**
             * Gets information about the preferred type: whether there is a matching
             * preferred type, what the type is, and whether it is a match to a generic.
             * @param _type Not currently in use
             * @param typeNodeName The type node name value.
             * @param parentNode The parent node value.
             * @param property The property value.
             * @returns The result of this check.
             */
            const getPreferredTypeInfo = (
                _type: string,
                typeNodeName: string,
                parentNode:
                    | import('jsdoc-type-pratt-parser').NonRootResult
                    | undefined,
                property: string | undefined,
            ): [
                hasMatchingPreferredType: boolean,
                typeName: string,
                isGenericMatch: boolean,
            ] => {
                let hasMatchingPreferredType = false;
                let isGenericMatch = false;
                let typName = typeNodeName;

                const isNameOfGeneric = parentNode !== undefined
                    && parentNode.type === 'JsdocTypeGeneric'
                    && property === 'left';

                const brackets = (
                    parentNode as import('jsdoc-type-pratt-parser').GenericResult
                )?.meta?.brackets;
                const dot = (
                    parentNode as import('jsdoc-type-pratt-parser').GenericResult
                )?.meta?.dot;

                if (brackets === 'angle') {
                    const checkPostFixes = dot ? ['.', '.<>'] : ['<>'];
                    isGenericMatch = checkPostFixes.some((checkPostFix) => {
                        const preferredType = preferredTypes?.[typeNodeName + checkPostFix];

                        // Does `unifyParentAndChildTypeChecks` need to be checked here?
                        if (
                            (unifyParentAndChildTypeChecks
                                || isNameOfGeneric

                                || (typeof preferredType === 'object'
                                    && preferredType?.unifyParentAndChildTypeChecks))
                            && preferredType !== undefined
                        ) {
                            typName += checkPostFix;

                            return true;
                        }

                        return false;
                    });
                }

                if (
                    !isGenericMatch
                    && property
                     && (
                         parentNode as import('jsdoc-type-pratt-parser').NonRootResult
                     ).type === 'JsdocTypeGeneric'
                ) {
                    const checkPostFixes = dot
                        ? ['.', '.<>']
                        : [brackets === 'angle' ? '<>' : '[]'];

                    isGenericMatch = checkPostFixes.some((checkPostFix) => {
                        const preferredType = preferredTypes?.[checkPostFix];
                        if (
                        // Does `unifyParentAndChildTypeChecks` need to be checked here?
                            (unifyParentAndChildTypeChecks
                                || isNameOfGeneric

                                || (typeof preferredType === 'object'
                                    && preferredType?.unifyParentAndChildTypeChecks))
                            && preferredType !== undefined
                        ) {
                            typName = checkPostFix;

                            return true;
                        }

                        return false;
                    });
                }

                const prefType = preferredTypes?.[typeNodeName];
                const directNameMatch = prefType !== undefined
                    && !Object.values(preferredTypes).includes(typeNodeName);
                const specificUnify = typeof prefType === 'object'
                    && prefType?.unifyParentAndChildTypeChecks;
                const unifiedSyntaxParentMatch = property
                    && directNameMatch
                    && (unifyParentAndChildTypeChecks || specificUnify);
                isGenericMatch = isGenericMatch || Boolean(unifiedSyntaxParentMatch);

                hasMatchingPreferredType = isGenericMatch || (directNameMatch && !property);

                return [hasMatchingPreferredType, typName, isGenericMatch];
            };

            /**
             * Collect invalid type info.
             * @param type The type value.
             * @param value The value to inspect.
             * @param tagName The tag name value.
             * @param nameInTag The name in tag value.
             * @param idx The idx value.
             * @param property The property value.
             * @param node The node to inspect.
             * @param parentNode The parent node value.
             * @param invalidTypes The invalid types value.
             */
            const getInvalidTypes = (
                type: string,
                value: string,
                tagName: string,
                nameInTag: string,
                idx: number,
                property: string | undefined,
                node: import('jsdoc-type-pratt-parser').NonRootResult,
                parentNode:
                    | import('jsdoc-type-pratt-parser').NonRootResult
                    | undefined,
                invalidTypes: (string | false | undefined)[][],
            ): void => {
                let typeNodeName = type === 'JsdocTypeAny' ? '*' : value;

                const [hasMatchingPreferredType, typName, isGenericMatch] = getPreferredTypeInfo(
                    type,
                    typeNodeName,
                    parentNode,
                    property,
                );

                let preferred;
                let types;
                if (hasMatchingPreferredType) {
                    const preferredSetting = preferredTypes[typName];
                    typeNodeName = typName === '[]' ? typName : typeNodeName;

                    if (!preferredSetting) {
                        invalidTypes.push([typeNodeName]);
                    } else if (typeof preferredSetting === 'string') {
                        preferred = preferredSetting;
                        invalidTypes.push([typeNodeName, preferred]);
                    } else if (
                        preferredSetting
                        && typeof preferredSetting === 'object'
                    ) {
                        const nextItem = preferredSetting.skipRootChecking
                            && jsdocTagsWithPossibleType[idx + 1];

                        if (
                            !nextItem
                            || !nextItem.name.startsWith(`${nameInTag}.`)
                        ) {
                            preferred = preferredSetting.replacement;
                            invalidTypes.push([
                                typeNodeName,
                                preferred,
                                preferredSetting.message,
                            ]);
                        }
                    } else {
                        utils.reportSettings(
                            'Invalid `settings.jsdoc.preferredTypes`. Values must be falsy, a string, or an object.',
                        );

                        return;
                    }
                } else if (
                    Object.entries(structuredTags).some(
                        ([tag, { type: typs }]) => {
                            types = typs;

                            return (
                                tag === tagName
                                && Array.isArray(types)
                                && !types.includes(typeNodeName)
                            );
                        },
                    )
                ) {
                    invalidTypes.push([typeNodeName, types]);
                } else if (
                    checkNativeTypes
                    && !noDefaults
                    && type === 'JsdocTypeName'
                ) {
                    preferred = checkNativeTypes(
                        preferredTypes,
                        typeNodeName,
                        preferred,
                        parentNode,
                        invalidTypes,
                    );
                }

                // For fixer
                if (preferred) {
                    adjustNames(
                        type,
                        preferred,
                        isGenericMatch,
                        typeNodeName,
                        node,
                        parentNode,
                    );
                }
            };

            Array.from(jsdocTagsWithPossibleType.entries()).forEach(([idx, jsdocTag]) => {
                const invalidTypes: (string | false | undefined)[][] = [];
                let typeAst;

                try {
                    typeAst = mode === 'permissive'
                        ? tryParse(jsdocTag.type)
                        : parse(jsdocTag.type, mode);
                } catch {
                    return;
                }

                const { name: nameInTag, tag: tagName } = jsdocTag;

                traverse(typeAst, (node, parentNode, property) => {
                    const { type, value } = node as import('jsdoc-type-pratt-parser').NameResult;
                    if (!['JsdocTypeAny', 'JsdocTypeName'].includes(type)) {
                        return;
                    }

                    getInvalidTypes(
                        type,
                        value,
                        tagName,
                        nameInTag,
                        idx,
                        property,
                        node,
                        parentNode,
                        invalidTypes,
                    );
                });

                if (invalidTypes.length) {
                    const fixedType = stringify(typeAst);

                    const fix: import('eslint').Rule.ReportFixer = (fixer) => fixer.replaceText(
                        jsdocNode,
                        sourceCode
                            .getText(jsdocNode)
                            .replace(
                                `{${jsdocTag.type}}`,
                                `{${fixedType}}`,
                            ),
                    );

                    (invalidTypes).forEach(([
                        badType,
                        preferredType = '',
                        msg,
                    ]) => {
                        const tagValue = jsdocTag.name
                            ? ` "${jsdocTag.name}"`
                            : '';
                        if (
                            exemptTagContexts.some(({ tag, types }) => (
                                tag === tagName
                                    && (types === true
                                        || types.includes(jsdocTag.type))
                            ))
                        ) {
                            return;
                        }

                        report(
                            msg
                                || `Invalid JSDoc @${tagName}${tagValue} type "${badType}"${
                                    preferredType ? '; ' : '.'
                                }${preferredType
                                    ? `prefer: ${JSON.stringify(preferredType)}.`
                                    : ''}`,
                            preferredType ? fix : null,
                            jsdocTag,
                            msg
                                ? {
                                    tagName,
                                    tagValue,
                                }
                                : undefined,
                        );
                    });
                }
            });
        },
        {
            iterateAllJsdocs: true,
            meta: {
                docs: {
                    description,
                    url,
                },
                ...(!overrideSettings
                || Object.values(overrideSettings).some((os) => (os && typeof os === 'object'
                    ? os.replacement
                    : typeof os === 'string'))
                    ? {
                        fixable: 'code',
                    }
                    : {}),
                schema,
                type: 'suggestion',
            },
        },
    );
};

export default buildRejectOrPreferRuleDefinition;
