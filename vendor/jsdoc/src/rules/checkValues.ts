// Options are validated against this rule's metadata schema before execution.
import { parseImportsExports } from 'parse-imports-exports';
import semver from 'semver';
import spdxExpressionParse from 'spdx-expression-parse';
import iterateJsdoc from '../iterateJsdoc';

type Options = [
    {
        allowedAuthors?: string[];
        allowedLicenses?: string[] | boolean;
        licensePattern?: string;
        numericOnlyVariation?: boolean;
    }?,
];

const allowedKinds = new Set([
    'class',
    'constant',
    'event',
    'external',
    'file',
    'function',
    'member',
    'mixin',
    'module',
    'namespace',
    'typedef',
]);

export default iterateJsdoc(
    ({
        context, report, settings, utils,
    }) => {
        const options = (context.options as Options)[0] || {};
        const {
            allowedAuthors = null,
            allowedLicenses = null,
            licensePattern = '/([^\n\r]*)/gv',
            numericOnlyVariation = false,
        } = options;

        utils.forEachPreferredTag(
            'version',
            (jsdocParameter, targetTagName) => {
                const version = (
                    utils.getTagDescription(jsdocParameter) as string
                ).trim();
                if (!version) {
                    report(
                        `Missing JSDoc @${targetTagName} value.`,
                        null,
                        jsdocParameter,
                    );
                } else if (!semver.valid(version)) {
                    report(
                        `Invalid JSDoc @${targetTagName}: "${utils.getTagDescription(jsdocParameter)}".`,
                        null,
                        jsdocParameter,
                    );
                }
            },
        );

        utils.forEachPreferredTag('kind', (jsdocParameter, targetTagName) => {
            const kind = (
                utils.getTagDescription(jsdocParameter) as string
            ).trim();
            if (!kind) {
                report(
                    `Missing JSDoc @${targetTagName} value.`,
                    null,
                    jsdocParameter,
                );
            } else if (!allowedKinds.has(kind)) {
                report(
                    `Invalid JSDoc @${targetTagName}: "${utils.getTagDescription(jsdocParameter)}"; `
                        + `must be one of: ${[...allowedKinds].join(', ')}.`,
                    null,
                    jsdocParameter,
                );
            }
        });

        if (numericOnlyVariation) {
            utils.forEachPreferredTag(
                'variation',
                (jsdocParameter, targetTagName) => {
                    const variation = (
                        utils.getTagDescription(jsdocParameter) as string
                    ).trim();
                    if (!variation) {
                        report(
                            `Missing JSDoc @${targetTagName} value.`,
                            null,
                            jsdocParameter,
                        );
                    } else if (
                        !Number.isInteger(Number(variation))
                        || Number(variation) <= 0
                    ) {
                        report(
                            `Invalid JSDoc @${targetTagName}: "${utils.getTagDescription(jsdocParameter)}".`,
                            null,
                            jsdocParameter,
                        );
                    }
                },
            );
        }

        utils.forEachPreferredTag('since', (jsdocParameter, targetTagName) => {
            const version = (
                utils.getTagDescription(jsdocParameter) as string
            ).trim();
            if (!version) {
                report(
                    `Missing JSDoc @${targetTagName} value.`,
                    null,
                    jsdocParameter,
                );
            } else if (!semver.valid(version)) {
                report(
                    `Invalid JSDoc @${targetTagName}: "${utils.getTagDescription(jsdocParameter)}".`,
                    null,
                    jsdocParameter,
                );
            }
        });
        utils.forEachPreferredTag(
            'license',
            (jsdocParameter, targetTagName) => {
                const licenseRegex = utils.getRegexFromString(
                    licensePattern,
                    'g',
                );
                const matches = (
                    utils.getTagDescription(jsdocParameter) as string
                ).matchAll(licenseRegex);
                let positiveMatch = false;
                const matchedValues = Array.from(matches);
                for (let matchedValuesIndex = 0; matchedValuesIndex < matchedValues.length; matchedValuesIndex += 1) {
                    const match = matchedValues[matchedValuesIndex]!;
                    const license = match[1] || match[0];
                    if (license) {
                        positiveMatch = true;
                    }

                    if (!license.trim()) {
                        // Avoid reporting again as empty match
                        if (positiveMatch) {
                            return;
                        }

                        report(
                            `Missing JSDoc @${targetTagName} value.`,
                            null,
                            jsdocParameter,
                        );
                    } else if (allowedLicenses) {
                        if (
                            allowedLicenses !== true
                            && !allowedLicenses.includes(license)
                        ) {
                            report(
                                `Invalid JSDoc @${targetTagName}: "${license}"; expected one of ${allowedLicenses.join(', ')}.`,
                                null,
                                jsdocParameter,
                            );
                        }
                    } else {
                        try {
                            spdxExpressionParse(license);
                        } catch {
                            report(
                                `Invalid JSDoc @${targetTagName}: "${license}"; expected SPDX expression: https://spdx.org/licenses/.`,
                                null,
                                jsdocParameter,
                            );
                        }
                    }
                }
            },
        );

        if (settings.mode === 'typescript') {
            utils.forEachPreferredTag('import', (tag) => {
                const { description, name, type } = tag;
                const typePart = type ? `{${type}} ` : '';
                const imprt = `import ${
                    description
                        ? `${typePart}${name} ${description}`
                        : `${typePart}${name}`}`;

                const importsExports = parseImportsExports(imprt.trim());

                if (importsExports.errors) {
                    report('Bad @import tag', null, tag);
                }
            });
        }

        utils.forEachPreferredTag('author', (jsdocParameter, targetTagName) => {
            const author = (
                utils.getTagDescription(jsdocParameter) as string
            ).trim();
            if (!author) {
                report(
                    `Missing JSDoc @${targetTagName} value.`,
                    null,
                    jsdocParameter,
                );
            } else if (allowedAuthors && !allowedAuthors.includes(author)) {
                report(
                    `Invalid JSDoc @${targetTagName}: "${utils.getTagDescription(jsdocParameter)}"; expected one of ${allowedAuthors.join(', ')}.`,
                    null,
                    jsdocParameter,
                );
            }
        });
    },
    {
        iterateAllJsdocs: true,
        meta: {
            docs: {
                description:
                    'This rule checks the values for a handful of tags: `@version`, `@since`, `@license` and `@author`.',
                url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/check-values.md#repos-sticky-header',
            },
            schema: [
                {
                    additionalProperties: false,
                    properties: {
                        allowedAuthors: {
                            description: `An array of allowable author values. If absent, only non-whitespace will
be checked for.`,
                            items: {
                                type: 'string',
                            },
                            type: 'array',
                        },
                        allowedLicenses: {
                            anyOf: [
                                {
                                    items: {
                                        type: 'string',
                                    },
                                    type: 'array',
                                },
                                {
                                    type: 'boolean',
                                },
                            ],
                            description: `An array of allowable license values or \`true\` to allow any license text.
If present as an array, will be used in place of [SPDX identifiers](https://spdx.org/licenses/).`,
                        },
                        licensePattern: {
                            description: `A string to be converted into a \`RegExp\` (with \`v\` flag) and whose first
parenthetical grouping, if present, will match the portion of the license
description to check (if no grouping is present, then the whole portion
matched will be used). Defaults to \`/([^\\n\\r]*)/gv\`, i.e., the SPDX expression
is expected before any line breaks.

Note that the \`/\` delimiters are optional, but necessary to add flags.

Defaults to using the \`v\` flag, so to add your own flags, encapsulate
your expression as a string, but like a literal, e.g., \`/^mit$/vi\`.`,
                            type: 'string',
                        },
                        numericOnlyVariation: {
                            description: `Whether to enable validation that \`@variation\` must be a number. Defaults to
\`false\`.`,
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
