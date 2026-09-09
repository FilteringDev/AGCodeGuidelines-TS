import { parse as parseType, traverse } from '@es-joy/jsdoccomment';
import iterateJsdoc from '../iterateJsdoc';

export default iterateJsdoc(
    ({ settings, utils }) => {
        if (settings.mode !== 'typescript') {
            return;
        }

        /**
         * @param tag The tag value.
         */
        const checkType = (
            tag: import('@es-joy/jsdoccomment').JsdocTagWithInline,
        ) => {
            const potentialType = tag.type;
            let parsedType;
            try {
                parsedType = parseType(
                    potentialType as string,
                    'typescript',
                );
            } catch {
                return;
            }

            traverse(parsedType, (nde) => {
                switch (nde.type) {
                    case 'JsdocTypeObject': {
                        if (!nde.elements.length) {
                            utils.reportJSDoc('No empty object type.', tag);
                        }

                        break;
                    }

                    default: break;
                }
            });
        };

        const tags = utils.filterTags(({ tag }) => Boolean(
            tag !== 'import' && utils.tagMightHaveTypePosition(tag),
        ));

        (tags).forEach((tag) => {
            if (tag.type) {
                checkType(tag);
            }
        });
    },
    {
        iterateAllJsdocs: true,
        meta: {
            docs: {
                description: 'Warns against use of the empty object type',
                url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/ts-no-empty-object-type.md#repos-sticky-header',
            },
            schema: [],
            type: 'suggestion',
        },
    },
);
