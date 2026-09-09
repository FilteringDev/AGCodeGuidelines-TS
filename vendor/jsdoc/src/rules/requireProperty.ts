import iterateJsdoc from '../iterateJsdoc';

export default iterateJsdoc(
    ({ context, utils }) => {
        const propertyAssociatedTags = utils.filterTags(({ tag }) => ['namespace', 'typedef'].includes(tag));
        if (!propertyAssociatedTags.length) {
            return;
        }

        const targetTagName = utils.getPreferredTagName({
            tagName: 'property',
        }) as string;

        if (!targetTagName) {
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
                message:
                    'Cannot prohibit `@property` in the `tagNamePreference` setting while using the `require-property` rule.',
            });
            return;
        }

        if (utils.hasATag([targetTagName])) {
            return;
        }

        (propertyAssociatedTags).forEach((propertyAssociatedTag) => {
            if (
                !['object', 'Object', 'PlainObject'].includes(
                    propertyAssociatedTag.type,
                )
            ) {
                return;
            }

            utils.reportJSDoc(`Missing JSDoc @${targetTagName}.`, null, () => {
                utils.addTag(targetTagName);
            });
        });
    },
    {
        iterateAllJsdocs: true,
        meta: {
            docs: {
                description:
                    'Requires that all `@typedef` and `@namespace` tags have `@property` when their type is a plain `object`, `Object`, or `PlainObject`.',
                url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/require-property.md#repos-sticky-header',
            },
            fixable: 'code',
            type: 'suggestion',
        },
    },
);
