import type { LegacyRule, Node } from '../../types';
/**
 * @file Enforce no duplicate props
 * @author Markus Ånöstam
 */
import dependency0 from '../../compat/hasown';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/report';

const has = dependency0;
const docsUrl = dependency1;
const report = dependency2;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noDuplicateProps: 'No duplicate props allowed',
};

const rule: LegacyRule<[{ ignoreCase?: boolean }?]> = {
    meta: {
        docs: {
            description: 'Disallow duplicate properties in JSX',
            category: 'Possible Errors',
            recommended: true,
            url: docsUrl('jsx-no-duplicate-props'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    ignoreCase: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || {};
        const ignoreCase = configuration.ignoreCase || false;

        return {
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                const props: Record<string, number> = {};

                node.attributes.forEach((decl) => {
                    if (decl.type === 'JSXSpreadAttribute') {
                        return;
                    }

                    let { name } = decl.name;

                    if (typeof name !== 'string') {
                        return;
                    }

                    if (ignoreCase) {
                        name = name.toLowerCase();
                    }

                    if (has(props, name)) {
                        report(context, messages.noDuplicateProps, 'noDuplicateProps', {
                            node: decl,
                        });
                    } else {
                        props[name] = 1;
                    }
                });
            },
        };
    },
};

export default rule;
