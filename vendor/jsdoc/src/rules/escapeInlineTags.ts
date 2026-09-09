// Options are validated against this rule's metadata schema before execution.
import iterateJsdoc from '../iterateJsdoc';

type Options = [
    {
        allowedInlineTags?: string[];
        enableFixer?: boolean;
        fixType?: 'backticks' | 'backslash';
    }?,
];

export default iterateJsdoc(
    ({
        context, jsdoc, settings, utils,
    }) => {
        const { mode } = settings;

        if (mode !== 'typescript') {
            return;
        }

        const {
            allowedInlineTags = [],
            enableFixer = false,
            fixType = 'backslash',
        } = (context.options as Options)[0] || {};

        const { description } = utils.getDescription();

        const tagNames: string[] = [];

        const indexes: number[] = [];

        const unescapedInlineTagRegex = /(?:^|\s)@(\w+)/gv;

        const scopedPackageNameRegex = /^@[\w.\-]+\/[\w.\-]+/v;

        const declarationReferenceInlineTags = new Set([
            'inheritDoc',
            'link',
            'linkcode',
            'linkplain',
        ]);

        const markdownCodeSpanRegex = /(?<!\\)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/gv;

        /**
         * @param desc The desc value.
         * @param index The index value.
         * @returns The result of this check.
         */
        const isInsideMarkdownCodeSpan = (
            desc: string,
            index: number,
        ): boolean => {
            markdownCodeSpanRegex.lastIndex = 0;

            let match;
            for (match = markdownCodeSpanRegex.exec(desc); match !== null; match = markdownCodeSpanRegex.exec(desc)) {
                const delimiterLength = match[1]!.length;
                const contentStart = match.index + delimiterLength;
                const contentEnd = match.index + match[0].length - delimiterLength;

                if (index < contentStart) {
                    return false;
                }

                if (index < contentEnd) {
                    return true;
                }
            }

            return false;
        };

        /**
         * @param desc The desc value.
         * @param atSignIndex The at sign index value.
         * @returns The result of this check.
         */
        const getInlineTagName = (
            desc: string,
            atSignIndex: number,
        ): string => {
            const inlineTagStart = desc.lastIndexOf('{@', atSignIndex);

            if (inlineTagStart === -1) {
                return '';
            }

            const inlineTagEnd = desc.indexOf('}', inlineTagStart);

            if (inlineTagEnd === -1 || inlineTagEnd <= atSignIndex) {
                return '';
            }

            return desc.slice(inlineTagStart + 2).match(/^\w+/v)?.[0] || '';
        };

        /**
         * @param desc The desc value.
         * @param match The match value.
         * @param offset The offset value.
         * @returns The result of this check.
         */
        const shouldIgnoreMatch = (
            desc: string,
            match: string,
            offset: number,
        ): boolean => {
            const atSignIndex = offset + match.lastIndexOf('@');
            const inlineTagName = getInlineTagName(desc, atSignIndex);

            return (
                isInsideMarkdownCodeSpan(desc, atSignIndex)
                || (declarationReferenceInlineTags.has(inlineTagName)
                    && scopedPackageNameRegex.test(desc.slice(atSignIndex)))
            );
        };

        /**
         * @param tagName The tag name value.
         * @returns The result of this check.
         */
        const escapeInlineTags = (
            tagName: string,
        ): [RegExp, (description: string) => string] => {
            const regex = new RegExp(
                `(^|\\s)@${
                    // No need to escape, as contains only safe characters
                    tagName
                }`,
                'gv',
            );

            return [
                regex,
                /**
                 * @param desc The desc value.
                 * @returns The result of this check.
                 */
                (desc: string) => desc.replaceAll(regex, (match, prefix, offset) => {
                    if (shouldIgnoreMatch(desc, match, offset)) {
                        return match;
                    }

                    return fixType === 'backticks'
                        ? `${prefix}\`@${tagName}\``
                        : `${prefix}\\@${tagName}`;
                }),
            ];
        };

        /**
         * @param desc The desc value.
         * @returns The result of this check.
         */
        const getUnescapedInlineTagName = (desc: string): string => {
            unescapedInlineTagRegex.lastIndex = 0;

            const matcher = unescapedInlineTagRegex;
            let match;
            for (match = matcher.exec(desc); match !== null; match = matcher.exec(desc)) {
                const [fullMatch, tagName] = match;

                if (!(allowedInlineTags.includes(tagName!)
                    || shouldIgnoreMatch(desc, fullMatch, match.index))) {
                    return tagName!;
                }
            }

            return '';
        };

        const normalizedDescription = description.startsWith('\n')
            ? description.slice(1)
            : description;

        let nextLineStartOffset = 0;
        Array.from(normalizedDescription
            .split('\n')
            .entries()).forEach(([idx, descLine]) => {
            const lineStartOffset = nextLineStartOffset;

            // +1 for the `\n` removed by split.
            nextLineStartOffset += descLine.length + 1;

            descLine.replaceAll(
                unescapedInlineTagRegex,
                (match, tagName, offset) => {
                    if (
                        allowedInlineTags.includes(tagName)
                        // Run ignore-detection against the full description text so that
                        // multi-line inline tags (e.g. `{@link` on one line and
                        // `@scope/pkg#Member}` on the next) are recognized as being inside an
                        // inline tag rather than scanned per-line.
                        || shouldIgnoreMatch(
                            normalizedDescription,
                            match,
                            lineStartOffset + offset,
                        )
                    ) {
                        return match;
                    }

                    tagNames.push(tagName);
                    indexes.push(idx);

                    return match;
                },
            );
        });

        Array.from(tagNames.entries()).forEach(([idx, tagName]) => {
            utils.reportJSDoc(
                `Unexpected inline JSDoc tag. Did you mean to use {@${tagName}}, \\@${tagName}, or \`@${tagName}\`?`,
                {
                    line: indexes[idx]! + 1,
                },
                enableFixer
                    ? () => {
                        // `tagName` and `fixType` are constant here, so compute the escaper
                        // once rather than rebuilding the RegExp + closure for every line.
                        const [, escapeInlineTag] = escapeInlineTags(tagName);

                        utils.setBlockDescription(
                            (info, seedTokens, descLines) => descLines.map((desc) => {
                                const newDesc = escapeInlineTag(desc);

                                return {
                                    number: 0,
                                    source: '',
                                    tokens: seedTokens({
                                        ...info,
                                        description: newDesc,
                                        postDelimiter: newDesc.trim()
                                            ? ' '
                                            : '',
                                    }),
                                };
                            }),
                        );
                    }
                    : null,
            );
        });

        (jsdoc.tags).forEach((tag) => {
            if (tag.tag === 'example') {
                return;
            }

            let tagName = '';
            const findUnescapedTag = (desc: string) => {
                tagName = getUnescapedInlineTagName(desc);
                return tagName;
            };
            while ((utils.getTagDescription(tag, true) as string[]).some(findUnescapedTag)) {
                const line = utils.setTagDescription(tag, ...escapeInlineTags(tagName))
                    + tag.source[0]!.number;
                utils.reportJSDoc(
                    `Unexpected inline JSDoc tag. Did you mean to use {@${tagName}}, \\@${tagName}, or \`@${tagName}\`?`,
                    {
                        line,
                    },
                    enableFixer ? () => {} : null,
                    true,
                );
            }
        });
    },
    {
        iterateAllJsdocs: true,
        meta: {
            docs: {
                description:
                    'Reports use of JSDoc tags in non-tag positions (in the default "typescript" mode).',
                url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/escape-inline-tags.md#repos-sticky-header',
            },
            fixable: 'code',
            schema: [
                {
                    additionalProperties: false,
                    properties: {
                        allowedInlineTags: {
                            description:
                                'A listing of tags you wish to allow unescaped. Defaults to an empty array.',
                            items: {
                                type: 'string',
                            },
                            type: 'array',
                        },
                        enableFixer: {
                            description:
                                'Whether to enable the fixer. Defaults to `false`.',
                            type: 'boolean',
                        },
                        fixType: {
                            description: `How to escape the inline tag.

May be "backticks" to enclose tags in backticks (treating as code segments), or
"backslash" to escape tags with a backslash, i.e., \`\\@\`

Defaults to "backslash".`,
                            enum: ['backticks', 'backslash'],
                            type: 'string',
                        },
                    },
                    type: 'object',
                },
            ],
            type: 'suggestion',
        },
    },
);
