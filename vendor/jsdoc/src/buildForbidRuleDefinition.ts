import iterateJsdoc from './iterateJsdoc';

export type Contexts = (
    | string
    | { comment: string; context: string; message?: string }
)[];

/**
 * @param cfg The cfg value.
 * @param cfg.contexts The contexts value.
 * @param cfg.description The description value.
 * @param cfg.getContexts The get contexts value.
 * @param cfg.contextName The context name value.
 * @param cfg.modifyContext The modify context value.
 * @param cfg.schema The schema value.
 * @param cfg.url The url value.
 * @returns The result of this check.
 */
export const buildForbidRuleDefinition = (cfg: {
    contexts?: Contexts;
    description?: string;
    getContexts?: (
        ctxt: import('../types').Context,
        report: import('./iterateJsdoc').Report,
    ) => Contexts | false;
    contextName?: string;
    modifyContext?: (
        context: import('../types').Context,
    ) => import('../types').Context;
    schema?: import('eslint').Rule.RuleMetaData['schema'];
    url?: string;
}): import('../types').Rule => {
    const {
        contextName,
        contexts: cntxts,
        description,
        getContexts,
        modifyContext,
        schema,
        url,
    } = cfg; return iterateJsdoc(
        ({
            context, info: { comment }, report, utils,
        }) => {
            let contexts: Contexts | boolean | undefined = cntxts;

            if (getContexts) {
                contexts = getContexts(context, report);
                if (!contexts) {
                    return;
                }
            }

            const { contextStr, foundContext } = utils.findContext(
                contexts as Contexts,
                comment,
            );

            // We are not on the *particular* matching context/comment, so don't assume
            //   we need reporting
            if (!foundContext) {
                return;
            }

            const message = (
                foundContext as import('./iterateJsdoc').ContextObject
            )?.message
                ?? `Syntax is restricted: {{context}}${
                    comment ? ' with {{comment}}' : ''}`;

            report(
                message,
                null,
                null,
                comment
                    ? {
                        comment,
                        context: contextStr,
                    }
                    : {
                        context: contextStr,
                    },
            );
        },
        {
            contextSelected: true,
            meta: {
                docs: {
                    description:
                        description
                        ?? contextName
                        ?? 'Reports when certain comment structures are present.',
                    url:
                        url
                        ?? 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/advanced.md#user-content-advanced-creating-your-own-rules',
                },
                schema: schema ?? [],
                type: 'suggestion',
            },
            modifyContext:
                modifyContext
                ?? (getContexts
                    ? undefined
                    : (context) => {
                        // Reproduce context object with our own `contexts`
                        const propertyDescriptors = Object.getOwnPropertyDescriptors(context);
                        return Object.create(Object.getPrototypeOf(context), {
                            ...propertyDescriptors,
                            options: {
                                ...propertyDescriptors.options,
                                value: [
                                    {
                                        contexts: cntxts,
                                    },
                                ],
                            },
                        });
                    }),
            nonGlobalSettings: true,
        },
    );
};
