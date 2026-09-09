/**
 * @file Restrict usage of specified node imports.
 * @author Guy Ellis
 */
import dependency1 from 'ignore';
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const ignore = dependency1;

type Schema = Exclude<
    NonNullable<NonNullable<LegacyRule['meta']>['schema']>,
    boolean | unknown[]
>;
type RestrictedPath = string | { name: string; message?: string; importNames?: string[] };
interface RestrictedPattern {
    group: string[];
    message?: string;
    caseSensitive?: boolean;
    importNames?: string[];
    importNamePattern?: string;
}
interface GroupedOptions {
    paths?: RestrictedPath[];
    patterns?: string[] | RestrictedPattern[];
}
type ImportNode = Node<'ImportDeclaration' | 'ExportNamedDeclaration' | 'ExportAllDeclaration'>;
type ImportNames = Map<string, { loc: Node['loc'] }[]>;

const arrayOfStringsOrObjects: Schema = {
    type: 'array',
    items: {
        anyOf: [
            { type: 'string' },
            {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    message: {
                        type: 'string',
                        minLength: 1,
                    },
                    importNames: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                },
                additionalProperties: false,
                required: ['name'],
            },
        ],
    },
    uniqueItems: true,
};

const arrayOfStringsOrObjectPatterns: Schema = {
    anyOf: [
        {
            type: 'array',
            items: {
                type: 'string',
            },
            uniqueItems: true,
        },
        {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    importNames: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        minItems: 1,
                        uniqueItems: true,
                    },
                    group: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        minItems: 1,
                        uniqueItems: true,
                    },
                    importNamePattern: {
                        type: 'string',
                    },
                    message: {
                        type: 'string',
                        minLength: 1,
                    },
                    caseSensitive: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
                required: ['group'],
            },
            uniqueItems: true,
        },
    ],
};

const rule: LegacyRule<
    | (string | { name: string; message?: string; importNames?: string[] })[]
    | [
          {
              paths?: (string | { name: string; message?: string; importNames?: string[] })[];
              patterns?:
                  | string[]
                  | {
                      importNames?: string[];
                      group: string[];
                      importNamePattern?: string;
                      message?: string;
                      caseSensitive?: boolean;
                  }[];
          }?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow specified modules when loaded by `import`',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-restricted-imports',
        },

        messages: {
            path: "'{{importSource}}' import is restricted from being used.",
            // eslint-disable-next-line eslint-plugin/report-message-format -- Custom message might not end in a
            // period
            pathWithCustomMessage:
                "'{{importSource}}' import is restricted from being used. {{customMessage}}",

            patterns: "'{{importSource}}' import is restricted from being used by a pattern.",
            // eslint-disable-next-line eslint-plugin/report-message-format -- Custom message might not end in a
            // period
            patternWithCustomMessage:
                "'{{importSource}}' import is restricted from being used by a pattern. {{customMessage}}",

            patternAndImportName:
                "'{{importName}}' import from '{{importSource}}' is restricted from being used by a pattern.",
            // eslint-disable-next-line eslint-plugin/report-message-format -- Custom message might not end in a
            // period
            patternAndImportNameWithCustomMessage:
                "'{{importName}}' import from '{{importSource}}' is restricted from being used by a pattern. {{customMessage}}",

            patternAndEverything:
                "* import is invalid because '{{importNames}}' from '{{importSource}}' is restricted from being used by a pattern.",

            patternAndEverythingWithRegexImportName:
                "* import is invalid because import name matching '{{importNames}}' pattern from '{{importSource}}' is restricted from being used.",
            // eslint-disable-next-line eslint-plugin/report-message-format -- Custom message might not end in a
            // period
            patternAndEverythingWithCustomMessage:
                "* import is invalid because '{{importNames}}' from '{{importSource}}' is restricted from being used by a pattern. {{customMessage}}",
            // eslint-disable-next-line eslint-plugin/report-message-format -- Custom message might not end in a
            // period
            patternAndEverythingWithRegexImportNameAndCustomMessage:
                "* import is invalid because import name matching '{{importNames}}' pattern from '{{importSource}}' is restricted from being used. {{customMessage}}",

            everything:
                "* import is invalid because '{{importNames}}' from '{{importSource}}' is restricted.",
            // eslint-disable-next-line eslint-plugin/report-message-format -- Custom message might not end in a
            // period
            everythingWithCustomMessage:
                "* import is invalid because '{{importNames}}' from '{{importSource}}' is restricted. {{customMessage}}",

            importName: "'{{importName}}' import from '{{importSource}}' is restricted.",
            // eslint-disable-next-line eslint-plugin/report-message-format -- Custom message might not end in a
            // period
            importNameWithCustomMessage:
                "'{{importName}}' import from '{{importSource}}' is restricted. {{customMessage}}",
        },

        schema: {
            anyOf: [
                arrayOfStringsOrObjects,
                {
                    type: 'array',
                    items: [
                        {
                            type: 'object',
                            properties: {
                                paths: arrayOfStringsOrObjects,
                                patterns: arrayOfStringsOrObjectPatterns,
                            },
                            additionalProperties: false,
                        },
                    ],
                    additionalItems: false,
                },
            ],
        },
    },

    create(context) {
        const { sourceCode } = context;
        const options = Array.isArray(context.options) ? context.options : [];
        const isPathAndPatternsObject = typeof options[0] === 'object'
            && (Object.prototype.hasOwnProperty.call(options[0], 'paths')
                || Object.prototype.hasOwnProperty.call(options[0], 'patterns'));

        // Schema validation makes the legacy path-list and grouped options forms exclusive.
        const groupedOptions = isPathAndPatternsObject
            ? (options[0] as GroupedOptions)
            : undefined;
        const restrictedPaths = (groupedOptions ? groupedOptions.paths : (context.options as RestrictedPath[]))
            || [];
        const restrictedPathMessages = restrictedPaths.reduce<
            Record<string, { message?: string | null; importNames?: string[] }>
        >((memo, importSource) => {
            if (typeof importSource === 'string') {
                Object.assign(memo, { [importSource]: { message: null } });
            } else {
                Object.assign(memo, {
                    [importSource.name]: {
                        message: importSource.message,
                        importNames: importSource.importNames,
                    },
                });
            }
            return memo;
        }, {});

        // Handle patterns too, either as strings or groups
        const patternsOption = groupedOptions?.patterns || [];
        // The schema accepts homogeneous string lists or homogeneous pattern lists.
        const restrictedPatterns: RestrictedPattern[] = typeof patternsOption[0] === 'string'
            ? [{ group: patternsOption as string[] }]
            : (patternsOption as RestrictedPattern[]);

        // relative paths are supported for this rule
        const restrictedPatternGroups = restrictedPatterns.map(
            ({
                group, message, caseSensitive, importNames, importNamePattern,
            }) => ({
                matcher: ignore({ allowRelativePaths: true, ignorecase: !caseSensitive }).add(
                    group,
                ),
                customMessage: message,
                importNames,
                importNamePattern,
            }),
        );

        // if no imports are restricted we don't need to check
        if (Object.keys(restrictedPaths).length === 0 && restrictedPatternGroups.length === 0) {
            return {};
        }

        /**
         * Report a restricted path.
         * @param importSource path of the import
         * @param importNames Map of import names that are being imported
         * @param node representing the restricted path reference
         */
        function checkRestrictedPathAndReport(
            importSource: string,
            importNames: ImportNames,
            node: ImportNode,
        ) {
            if (!Object.prototype.hasOwnProperty.call(restrictedPathMessages, importSource)) {
                return;
            }

            const customMessage = restrictedPathMessages[importSource]!.message;
            const restrictedImportNames = restrictedPathMessages[importSource]!.importNames;

            if (restrictedImportNames) {
                if (importNames.has('*')) {
                    const specifierData = importNames!.get('*')![0];

                    context.report({
                        node,
                        messageId: customMessage ? 'everythingWithCustomMessage' : 'everything',
                        loc: specifierData!.loc,
                        data: {
                            importSource,
                            importNames: restrictedImportNames,
                            customMessage,
                        },
                    });
                }

                restrictedImportNames.forEach((importName) => {
                    if (importNames.has(importName)) {
                        const specifiers = importNames.get(importName);

                        specifiers!.forEach((specifier) => {
                            context.report({
                                node,
                                messageId: customMessage
                                    ? 'importNameWithCustomMessage'
                                    : 'importName',
                                loc: specifier.loc,
                                data: {
                                    importSource,
                                    customMessage,
                                    importName,
                                },
                            });
                        });
                    }
                });
            } else {
                context.report({
                    node,
                    messageId: customMessage ? 'pathWithCustomMessage' : 'path',
                    data: {
                        importSource,
                        customMessage,
                    },
                });
            }
        }

        /**
         * Report a restricted path specifically for patterns.
         * @param node representing the restricted path reference
         * @param group contains an Ignore instance for paths, the customMessage to show on failure,
         * and any restricted import names that have been specified in the config
         * @param importNames Map of import names that are being imported
         */
        function reportPathForPatterns(
            node: ImportNode,
            group: (typeof restrictedPatternGroups)[number],
            importNames: ImportNames,
        ) {
            const importSource = node.source!.value.trim();

            const { customMessage } = group;
            const restrictedImportNames = group.importNames;
            const restrictedImportNamePattern = group.importNamePattern
                ? new RegExp(group.importNamePattern, 'u')
                : null;

            /**
             * If we are not restricting to any specific import names and just the pattern itself,
             * report the error and move on
             */
            if (!restrictedImportNames && !restrictedImportNamePattern) {
                context.report({
                    node,
                    messageId: customMessage ? 'patternWithCustomMessage' : 'patterns',
                    data: {
                        importSource,
                        customMessage,
                    },
                });
                return;
            }

            importNames.forEach((specifiers, importName) => {
                if (importName === '*') {
                    const [specifier] = specifiers;

                    if (restrictedImportNames) {
                        context.report({
                            node,
                            messageId: customMessage
                                ? 'patternAndEverythingWithCustomMessage'
                                : 'patternAndEverything',
                            loc: specifier!.loc,
                            data: {
                                importSource,
                                importNames: restrictedImportNames,
                                customMessage,
                            },
                        });
                    } else {
                        context.report({
                            node,
                            messageId: customMessage
                                ? 'patternAndEverythingWithRegexImportNameAndCustomMessage'
                                : 'patternAndEverythingWithRegexImportName',
                            loc: specifier!.loc,
                            data: {
                                importSource,
                                importNames: restrictedImportNamePattern,
                                customMessage,
                            },
                        });
                    }

                    return;
                }

                if (
                    (restrictedImportNames && restrictedImportNames.includes(importName))
                    || (restrictedImportNamePattern
                        && restrictedImportNamePattern.test(importName))
                ) {
                    specifiers.forEach((specifier) => {
                        context.report({
                            node,
                            messageId: customMessage
                                ? 'patternAndImportNameWithCustomMessage'
                                : 'patternAndImportName',
                            loc: specifier.loc,
                            data: {
                                importSource,
                                customMessage,
                                importName,
                            },
                        });
                    });
                }
            });
        }

        /**
         * Check if the given importSource is restricted by a pattern.
         * @param importSource path of the import
         * @param group contains a Ignore instance for paths, and the customMessage to show if it fails
         * @returns whether the variable is a restricted pattern or not
         */
        function isRestrictedPattern(
            importSource: string,
            group: (typeof restrictedPatternGroups)[number],
        ) {
            return group.matcher.ignores(importSource);
        }

        /**
         * Checks a node to see if any problems should be reported.
         * @param node The node to check.
         */
        function checkNode(node: ImportNode) {
            const importSource = node.source!.value.trim();
            const importNames: ImportNames = new Map();

            if (node.type === 'ExportAllDeclaration') {
                const starToken = sourceCode.getFirstToken(node, 1);

                importNames.set('*', [{ loc: starToken!.loc }]);
            } else if (node.specifiers) {
                (
                    node.specifiers as Node<
                        | 'ImportSpecifier'
                        | 'ImportDefaultSpecifier'
                        | 'ImportNamespaceSpecifier'
                        | 'ExportSpecifier'
                    >[]
                ).forEach((specifier) => {
                    let name;
                    const specifierData = { loc: specifier.loc };

                    if (specifier.type === 'ImportDefaultSpecifier') {
                        name = 'default';
                    } else if (specifier.type === 'ImportNamespaceSpecifier') {
                        name = '*';
                    } else if ('imported' in specifier) {
                        name = astUtils.getModuleExportName(specifier.imported);
                    } else if (specifier.local) {
                        name = astUtils.getModuleExportName(specifier.local);
                    }

                    if (typeof name === 'string') {
                        if (importNames.has(name)) {
                            importNames.get(name)!.push(specifierData);
                        } else {
                            importNames.set(name, [specifierData]);
                        }
                    }
                });
            }

            checkRestrictedPathAndReport(importSource, importNames, node);
            restrictedPatternGroups.forEach((group) => {
                if (isRestrictedPattern(importSource, group)) {
                    reportPathForPatterns(node, group, importNames);
                }
            });
        }

        return {
            ImportDeclaration: checkNode,
            ExportNamedDeclaration(node: Node<'ExportNamedDeclaration'>) {
                if (node.source) {
                    checkNode(node);
                }
            },
            ExportAllDeclaration: checkNode,
        };
    },
};

export default rule;
