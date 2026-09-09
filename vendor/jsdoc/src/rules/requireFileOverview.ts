// Options are validated against this rule's metadata schema before execution.
import iterateJsdoc from '../iterateJsdoc';

interface TagRequirements { initialCommentsOnly?: boolean; mustExist?: boolean; preventDuplicates?: boolean }
type Options = [{ tags?: Record<string, TagRequirements> }?];

const defaultTags = {
    file: {
        initialCommentsOnly: true,
        mustExist: true,
        preventDuplicates: true,
    },
};

/**
 * @param state The state value.
 */
const setDefaults = (state: import('../iterateJsdoc').StateObject): void => {
    // First iteration
    if (!state.globalTags) {
        Object.assign(state, { globalTags: true });
        Object.assign(state, { hasDuplicates: {} });
        Object.assign(state, { hasTag: {} });
        Object.assign(state, { hasNonCommentBeforeTag: {} });
    }
};

export default iterateJsdoc(
    ({
        context, jsdocNode, state, utils,
    }) => {
        const { tags = defaultTags } = (context.options as Options)[0] || {};

        setDefaults(state);

        (Object.keys(tags)).forEach((tagName) => {
            const targetTagName = utils.getPreferredTagName({
                tagName,
            }) as string;

            const hasTag = Boolean(
                targetTagName && utils.hasTag(targetTagName),
            );

            Object.assign(state.hasTag, { [tagName]: hasTag || state.hasTag[tagName] });

            const hasDuplicate = state.hasDuplicates[tagName];

            if (hasDuplicate === false) {
                // Was marked before, so if a tag now, is a dupe
                Object.assign(state.hasDuplicates, { [tagName]: hasTag });
            } else if (!hasDuplicate && hasTag) {
                // No dupes set before, but has first tag, so change state
                //   from `undefined` to `false` so can detect next time
                Object.assign(state.hasDuplicates, { [tagName]: false });
                Object.assign(state.hasNonCommentBeforeTag, {
                    [tagName]: state.hasNonComment
                    && state.hasNonComment < jsdocNode.range[0],
                });
            }
        });
    },
    {
        exit({ context, state, utils }) {
            setDefaults(state);
            const { tags = defaultTags } = (context.options as Options)[0] || {};

            (Object.entries(tags)).forEach(([
                tagName,
                {
                    initialCommentsOnly = false,
                    mustExist = false,
                    preventDuplicates = false,
                },
            ]) => {
                const obj = utils!.getPreferredTagNameObject({
                    tagName,
                });
                if (obj && typeof obj === 'object' && 'blocked' in obj) {
                    utils!.reportSettings(
                        `\`settings.jsdoc.tagNamePreference\` cannot block @${obj.tagName} `
                            + 'for the `require-file-overview` rule',
                    );
                } else {
                    const targetTagName = (obj && typeof obj === 'object' && obj.replacement)
                        || obj;
                    if (mustExist && !state.hasTag[tagName]) {
                        utils!.reportSettings(`Missing @${targetTagName}`);
                    }

                    if (preventDuplicates && state.hasDuplicates[tagName]) {
                        utils!.reportSettings(`Duplicate @${targetTagName}`);
                    }

                    if (
                        initialCommentsOnly
                        && state.hasNonCommentBeforeTag[tagName]
                    ) {
                        utils!.reportSettings(
                            `@${targetTagName} should be at the beginning of the file`,
                        );
                    }
                }
            });
        },
        iterateAllJsdocs: true,
        meta: {
            docs: {
                description:
                    'Checks that all files have one `@file`, `@fileoverview`, or `@overview` tag at the beginning of the file.',
                url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/require-file-overview.md#repos-sticky-header',
            },
            schema: [
                {
                    additionalProperties: false,
                    properties: {
                        tags: {
                            description: `The keys of this object are tag names, and the values are configuration
objects indicating what will be checked for these whole-file tags.

Each configuration object has 3 potential boolean keys (which default
to \`false\` when this option is supplied).

1. \`mustExist\` - enforces that all files have a \`@file\`, \`@fileoverview\`, or \`@overview\` tag.
2. \`preventDuplicates\` - enforces that duplicate file overview tags within a given file will be reported
3. \`initialCommentsOnly\` - reports file overview tags which are not, as per
  [the docs](https://jsdoc.app/tags-file.html), "at the beginning of
  the file"–where beginning of the file is interpreted in this rule
  as being when the overview tag is not preceded by anything other than
  a comment.

When no \`tags\` is present, the default is:

\`\`\`json
{
  "file": {
    "initialCommentsOnly": true,
    "mustExist": true,
    "preventDuplicates": true,
  }
}
\`\`\`

You can add additional tag names and/or override \`file\` if you supply this
option, e.g., in place of or in addition to \`file\`, giving other potential
file global tags like \`@license\`, \`@copyright\`, \`@author\`, \`@module\` or
\`@exports\`, optionally restricting them to a single use or preventing them
from being preceded by anything besides comments.

For example:

\`\`\`js
{
  "license": {
    "mustExist": true,
    "preventDuplicates": true,
  }
}
\`\`\`

This would require one and only one \`@license\` in the file, though because
\`initialCommentsOnly\` is absent and defaults to \`false\`, the \`@license\`
can be anywhere.

In the case of \`@license\`, you can use this rule along with the
\`check-values\` rule (with its \`allowedLicenses\` or \`licensePattern\` options),
to enforce a license whitelist be present on every JS file.

Note that if you choose to use \`preventDuplicates\` with \`license\`, you still
have a way to allow multiple licenses for the whole page by using the SPDX
"AND" expression, e.g., \`@license (MIT AND GPL-3.0)\`.

Note that the tag names are the main JSDoc tag name, so you should use \`file\`
in this configuration object regardless of whether you have configured
\`fileoverview\` instead of \`file\` on \`tagNamePreference\` (i.e., \`fileoverview\`
will be checked, but you must use \`file\` on the configuration object).`,
                            patternProperties: {
                                '.*': {
                                    additionalProperties: false,
                                    properties: {
                                        initialCommentsOnly: {
                                            type: 'boolean',
                                        },
                                        mustExist: {
                                            type: 'boolean',
                                        },
                                        preventDuplicates: {
                                            type: 'boolean',
                                        },
                                    },
                                    type: 'object',
                                },
                            },
                            type: 'object',
                        },
                    },
                    type: 'object',
                },
            ],
            type: 'suggestion',
        },
        nonComment({ node, state }) {
            if (!state.hasNonComment) {
                Object.assign(state, {
                    hasNonComment: (
                        node.range as [number, number]
                    )?.[0],
                });
            }
        },
    },
);
