import type { TSESTree } from '@typescript-eslint/types';
// Options are validated against this rule's metadata schema before execution.
import escapeStringRegexp from 'escape-string-regexp';
import iterateJsdoc from '../iterateJsdoc';

type Options = [
    {
        definedTags?: string[];
        enableFixer?: boolean;
        inlineTags?: string[];
        jsxTags?: boolean;
        typed?: boolean;
    }?,
];

// https://babeljs.io/docs/en/babel-plugin-transform-react-jsx/
const jsxTagNames = new Set([
    'jsx',
    'jsxFrag',
    'jsxImportSource',
    'jsxRuntime',
]);

const typedTagsAlwaysUnnecessary = new Set([
    'augments',
    'callback',
    'class',
    'enum',
    'implements',
    'private',
    'property',
    'protected',
    'public',
    'readonly',
    'this',
    'type',
    'typedef',
]);

const typedTagsNeedingName = new Set(['template']);

const typedTagsUnnecessaryOutsideDeclare = new Set([
    'abstract',
    'access',
    'class',
    'constant',
    'constructs',
    'default',
    'enum',
    'export',
    'exports',
    'function',
    'global',
    'inherits',
    'instance',
    'interface',
    'member',
    'memberof',
    'memberOf',
    'method',
    'mixes',
    'mixin',
    'module',
    'name',
    'namespace',
    'override',
    'property',
    'requires',
    'static',
    'this',
]);

export default iterateJsdoc(
    ({
        context,
        jsdoc,
        jsdocNode,
        node,
        report,
        settings,
        sourceCode,
        utils,
    }) => {
        const /**
     }}
               */ {
                definedTags = [],
                enableFixer = true,
                inlineTags = [
                    // jsdoc
                    'link',
                    'linkcode',
                    'linkplain',
                    'tutorial',
                    // https://tsdoc.org/pages/spec/tag_kinds/#inline-tags
                    'inheritDoc',
                    'label',
                    // https://typedoc.org/documents/Tags.html#inline-tags
                    'include',
                    'includeCode',
                ],
                jsxTags,
                typed,
            } = (context.options as Options)[0] || {};

        let definedPreferredTags: (string | undefined)[] = [];
        const { structuredTags, tagNamePreference } = settings;
        const definedStructuredTags = Object.keys(structuredTags);
        const definedNonPreferredTags = Object.keys(tagNamePreference);
        if (definedNonPreferredTags.length) {
            definedPreferredTags = Object.values(tagNamePreference)
                .map((preferredTag) => {
                    if (typeof preferredTag === 'string') {
                        // May become an empty string but will be filtered out below
                        return preferredTag;
                    }

                    if (!preferredTag) {
                        return undefined;
                    }

                    if (typeof preferredTag !== 'object') {
                        utils.reportSettings(
                            'Invalid `settings.jsdoc.tagNamePreference`. Values must be falsy, a string, or an object.',
                        );
                    }

                    return preferredTag.replacement;
                })
                .filter(Boolean);
        }

        /**
         * @param subNode The sub node value.
         * @returns The result of this check.
         */
        const isInAmbientContext = (
            subNode: import('eslint').Rule.Node,
        ): boolean => (subNode.type === 'Program'
            ? (context.filename ?? context.getFilename()).endsWith('.d.ts')
            : Boolean(
                (
                    subNode as TSESTree.VariableDeclaration
                ).declare,
            ) || isInAmbientContext(subNode.parent));

        /**
         * @param jsdocTag The jsdoc tag value.
         * @returns The result of this check.
         */
        const tagIsRedundantWhenTyped = (
            jsdocTag: import('comment-parser').Spec,
        ): boolean => {
            if (!typedTagsUnnecessaryOutsideDeclare.has(jsdocTag.tag)) {
                return false;
            }

            if (jsdocTag.tag === 'default') {
                return false;
            }

            if (node === null) {
                return false;
            }

            if (
                (context.filename ?? context.getFilename()).endsWith('.d.ts')
                && [null, 'Program', undefined].includes(node?.parent?.type)
            ) {
                return false;
            }

            if (
                isInAmbientContext(node as import('eslint').Rule.Node)
            ) {
                return false;
            }

            return true;
        };

        /**
         * @param message The message value.
         * @param jsdocTag The jsdoc tag value.
         * @param tagIndex The tag index value.
         * @param [additionalTagChanges] The additional tag changes value.
         */
        const reportWithTagRemovalFixer = (
            message: string,
            jsdocTag: import('comment-parser').Spec,
            tagIndex: import('../iterateJsdoc').Integer,
            additionalTagChanges?: Partial<import('comment-parser').Tokens>,
        ): void => {
            utils.reportJSDoc(
                message,
                jsdocTag,
                enableFixer
                    ? () => {
                        if (jsdocTag.description.trim()) {
                            utils.changeTag(jsdocTag, {
                                postType: '',
                                type: '',
                                ...additionalTagChanges,
                            });
                        } else {
                            utils.removeTag(tagIndex, {
                                removeEmptyBlock: true,
                            });
                        }
                    }
                    : null,
                true,
            );
        };

        /**
         * @param jsdocTag The jsdoc tag value.
         * @param tagIndex The tag index value.
         * @returns The result of this check.
         */
        const checkTagForTypedValidity = (
            jsdocTag: import('comment-parser').Spec,
            tagIndex: import('../iterateJsdoc').Integer,
        ): boolean => {
            if (typedTagsAlwaysUnnecessary.has(jsdocTag.tag)) {
                reportWithTagRemovalFixer(
                    `'@${jsdocTag.tag}' is redundant when using a type system.`,
                    jsdocTag,
                    tagIndex,
                    {
                        postTag: '',
                        tag: '',
                    },
                );
                return true;
            }

            if (tagIsRedundantWhenTyped(jsdocTag)) {
                reportWithTagRemovalFixer(
                    `'@${jsdocTag.tag}' is redundant outside of ambient (\`declare\`/\`.d.ts\`) contexts when using a type system.`,
                    jsdocTag,
                    tagIndex,
                );
                return true;
            }

            if (typedTagsNeedingName.has(jsdocTag.tag) && !jsdocTag.name) {
                reportWithTagRemovalFixer(
                    `'@${jsdocTag.tag}' without a name is redundant when using a type system.`,
                    jsdocTag,
                    tagIndex,
                );
                return true;
            }

            return false;
        };

        const checkTagAtIndex = (tagIndex: number) => {
            const jsdocTag = jsdoc.tags[tagIndex];
            const tagName = jsdocTag!.tag;
            if (jsxTags && jsxTagNames.has(tagName)) {
                return;
            }

            if (typed && checkTagForTypedValidity(jsdocTag!, tagIndex)) {
                return;
            }

            const validTags = [
                ...definedTags,
                ...(definedPreferredTags as string[]),
                ...definedNonPreferredTags,
                ...definedStructuredTags,
                ...(typed ? typedTagsNeedingName : []),
            ];

            if (utils.isValidTag(tagName, validTags)) {
                let preferredTagName = utils.getPreferredTagName({
                    allowObjectReturn: true,
                    defaultMessage: `Blacklisted tag found (\`@${tagName}\`)`,
                    tagName,
                });
                if (!preferredTagName) {
                    return;
                }

                let message;
                if (typeof preferredTagName === 'object') {
                    ({ message, replacement: preferredTagName } = preferredTagName as {
                        message: string;
                        replacement?: string | undefined;
                    });
                }

                if (!message) {
                    message = `Invalid JSDoc tag (preference). Replace "${tagName}" JSDoc tag with "${preferredTagName}".`;
                }

                if (preferredTagName !== tagName) {
                    report(
                        message,
                        (fixer) => {
                            const replacement = sourceCode
                                .getText(jsdocNode)
                                .replace(
                                    new RegExp(
                                        `@${escapeStringRegexp(tagName)}\\b`,
                                        'v',
                                    ),
                                    `@${preferredTagName}`,
                                );

                            return fixer.replaceText(jsdocNode, replacement);
                        },
                        jsdocTag,
                    );
                }
            } else {
                report(`Invalid JSDoc tag name "${tagName}".`, null, jsdocTag);
            }
        };
        for (let tagIndex = 0; tagIndex < jsdoc.tags.length; tagIndex += 1) {
            checkTagAtIndex(tagIndex);
        }

        (utils.getInlineTags()).forEach((inlineTag) => {
            if (!inlineTags.includes(inlineTag.tag)) {
                report(
                    `Invalid JSDoc inline tag name "${inlineTag.tag}"`,
                    null,
                    inlineTag,
                );
            }
        });
    },
    {
        iterateAllJsdocs: true,
        meta: {
            docs: {
                description: 'Reports invalid block tag names.',
                url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/check-tag-names.md#repos-sticky-header',
            },
            fixable: 'code',
            schema: [
                {
                    additionalProperties: false,
                    properties: {
                        definedTags: {
                            description: `Use an array of \`definedTags\` strings to configure additional, allowed tags.
The format is as follows:

\`\`\`json
{
  "definedTags": ["note", "record"]
}
\`\`\``,
                            items: {
                                type: 'string',
                            },
                            type: 'array',
                        },
                        enableFixer: {
                            description:
                                'Set to `false` to disable auto-removal of types that are redundant with the [`typed` option](#typed).',
                            type: 'boolean',
                        },
                        inlineTags: {
                            description: `List of tags to allow inline.

Defaults to array of \`'link', 'linkcode', 'linkplain', 'tutorial', 'inheritDoc', 'label', 'include', and 'includeCode'\``,
                            items: {
                                type: 'string',
                            },
                            type: 'array',
                        },
                        jsxTags: {
                            description: `If this is set to \`true\`, all of the following tags used to control JSX output are allowed:

\`\`\`
jsx
jsxFrag
jsxImportSource
jsxRuntime
\`\`\`

For more information, see the [babel documentation](https://babeljs.io/docs/en/babel-plugin-transform-react-jsx).`,
                            type: 'boolean',
                        },
                        typed: {
                            description: `If this is set to \`true\`, additionally checks for tag names that are redundant when using a type checker such as TypeScript.

These tags are always unnecessary when using TypeScript or similar:

\`\`\`
augments
callback
class
enum
implements
private
property
protected
public
readonly
this
type
typedef
\`\`\`

These tags are unnecessary except when inside a TypeScript \`declare\` context:

\`\`\`
abstract
access
class
constant
constructs
default
enum
export
exports
function
global
inherits
instance
interface
member
memberof
memberOf
method
mixes
mixin
module
name
namespace
override
property
requires
static
this
\`\`\``,
                            type: 'boolean',
                        },
                    },
                    type: 'object',
                },
            ],
            type: 'suggestion',
        },
    },
);
