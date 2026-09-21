// Options are validated against this rule's metadata schema before execution.
import defaultTagOrder from '../defaultTagOrder';
import iterateJsdoc from '../iterateJsdoc';

type Options = [
        {
            alphabetizeExtras?: boolean;
            linesBetween?: number;
            reportIntraTagGroupSpacing?: boolean;
            reportTagGroupSpacing?: boolean;
            tagExceptions?: Record<string, number>;
            tagSequence?: { tags: string[] }[];
        }?,
];

export default iterateJsdoc(({
    context,
    jsdoc,
    utils,
}) => {
    const {
        alphabetizeExtras = false,
        linesBetween = 1,
        reportIntraTagGroupSpacing = true,
        reportTagGroupSpacing = true,
        tagExceptions = {},
        tagSequence = defaultTagOrder,
    } = (context.options as Options)[0] || {};

    const tagList = tagSequence.flatMap((obj) => obj.tags);

    const otherPos = tagList.indexOf('-other');
    const endPos = otherPos > -1 ? otherPos : tagList.length;

    let ongoingCount = 0;
    for (let tagPos = 0; tagPos < jsdoc.tags.length; tagPos += 1) {
        const tag = jsdoc.tags[tagPos] as import('@es-joy/jsdoccomment').JsdocTagWithInline & {
            originalIndex: import('../iterateJsdoc').Integer;
            originalLine: import('../iterateJsdoc').Integer;
        };
        const idx = tagPos;
        tag.originalIndex = idx;
        ongoingCount += tag.source.length;
        tag.originalLine = ongoingCount;
    }

    let firstChangedTagLine: import('../iterateJsdoc').Integer | undefined;
    let firstChangedTagIndex: import('../iterateJsdoc').Integer | undefined;

    const sortedTags = JSON.parse(JSON.stringify(jsdoc.tags)) as (import('comment-parser').Spec & {
        originalIndex: import('../iterateJsdoc').Integer;
        originalLine: import('../iterateJsdoc').Integer;
    })[];
    sortedTags.sort(({
        tag: tagNew,
    }, {
        originalIndex,
        originalLine,
        tag: tagOld,
    }) => {
        // Optimize: Just keep relative positions if the same tag name
        if (tagNew === tagOld) {
            return 0;
        }

        const checkOrSetFirstChanged = () => {
            if (!firstChangedTagLine || originalLine < firstChangedTagLine) {
                firstChangedTagLine = originalLine;
                firstChangedTagIndex = originalIndex;
            }
        };

        const newPos = tagList.indexOf(tagNew);
        const oldPos = tagList.indexOf(tagOld);

        const preferredNewPos = newPos === -1 ? endPos : newPos;
        const preferredOldPos = oldPos === -1 ? endPos : oldPos;

        if (preferredNewPos < preferredOldPos) {
            checkOrSetFirstChanged();
            return -1;
        }

        if (preferredNewPos > preferredOldPos) {
            return 1;
        }

        // preferredNewPos === preferredOldPos
        if (
            !alphabetizeExtras

            // Optimize: If tagNew (or tagOld which is the same) was found in the
            //   priority array, it can maintain its relative position—without need
            //   of alphabetizing (secondary sorting)
            || newPos >= 0
        ) {
            return 0;
        }

        if (tagNew < tagOld) {
            checkOrSetFirstChanged();
            return -1;
        }

        // tagNew > tagOld
        return 1;
    });

    if (firstChangedTagLine === undefined) {
        // Should be ordered by now

        const lastTagsOfGroup: import('comment-parser').Spec[] = [];

        const badLastTagsOfGroup: [import('comment-parser').Spec, import('../iterateJsdoc').Integer][] = [];

        /**
         * @param tag The tag value.
         * @returns The empty line count.
         */
        const countTagEmptyLines = (tag: import('comment-parser').Spec): number => tag.source.reduce((acc, {
            tokens: {
                description,
                end,
                name,
                tag: tg,
                type,
            },
        }) => {
            const empty = !tg && !type && !name && !description;
            // Reset the count so long as there is content
            return empty ? acc + Number(empty && !end) : 0;
        }, 0);

        let idx = 0;
        for (let sequenceIndex = 0; sequenceIndex < tagSequence.length; sequenceIndex += 1) {
            const { tags } = tagSequence[sequenceIndex]!;
            let innerIdx: number | undefined;
            let currentTag: import('comment-parser').Spec | undefined;
            let lastTag: import('comment-parser').Spec | undefined;
            do {
                const maybeTag = jsdoc.tags[idx];
                if (!maybeTag) {
                    idx += 1;
                    break;
                }
                currentTag = maybeTag;
                const activeTag = currentTag;

                innerIdx = tags.indexOf(activeTag.tag);

                if (
                    innerIdx === -1
                    // eslint-disable-next-line no-loop-func -- Safe
                    && (!tags.includes('-other') || tagSequence.some(({
                        tags: tgs,
                    }) => tgs.includes(activeTag.tag)))
                ) {
                    idx += 1;
                    break;
                }

                lastTag = currentTag;

                idx += 1;
            } while (true);

            idx -= 1;

            if (lastTag) {
                lastTagsOfGroup.push(lastTag);
                const ct = countTagEmptyLines(lastTag);
                if (
                    ct !== linesBetween
                    // Use another rule for adding to end (should be of interest outside this rule)
                    && jsdoc.tags[idx]
                ) {
                    badLastTagsOfGroup.push([
                        lastTag, ct,
                    ]);
                }
            }
        }

        if (reportTagGroupSpacing && badLastTagsOfGroup.length) {
            /**
             * @param tg The tag value.
             * @returns The fixer function.
             */
            const fixer = (tg: import('comment-parser').Spec): (() => void) => () => {
                // Due to https://github.com/syavorsky/comment-parser/issues/110 ,
                //  we have to modify `jsdoc.source` rather than just modify tags
                //  directly
                const { source } = jsdoc;
                for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
                    const currIdx = sourceIndex;
                    const { tokens } = source[currIdx]!;
                    if (tokens.tag === `@${tg.tag}`) {
                    // Cannot be `tokens.end`, as dropped off last tag, so safe to
                    //  go on
                        let newIdx = currIdx;

                        const emptyLine = () => ({
                            number: 0,
                            source: '',
                            tokens: utils.seedTokens({
                                delimiter: '*',
                                start: source[newIdx - 1]!.tokens.start,
                            }),
                        });

                        let existingEmptyLines = 0;
                        while (true) {
                            newIdx += 1;
                            const nextTokens = source[newIdx]?.tokens;

                            /* c8 ignore next 3 -- Guard */
                            if (!nextTokens) {
                                return;
                            }

                            // Should be no `nextTokens.end` to worry about since ignored
                            //  if not followed by tag

                            if (nextTokens.tag) {
                            // Haven't made it to last tag instance yet, so keep looking
                                if (nextTokens.tag !== tokens.tag) {
                                    const lineDiff = linesBetween - existingEmptyLines;
                                    if (lineDiff > 0) {
                                        const lines = Array.from({
                                            length: lineDiff,
                                        }, () => emptyLine());
                                        source.splice(newIdx, 0, ...lines);
                                    } else {
                                        // lineDiff < 0
                                        source.splice(
                                            newIdx + lineDiff,
                                            -lineDiff,
                                        );
                                    }

                                    break;
                                } else {
                                    existingEmptyLines = 0;
                                }
                            } else {
                                const empty = !nextTokens.type && !nextTokens.name
                                        && !nextTokens.description;

                                if (empty) {
                                    existingEmptyLines += 1;
                                } else {
                                // Has content again, so reset empty line count
                                    existingEmptyLines = 0;
                                }
                            }
                        }

                        break;
                    }
                }

                for (let srcIdx = 0; srcIdx < source.length; srcIdx += 1) {
                    source[srcIdx]!.number = srcIdx;
                }
            };

            for (let groupIndex = 0; groupIndex < badLastTagsOfGroup.length; groupIndex += 1) {
                const [tg] = badLastTagsOfGroup[groupIndex]!;
                utils.reportJSDoc(
                    'Tag groups do not have the expected whitespace',
                    tg,
                    fixer(tg),
                );
            }

            return;
        }

        if (!reportIntraTagGroupSpacing) {
            return;
        }

        for (let tagIdx = 0; tagIdx < jsdoc.tags.length; tagIdx += 1) {
            const tag = jsdoc.tags[tagIdx]!;
            if (jsdoc.tags[tagIdx + 1] && !lastTagsOfGroup.includes(tag)) {
                const ct = countTagEmptyLines(tag);
                if (ct && (!(tag.tag in tagExceptions) || (tagExceptions[tag.tag] ?? 0) < ct)) {
                    const fixer = () => {
                        const { source } = jsdoc;
                        let foundFirstTag = false;

                        let currentTag: string | undefined;

                        for (let currIdx = 0; currIdx < source.length; currIdx += 1) {
                            const {
                                tokens: {
                                    description,
                                    end,
                                    name,
                                    tag: tg,
                                    type,
                                },
                            } = source[currIdx]!;
                            if (tg) {
                                foundFirstTag = true;
                                currentTag = tg;
                            }

                            if (foundFirstTag
                                && currentTag && !tg && !type && !name && !description && !end) {
                                let nextIdx = currIdx;

                                let ignore = true;
                                // Even if a tag of the same name as the last tags in a group,
                                //  could still be an earlier tag in that group

                                const activeTag = currentTag;
                                if (lastTagsOfGroup.some((lastTagOfGroup) => activeTag === `@${lastTagOfGroup.tag}`)) {
                                    while (true) {
                                        nextIdx += 1;
                                        const nextTokens = source[nextIdx]?.tokens;
                                        if (!nextTokens) {
                                            break;
                                        }

                                        if (nextTokens.tag) {
                                            // Followed by the same tag name, so not actually last in group,
                                            //   and of interest
                                            if (nextTokens.tag === currentTag) {
                                                ignore = false;
                                            }
                                        }
                                    }
                                } else {
                                    while (true) {
                                        nextIdx += 1;
                                        const nextTokens = source[nextIdx]?.tokens;
                                        if (!nextTokens || nextTokens.end) {
                                            break;
                                        }

                                        // Not the very last tag, so don't ignore
                                        if (nextTokens.tag) {
                                            ignore = false;
                                            break;
                                        }
                                    }
                                }

                                if (!ignore) {
                                    source.splice(currIdx, 1);
                                    for (let srcIdx = 0; srcIdx < source.length; srcIdx += 1) {
                                        source[srcIdx]!.number = srcIdx;
                                    }
                                }
                            }
                        }
                    };

                    utils.reportJSDoc(
                        'Intra-group tags have unexpected whitespace',
                        tag,
                        fixer,
                    );
                }
            }
        }

        return;
    }

    const firstLine = utils.getFirstLine();

    const fix = () => {
        const changedIndex = firstChangedTagIndex as import('../iterateJsdoc').Integer;
        const itemsToMoveRange = [
            ...Array.from({
                length: jsdoc.tags.length - changedIndex,
            }).keys(),
        ];

        const unchangedPriorTagDescriptions = jsdoc.tags.slice(
            0,
            changedIndex,
        ).reduce((ct, {
            source,
        }) => ct + source.length - 1, 0);

        // This offset includes not only the offset from where the first tag
        //   must begin, and the additional offset of where the first changed
        //   tag begins, but it must also account for prior descriptions
        const initialOffset = (firstLine as import('../iterateJsdoc').Integer)
            + (changedIndex as import('../iterateJsdoc').Integer)

            // May be the first tag, so don't try finding a prior one if so
            + unchangedPriorTagDescriptions;

        // Use `firstChangedTagLine` for line number to begin reporting/splicing
        for (let rangeIndex = 0; rangeIndex < itemsToMoveRange.length; rangeIndex += 1) {
            const idx = itemsToMoveRange[rangeIndex]!;
            utils.removeTag(
                idx
                    + (changedIndex as import('../iterateJsdoc').Integer),
            );
        }

        const changedTags = sortedTags.slice(changedIndex);
        let extraTagCount = 0;

        for (let rangeIndex = 0; rangeIndex < itemsToMoveRange.length; rangeIndex += 1) {
            const idx = itemsToMoveRange[rangeIndex]!;
            const changedTag = changedTags[idx]!;

            utils.addTag(
                changedTag.tag,
                extraTagCount + initialOffset + idx,
                {
                    ...changedTag.source[0]!.tokens,

                    // `comment-parser` puts the `end` within the `tags` section, so
                    //   avoid adding another to source
                    end: '',
                },
            );

            for (let sliceIndex = 1; sliceIndex < changedTag.source.length; sliceIndex += 1) {
                const { tokens } = changedTag.source[sliceIndex]!;
                if (!tokens.end) {
                    utils.addLine(
                        extraTagCount + initialOffset + idx + 1,
                        {
                            ...tokens,
                            end: '',
                        },
                    );
                    extraTagCount += 1;
                }
            }
        }
    };

    const changedTagIndex = firstChangedTagIndex as import('../iterateJsdoc').Integer;
    utils.reportJSDoc(
        `Tags are not in the prescribed order: ${
            tagList.join(', ') || '(alphabetical)'
        }`,
        jsdoc.tags[changedTagIndex],
        fix,
        true,
    );
}, {
    iterateAllJsdocs: true,
    meta: {
        docs: {
            description: 'Sorts tags by a specified sequence according to tag name, optionally adding line breaks between tag groups.',
            url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/sort-tags.md#repos-sticky-header',
        },
        fixable: 'code',
        schema: [
            {
                additionalProperties: false,
                properties: {
                    alphabetizeExtras: {
                        description: `Defaults to \`false\`. Alphabetizes any items not within \`tagSequence\` after any
items within \`tagSequence\` (or in place of the special \`-other\` pseudo-tag)
are sorted.

If you want all your tags alphabetized, you can supply an empty array for
\`tagSequence\` along with setting this option to \`true\`.`,
                        type: 'boolean',
                    },
                    linesBetween: {
                        description: `Indicates the number of lines to be added between tag groups. Defaults to 1.
Do not set to 0 or 2+ if you are using \`tag-lines\` and \`"always"\` and do not
set to 1+ if you are using \`tag-lines\` and \`"never"\`.`,
                        type: 'integer',
                    },
                    reportIntraTagGroupSpacing: {
                        description: `Whether to enable reporting and fixing of line breaks within tags of a given
tag group. Defaults to \`true\` which will remove any line breaks at the end of
such tags. Do not use with \`true\` if you are using \`tag-lines\` and \`always\`.`,
                        type: 'boolean',
                    },
                    reportTagGroupSpacing: {
                        description: `Whether to enable reporting and fixing of line breaks between tag groups
as set by \`linesBetween\`. Defaults to \`true\`. Note that the very last tag
will not have spacing applied regardless. For adding line breaks there, you
may wish to use the \`endLines\` option of the \`tag-lines\` rule.`,
                        type: 'boolean',
                    },
                    tagExceptions: {
                        description: 'Allows specification by tag of a specific higher maximum number of lines. Keys are tags and values are the maximum number of lines allowed for such tags. Overrides `linesBetween`. Defaults to no special exceptions per tag.',
                        patternProperties: {
                            '.*': {
                                type: 'number',
                            },
                        },
                        type: 'object',
                    },
                    tagSequence: {
                        description: `An array of tag group objects indicating the preferred sequence for sorting tags.

Each item in the array should be an object with a \`tags\` property set to an array
of tag names.

Tag names earlier in the list will be arranged first. The relative position of
tags of the same name will not be changed.

Earlier groups will also be arranged before later groups, but with the added
feature that additional line breaks may be added between (or before or after)
such groups (depending on the setting of \`linesBetween\`).

Tag names not in the list will be grouped together at the end. The pseudo-tag
\`-other\` can be used to place them anywhere else if desired. The tags will be
placed in their order of appearance, or alphabetized if \`alphabetizeExtras\`
is enabled, see more below about that option.

Defaults to the array below (noting that it is just a single tag group with
no lines between groups by default).

Please note that this order is still experimental, so if you want to retain
a fixed order that doesn't change into the future, supply your own
\`tagSequence\`.

\`\`\`js
[{tags: [
  // Brief descriptions
  'summary',
  'typeSummary',

  // Module/file-level
  'module',
  'exports',
  'file',
  'fileoverview',
  'overview',
  'import',

  // Identifying (name, type)
  'typedef',
  'interface',
  'record',
  'template',
  'name',
  'kind',
  'type',
  'alias',
  'external',
  'host',
  'callback',
  'func',
  'function',
  'method',
  'class',
  'constructor',

  // Relationships
  'modifies',
  'mixes',
  'mixin',
  'mixinClass',
  'mixinFunction',
  'namespace',
  'borrows',
  'constructs',
  'lends',
  'implements',
  'requires',

  // Long descriptions
  'desc',
  'description',
  'classdesc',
  'tutorial',
  'copyright',
  'license',

  // Simple annotations
  'const',
  'constant',
  'final',
  'global',
  'readonly',
  'abstract',
  'virtual',
  'var',
  'member',
  'memberof',
  'memberof!',
  'inner',
  'instance',
  'inheritdoc',
  'inheritDoc',
  'override',
  'hideconstructor',

  // Core function/object info
  'param',
  'arg',
  'argument',
  'prop',
  'property',
  'return',
  'returns',

  // Important behavior details
  'async',
  'generator',
  'default',
  'defaultvalue',
  'enum',
  'augments',
  'extends',
  'throws',
  'exception',
  'yield',
  'yields',
  'event',
  'fires',
  'emits',
  'listens',
  'this',

  // Access
  'static',
  'private',
  'protected',
  'public',
  'access',
  'package',

  '-other',

  // Supplementary descriptions
  'see',
  'example',

  // METADATA

  // Other Closure (undocumented) metadata
  'closurePrimitive',
  'customElement',
  'expose',
  'hidden',
  'idGenerator',
  'meaning',
  'ngInject',
  'owner',
  'wizaction',

  // Other Closure (documented) metadata
  'define',
  'dict',
  'export',
  'externs',
  'implicitCast',
  'noalias',
  'nocollapse',
  'nocompile',
  'noinline',
  'nosideeffects',
  'polymer',
  'polymerBehavior',
  'preserve',
  'struct',
  'suppress',
  'unrestricted',

  // @homer0/prettier-plugin-jsdoc metadata
  'category',

  // Non-Closure metadata
  'ignore',
  'author',
  'version',
  'variation',
  'since',
  'deprecated',
  'todo',
]}];
\`\`\``,
                        items: {
                            additionalProperties: false,
                            properties: {
                                tags: {
                                    description: 'See description on `tagSequence`.',
                                    items: {
                                        type: 'string',
                                    },
                                    type: 'array',
                                },
                            },
                            type: 'object',
                        },
                        type: 'array',
                    },
                },
                type: 'object',
            },
        ],
        type: 'suggestion',
    },
});
