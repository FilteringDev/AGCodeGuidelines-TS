// Options are validated against this rule's metadata schema before execution.
import iterateJsdoc from '../iterateJsdoc';

type Options = [{ enableFixer?: boolean }?];

/**
 * @param targetTagName The target tag name value.
 * @param enableFixer The enable fixer value.
 * @param jsdoc The jsdoc value.
 * @param utils The utils value.
 * @returns The result of this check.
 */
const validatePropertyNames = (
    targetTagName: string,
    enableFixer: boolean,
    jsdoc: import('comment-parser').Block,
    utils: import('../iterateJsdoc').Utils,
): boolean => {
    const jsdocTypedefs = utils.getJsdocTagsDeep('typedef');
    let propertyTagGroups;
    if (jsdocTypedefs && jsdocTypedefs.length > 1) {
        propertyTagGroups = jsdocTypedefs.map(({ idx }, index) => Object.entries(jsdoc.tags).slice(
            idx,
            jsdocTypedefs[index + 1]?.idx,
        ));
    } else {
        propertyTagGroups = [Object.entries(jsdoc.tags)];
    }

    return propertyTagGroups.some((propertyTagGroup) => {
        const propertyTags = propertyTagGroup.filter(([, tag]) => tag.tag === targetTagName);

        return propertyTags.some(([, tag], index) => {
            let tagsIndex: import('../iterateJsdoc').Integer;
            const dupeTagInfo = propertyTags.find(([tgsIndex, tg], idx) => {
                tagsIndex = Number(tgsIndex);

                return tg.name === tag.name && idx !== index;
            });
            if (dupeTagInfo) {
                utils.reportJSDoc(
                    `Duplicate @${targetTagName} "${tag.name}"`,
                    dupeTagInfo[1],
                    enableFixer
                        ? () => {
                            utils.removeTag(tagsIndex);
                        }
                        : null,
                );

                return true;
            }

            return false;
        });
    });
};

/**
 * @param targetTagName The target tag name value.
 * @param jsdocPropertyNames The jsdoc property names value.
 * @param jsdoc The jsdoc value.
 * @param report The report value.
 * @returns The result of this check.
 */
const validatePropertyNamesDeep = (
    targetTagName: string,
    jsdocPropertyNames: {
        idx: number;
        name: string;
        type: string;
    }[],
    jsdoc: import('comment-parser').Block,
    report: import('../iterateJsdoc').Report,
) => {
    let lastRealProperty: string;

    return jsdocPropertyNames.some(({ idx, name: jsdocPropertyName }) => {
        const isPropertyPath = jsdocPropertyName.includes('.');

        if (isPropertyPath) {
            if (!lastRealProperty) {
                report(
                    `@${targetTagName} path declaration ("${jsdocPropertyName}") appears before any real property.`,
                    null,
                    jsdoc.tags[idx],
                );

                return true;
            }

            let pathRootNodeName = jsdocPropertyName.slice(
                0,
                jsdocPropertyName.indexOf('.'),
            );

            if (pathRootNodeName.endsWith('[]')) {
                pathRootNodeName = pathRootNodeName.slice(0, -2);
            }

            if (pathRootNodeName !== lastRealProperty) {
                report(
                    `@${targetTagName} path declaration ("${jsdocPropertyName}") root node name ("${pathRootNodeName}") `
                        + `does not match previous real property name ("${lastRealProperty}").`,
                    null,
                    jsdoc.tags[idx],
                );

                return true;
            }
        } else {
            lastRealProperty = jsdocPropertyName;
        }

        return false;
    });
};

export default iterateJsdoc(
    ({
        context, jsdoc, report, utils,
    }) => {
        const { enableFixer = false } = (context.options as Options)[0] || {};
        const jsdocPropertyNamesDeep = utils.getJsdocTagsDeep('property');
        if (!jsdocPropertyNamesDeep || !jsdocPropertyNamesDeep.length) {
            return;
        }

        const targetTagName = utils.getPreferredTagName({
            tagName: 'property',
        }) as string;
        const isError = validatePropertyNames(
            targetTagName,
            enableFixer,
            jsdoc,
            utils,
        );

        if (isError) {
            return;
        }

        validatePropertyNamesDeep(
            targetTagName,
            jsdocPropertyNamesDeep,
            jsdoc,
            report,
        );
    },
    {
        iterateAllJsdocs: true,
        meta: {
            docs: {
                description:
                    'Ensures that property names in JSDoc are not duplicated on the same block and that nested properties have defined roots.',
                url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/check-property-names.md#repos-sticky-header',
            },
            fixable: 'code',
            schema: [
                {
                    additionalProperties: false,
                    properties: {
                        enableFixer: {
                            description: `Set to \`true\` to auto-remove \`@property\` duplicates (based on
identical names).

Note that this option will remove duplicates of the same name even if
the definitions do not match in other ways (e.g., the second property will
be removed even if it has a different type or description).`,
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
