// Options are validated against this rule's metadata schema before execution.
import escapeStringRegexp from 'escape-string-regexp';
import iterateJsdoc from '../iterateJsdoc';

type Options = [
        {
            abbreviations?: string[];
            newlineBeforeCapsAssumesBadSentenceEnd?: boolean;
            tags?: string[];
        }?,
];

const otherDescriptiveTags = new Set([
    'classdesc', 'deprecated', 'exception', 'file', 'fileoverview', 'overview',
    // 'copyright' and 'see' might be good addition, but as the former may be
    //   sensitive text, and the latter may have just a link, they are not
    //   included by default
    'summary', 'throws', 'todo', 'yield', 'yields',
]);

/**
 * @param text The text value.
 * @returns The paragraphs.
 */
const extractParagraphs = (text: string): string[] => text.split(/(?<![;:])\n\n+/v);

/**
 * @param text The text value.
 * @param abbreviationsRegex The abbreviations pattern.
 * @returns The sentences.
 */
const extractSentences = (text: string, abbreviationsRegex: string | RegExp): string[] => {
    const txt = text
        // Remove all {} tags.
        .replaceAll(/(?<!^)\{[\s\S]*?\}\s*/gv, '')

        // Remove custom abbreviations
        .replace(abbreviationsRegex, '');

    const sentenceEndGrouping = /([.?!])(?:\s+|$)/gv;

    const puncts = Array.from(txt.matchAll(sentenceEndGrouping), (sentEnd) => sentEnd[0]);

    return txt
        .split(/[.?!](?:\s+|$)/v)

        // Re-add the dot.
        .map((sentence, idx) => (!puncts[idx] && /^\s*$/v.test(sentence) ? sentence : `${sentence}${puncts[idx] || ''}`));
};

/**
 * @param text The text value.
 * @returns Whether the new line is preceded by a period.
 */
const isNewLinePrecededByAPeriod = (text: string): boolean => {
    let lastLineEndsSentence: boolean | undefined;

    const lines = text.split('\n');

    return !lines.some((line) => {
        if (lastLineEndsSentence === false && /^[A-Z][a-z]/v.test(line)) {
            return true;
        }

        lastLineEndsSentence = /[.:?!\|]$/v.test(line);

        return false;
    });
};

/**
 * @param str The string value.
 * @returns Whether the string is capitalized.
 */
const isCapitalized = (str: string): boolean => (str[0] ?? '') === (str[0] ?? '').toUpperCase();

/**
 * @param str The string value.
 * @returns Whether the string is a table.
 */
const isTable = (str: string): boolean => str.charAt(0) === '|';

/**
 * @param str The string value.
 * @returns The capitalized string.
 */
const capitalize = (str: string): string => str.charAt(0).toUpperCase() + str.slice(1);

/**
 * @param description The description value.
 * @param reportOrig The original report function.
 * @param jsdocNode The JSDoc node.
 * @param abbreviationsRegex The abbreviations pattern.
 * @param sourceCode The source code object.
 * @param tag The tag object.
 * @param newlineBeforeCapsAssumesBadSentenceEnd Whether a newline before caps assumes a bad sentence end.
 * @returns Whether the description is valid.
 */
const validateDescription = (
    description: string,
    reportOrig: import('../iterateJsdoc').Report,
    jsdocNode: import('eslint').Rule.Node,
    abbreviationsRegex: string | RegExp,
    sourceCode: import('eslint').SourceCode,
    tag: import('comment-parser').Spec | { line: import('../iterateJsdoc').Integer },
    newlineBeforeCapsAssumesBadSentenceEnd: boolean,
): boolean => {
    if (!description || (/^\n+$/v).test(description)) {
        return false;
    }

    const descriptionNoHeadings = description.replaceAll(/^\s*#[^\n]*(\n|$)/gmv, '');

    const paragraphs = extractParagraphs(descriptionNoHeadings).filter(Boolean);

    return paragraphs.some((paragraph, parIdx) => {
        const sentences = extractSentences(paragraph, abbreviationsRegex);

        const fix = (fixer: import('eslint').Rule.RuleFixer): import('eslint').Rule.Fix => {
            let text = sourceCode.getText(jsdocNode);

            if (!/[.:?!]$/v.test(paragraph)) {
                const line = paragraph.split('\n').findLast(Boolean);
                text = text.replace(new RegExp(`${escapeStringRegexp(line as string)}$`, 'mv'), `${line}.`);
            }

            sentences.filter((sentence_) => !(/^\s*$/v).test(sentence_) && !isCapitalized(sentence_)
                    && !isTable(sentence_)).forEach((sentence) => {
                const beginning = sentence.split('\n')[0] ?? '';

                if ('tag' in tag && tag.tag) {
                    const reg = new RegExp(`(@${escapeStringRegexp(tag.tag)}.*)${escapeStringRegexp(beginning)}`, 'v');

                    text = text.replace(reg, (_$0, $1) => $1 + capitalize(beginning));
                } else {
                    text = text.replace(new RegExp(`((?:[.?!]|\\*|\\})\\s*)${escapeStringRegexp(beginning)}`, 'v'), `$1${capitalize(beginning)}`);
                }
            });

            return fixer.replaceText(jsdocNode, text);
        };

        /**
         * @param msg The message value.
         * @param fixer The fixer value.
         * @param tagObj The tag object.
         */
        const report = (
            msg: string,
            fixer: import('eslint').Rule.ReportFixer | null | undefined,
            tagObj: { line?: number | undefined; column?: number | undefined } | (import('comment-parser').Spec & { line?: number | undefined; column?: number | undefined }),
        ): void => {
            const target: { line?: number; column?: number; source?: import('comment-parser').Spec['source'] } = 'line' in tagObj
                ? { ...tagObj, line: (tagObj as { line: number }).line + parIdx * 2 }
                : { ...tagObj };
            if (!('line' in tagObj)) {
                const { source } = (tagObj as import('comment-parser').Spec);
                target.source = source.map((item, itemIndex) => (itemIndex === 0
                    ? { ...item, number: item.number + parIdx * 2 }
                    : item));
            }

            // Avoid errors if old column doesn't exist here
            target.column = 0;
            reportOrig(msg, fixer, target as typeof tagObj);
        };

        if (sentences.some((sentence) => (/^[.?!]$/v).test(sentence))) {
            report('Sentences must be more than punctuation.', null, tag);
        }

        if (sentences.some((sentence) => !(/^\s*$/v).test(sentence) && !isCapitalized(sentence) && !isTable(sentence))) {
            report('Sentences should start with an uppercase character.', fix, tag);
        }

        const paragraphNoAbbreviations = paragraph.replace(abbreviationsRegex, '');

        if (!/(?:[.?!\|]|```)\s*$/v.test(paragraphNoAbbreviations)) {
            report('Sentences must end with a period.', fix, tag);
            return true;
        }

        if (newlineBeforeCapsAssumesBadSentenceEnd && !isNewLinePrecededByAPeriod(paragraphNoAbbreviations)) {
            report('A line of text is started with an uppercase character, but the preceding line does not end the sentence.', null, tag);

            return true;
        }

        return false;
    });
};

export default iterateJsdoc(({
    context,
    jsdoc,
    jsdocNode,
    report,
    sourceCode,
    utils,
}) => {
    const {
        abbreviations = [],
        newlineBeforeCapsAssumesBadSentenceEnd = false,
    } = (context.options as Options)[0] || {};

    // `@inheritDoc` can be used as inline tag with TSDoc/typedoc: https://typedoc.org/documents/Tags.__inheritDoc_.html
    if (utils.getInlineTags().some(({
        tag,
    }) => [
        // Typdoc
        'include', 'includeCode',
        // TSDoc
        'inheritDoc', 'inheritdoc',
        'label',
    ].includes(tag))) {
        return;
    }

    const abbreviationsRegex = abbreviations.length
        ? new RegExp(`\\b${abbreviations.map((abbreviation) => escapeStringRegexp(`${abbreviation.replaceAll(/\.$/gv, '')}.`)).join('|')}(?:$|\\s)`, 'gv')
        : '';

    let {
        description,
    } = utils.getDescription();

    const indices = Array.from(description.matchAll(/```[\s\S]*```/gv), (match) => {
        const {
            index,
        } = match;
        const [
            {
                length,
            },
        ] = match;
        return {
            index,
            length,
        };
    }).toReversed();

    for (let indicesIndex = 0; indicesIndex < indices.length; indicesIndex += 1) {
        const { index, length } = indices[indicesIndex]!;
        description = description.slice(0, index)
      + description.slice((index as import('../iterateJsdoc').Integer) + length);
    }

    if (validateDescription(description, report, jsdocNode, abbreviationsRegex, sourceCode, {
        line: (jsdoc.source[0]?.number ?? 0) + 1,
    }, newlineBeforeCapsAssumesBadSentenceEnd)) {
        return;
    }

    utils.forEachPreferredTag('description', (matchingJsdocTag) => {
        const desc = `${matchingJsdocTag.name} ${utils.getTagDescription(matchingJsdocTag)}`.trim();
        validateDescription(
            desc,
            report,
            jsdocNode,
            abbreviationsRegex,
            sourceCode,
            matchingJsdocTag,
            newlineBeforeCapsAssumesBadSentenceEnd,
        );
    }, true);

    const {
        tagsWithNames,
    } = utils.getTagsByType(jsdoc.tags);
    const tagsWithoutNames = utils.filterTags(({ tag: tagName }) => {
        // If user accidentally adds tags with names (or like `returns`
        //  get parsed as having names), do not add to this list
        const isNamedTag = tagsWithNames.some(({ tag }) => tag === tagName);
        return otherDescriptiveTags.has(tagName) || (utils.hasOptionTag(tagName) && !isNamedTag);
    });

    tagsWithNames.some((tag) => {
        const desc = (utils.getTagDescription(tag) as string).replace(/^- /v, '').trimEnd();

        return validateDescription(
            desc,
            report,
            jsdocNode,
            abbreviationsRegex,
            sourceCode,
            tag,
            newlineBeforeCapsAssumesBadSentenceEnd,
        );
    });

    tagsWithoutNames.some((tag) => {
        const desc = `${tag.name} ${utils.getTagDescription(tag)}`.trim();

        return validateDescription(
            desc,
            report,
            jsdocNode,
            abbreviationsRegex,
            sourceCode,
            tag,
            newlineBeforeCapsAssumesBadSentenceEnd,
        );
    });
}, {
    iterateAllJsdocs: true,
    meta: {
        docs: {
            description: 'Requires that block description, explicit `@description`, and `@param`/`@returns` tag descriptions are written in complete sentences.',
            url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/require-description-complete-sentence.md#repos-sticky-header',
        },
        fixable: 'code',
        schema: [
            {
                additionalProperties: false,
                properties: {
                    abbreviations: {
                        description: `You can provide an \`abbreviations\` options array to avoid such strings of text
being treated as sentence endings when followed by dots. The \`.\` is not
necessary at the end of the array items.`,
                        items: {
                            type: 'string',
                        },
                        type: 'array',
                    },
                    newlineBeforeCapsAssumesBadSentenceEnd: {
                        description: `When \`false\` (the new default), we will not assume capital letters after
newlines are an incorrect way to end the sentence (they may be proper
nouns, for example).`,
                        type: 'boolean',
                    },
                    tags: {
                        description: `If you want additional tags to be checked for their descriptions, you may
add them within this option.

\`\`\`js
{
    'jsdoc/require-description-complete-sentence': ['error', {
        tags: ['see', 'copyright']
    }]
}
\`\`\`

The tags \`@param\`/\`@arg\`/\`@argument\` and \`@property\`/\`@prop\` will be properly
parsed to ensure that the checked "description" text includes only the text
after the name.

All other tags will treat the text following the tag name, a space, and
an optional curly-bracketed type expression (and another space) as part of
its "description" (e.g., for \`@returns {someType} some description\`, the
description is \`some description\` while for \`@some-tag xyz\`, the description
is \`xyz\`).`,
                        items: {
                            type: 'string',
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
