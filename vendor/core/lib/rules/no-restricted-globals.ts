/**
 * @file Restrict usage of specified globals.
 * @author Benoît Zugmeyer
 */
import type {
    LegacyRule, Node, Reference, Variable,
} from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<(string | { name: string; message?: string })[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow specified global variables',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-restricted-globals',
        },

        schema: {
            type: 'array',
            items: {
                oneOf: [
                    {
                        type: 'string',
                    },
                    {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            message: { type: 'string' },
                        },
                        required: ['name'],
                        additionalProperties: false,
                    },
                ],
            },
            uniqueItems: true,
            minItems: 0,
        },

        messages: {
            defaultMessage: "Unexpected use of '{{name}}'.",
            // eslint-disable-next-line eslint-plugin/report-message-format -- Custom message might not end in a
            // period
            customMessage: "Unexpected use of '{{name}}'. {{customMessage}}",
        },
    },

    create(context) {
        const { sourceCode } = context;

        // If no globals are restricted, we don't need to do anything
        if (context.options.length === 0) {
            return {};
        }

        const restrictedGlobalMessages = context.options.reduce<
            Record<string, string | null | undefined>
        >((memo, option) => {
            if (typeof option === 'string') {
                Object.assign(memo, { [option]: null });
            } else {
                Object.assign(memo, { [option.name]: option.message });
            }

            return memo;
        }, {});

        /**
         * Report a variable to be used as a restricted global.
         * @param reference the variable reference
         */
        function reportReference(reference: Reference) {
            const { name } = reference.identifier;
            const customMessage = restrictedGlobalMessages[name];
            const messageId = customMessage ? 'customMessage' : 'defaultMessage';

            context.report({
                node: reference.identifier,
                messageId,
                data: {
                    name,
                    customMessage,
                },
            });
        }

        /**
         * Check if the given name is a restricted global name.
         * @param name name of a variable
         * @returns whether the variable is a restricted global or not
         */
        function isRestricted(name: string) {
            return Object.prototype.hasOwnProperty.call(restrictedGlobalMessages, name);
        }

        return {
            Program(node: Node<'Program'>) {
                const scope = sourceCode.getScope(node);

                // Report variables declared elsewhere (ex: variables defined as "global" by eslint)
                scope.variables.forEach((variable: Variable) => {
                    if (!variable.defs.length && isRestricted(variable.name)) {
                        variable.references.forEach(reportReference);
                    }
                });

                // Report variables not declared at all
                scope.through.forEach((reference: Reference) => {
                    if (isRestricted(reference.identifier.name)) {
                        reportReference(reference);
                    }
                });
            },
        };
    },
};

export default rule;
