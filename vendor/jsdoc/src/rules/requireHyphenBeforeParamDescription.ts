// Options are validated against this rule's metadata schema before execution.
import iterateJsdoc from '../iterateJsdoc';

type Options = [
    ('always' | 'never')?,
        {
            tags?: 'any' | Record<string, 'always' | 'never'>;
        }?,
];

export default iterateJsdoc(({
    context,
    jsdoc,
    utils,
}) => {
    const [
        mainCircumstance,
        {
            tags = null,
        } = {},
    ] = context.options as Options;

    const tgs = tags as null | 'any' | { [key: string]: 'always' | 'never' };

    /**
     * @param jsdocTag The JSDoc tag.
     * @param targetTagName The target tag name.
     * @param circumstance The hyphen circumstance.
     */
    const checkHyphens = (
        jsdocTag: import('@es-joy/jsdoccomment').JsdocTagWithInline,
        targetTagName: string,
        circumstance: 'always' | 'never' = (mainCircumstance ?? 'always') as 'always' | 'never',
    ): void => {
        const always = !circumstance || circumstance === 'always';
        const desc = utils.getTagDescription(jsdocTag) as string;
        if (!desc.trim()) {
            return;
        }

        const startsWithHyphen = (/^\s*-/v).test(desc);
        const hyphenNewline = (/^\s*-\n/v).test(desc);

        let lines = 0;
        for (let sourceIndex = 0; sourceIndex < jsdocTag.source.length; sourceIndex += 1) {
            const { tokens } = jsdocTag.source[sourceIndex]!;
            if (tokens.description) {
                break;
            }

            lines += 1;
        }

        if (always && !hyphenNewline) {
            if (!startsWithHyphen) {
                let fixIt = true;
                for (let sourceIndex = 0; sourceIndex < jsdocTag.source.length; sourceIndex += 1) {
                    const { tokens } = jsdocTag.source[sourceIndex]!;
                    if (tokens.description) {
                        tokens.description = tokens.description.replace(/^(\s*)/v, '$1- ');
                        break;
                    }

                    // Linebreak after name since has no description
                    if (tokens.name) {
                        fixIt = false;
                        break;
                    }
                }

                if (fixIt) {
                    utils.reportJSDoc(
                        `There must be a hyphen before @${targetTagName} description.`,
                        {
                            line: (jsdocTag.source[0]?.number ?? 0) + lines,
                        },
                        () => {},
                    );
                }
            }
        } else if (startsWithHyphen) {
            utils.reportJSDoc(
                always
                    ? `There must be no hyphen followed by newline after the @${targetTagName} name.`
                    : `There must be no hyphen before @${targetTagName} description.`,
                {
                    line: (jsdocTag.source[0]?.number ?? 0) + lines,
                },
                () => {
                    for (let sourceIndex = 0; sourceIndex < jsdocTag.source.length; sourceIndex += 1) {
                        const { tokens } = jsdocTag.source[sourceIndex]!;
                        if (tokens.description) {
                            tokens.description = tokens.description.replace(/^\s*-\s*/v, '');
                            if (hyphenNewline) {
                                tokens.postName = '';
                            }

                            break;
                        }
                    }
                },
                true,
            );
        }
    };

    utils.forEachPreferredTag('param', checkHyphens);
    if (tgs && typeof tgs === 'object') {
        const tagEntries = Object.entries(tgs);
        for (let entryIndex = 0; entryIndex < tagEntries.length; entryIndex += 1) {
            const [tagName, circumstance] = tagEntries[entryIndex]!;
            if (tagName !== '*') {
                utils.forEachPreferredTag(tagName, (jsdocTag, targetTagName) => {
                    checkHyphens(
                        jsdocTag,
                        targetTagName,
                        circumstance as 'always' | 'never',
                    );
                });
            } else {
                const preferredParamTag = utils.getPreferredTagName({
                    tagName: 'param',
                });
                for (let tagIndex = 0; tagIndex < jsdoc.tags.length; tagIndex += 1) {
                    const { tag } = jsdoc.tags[tagIndex]!;
                    const isPreferred = tag === preferredParamTag || tagEntries.some(([
                        tagNme,
                    ]) => tagNme !== '*' && tagNme === tag);
                    if (!isPreferred) {
                        utils.forEachPreferredTag(tag, (jsdocTag, targetTagName) => {
                            checkHyphens(
                                jsdocTag,
                                targetTagName,
                                circumstance as 'always' | 'never',
                            );
                        });
                    }
                }
            }
        }
    }
}, {
    iterateAllJsdocs: true,
    meta: {
        docs: {
            description: 'Requires a hyphen before the `@param` description (and optionally before `@property` descriptions).',
            url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/require-hyphen-before-param-description.md#repos-sticky-header',
        },
        fixable: 'code',
        schema: [
            {
                description: `If the string is \`"always"\` then a problem is raised when there is no hyphen
before the description. If it is \`"never"\` then a problem is raised when there
is a hyphen before the description. The default value is \`"always"\`.

Even if hyphens are set to "always" appear after the tag name, they will
actually be forbidden in the event that they are followed immediately by
the end of a line (this will otherwise cause Visual Studio Code to display
incorrectly).`,
                enum: [
                    'always', 'never',
                ],
                type: 'string',
            },
            {
                additionalProperties: false,
                description: `The options object may have the following property to indicate behavior for
other tags besides the \`@param\` tag (or the \`@arg\` tag if so set).`,
                properties: {
                    tags: {
                        anyOf: [
                            {
                                patternProperties: {
                                    '.*': {
                                        enum: [
                                            'always', 'never',
                                        ],
                                        type: 'string',
                                    },
                                },
                                type: 'object',
                            },
                            {
                                enum: [
                                    'any',
                                ],
                                type: 'string',
                            },
                        ],
                        description: `Object whose keys indicate different tags to check for the
  presence or absence of hyphens; the key value should be "always" or "never",
  indicating how hyphens are to be applied, e.g., \`{property: 'never'}\`
  to ensure \`@property\` never uses hyphens. A key can also be set as \`*\`, e.g.,
  \`'*': 'always'\` to apply hyphen checking to any tag (besides the preferred
  \`@param\` tag which follows the main string option setting and besides any
  other \`tags\` entries).`,
                    },
                },
                type: 'object',
            },
        ],
        type: 'layout',
    },
});
