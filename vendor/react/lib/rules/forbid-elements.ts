import type { LegacyRule, Node } from '../../types';
/**
 * @file Forbid certain elements
 * @author Kenneth Chung
 */
import dependency0 from '../../compat/hasown';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/eslint';
import dependency3 from '../util/isCreateElement';
import dependency4 from '../util/report';

const has = dependency0;
const docsUrl = dependency1;
const { getText } = dependency2;
const isCreateElement = dependency3;
const report = dependency4;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    forbiddenElement: '<{{element}}> is forbidden',
    forbiddenElement_message: '<{{element}}> is forbidden, {{message}}',
};

const rule: LegacyRule<[{ forbid?: (string | { element: string; message?: string })[] }?]> = {
    meta: {
        docs: {
            description: 'Disallow certain elements',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('forbid-elements'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    forbid: {
                        type: 'array',
                        items: {
                            anyOf: [
                                { type: 'string' },
                                {
                                    type: 'object',
                                    properties: {
                                        element: { type: 'string' },
                                        message: { type: 'string' },
                                    },
                                    required: ['element'],
                                    additionalProperties: false,
                                },
                            ],
                        },
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || {};
        const forbidConfiguration = configuration.forbid || [];

        const indexedForbidConfigs: Record<string, { element: string; message?: string }> = {};

        forbidConfiguration.forEach((item) => {
            if (typeof item === 'string') {
                indexedForbidConfigs[item] = { element: item };
            } else {
                indexedForbidConfigs[item.element] = item;
            }
        });

        /**
         * @param element The element value.
         * @param node The node to inspect.
         */
        function reportIfForbidden(
            element: string | number | bigint | boolean | RegExp | null | undefined,
            node: Node,
        ) {
            if (has(indexedForbidConfigs, element as PropertyKey)) {
                const { message } = indexedForbidConfigs[element as string]!;

                report(
                    context,
                    message ? messages.forbiddenElement_message : messages.forbiddenElement,
                    message ? 'forbiddenElement_message' : 'forbiddenElement',
                    {
                        node,
                        data: {
                            element,
                            message,
                        },
                    },
                );
            }
        }

        return {
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                reportIfForbidden(getText(context, node.name), node.name);
            },

            CallExpression(node: Node<'CallExpression'>) {
                if (!isCreateElement(context, node)) {
                    return;
                }

                const argument = node.arguments[0];
                if (!argument) {
                    return;
                }

                if (argument.type === 'Identifier' && /^[A-Z_]/.test(argument.name)) {
                    reportIfForbidden(argument.name, argument);
                } else if (argument.type === 'Literal' && /^[a-z][^.]*$/.test(String(argument.value))) {
                    reportIfForbidden(argument.value, argument);
                } else if (argument.type === 'MemberExpression') {
                    reportIfForbidden(getText(context, argument), argument);
                }
            },
        };
    },
};

export default rule;
