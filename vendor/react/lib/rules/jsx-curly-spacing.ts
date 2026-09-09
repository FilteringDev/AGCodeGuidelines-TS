import type {
    Fixer, LegacyRule, Node, Token,
} from '../../types';
/**
 * @file Enforce or disallow spaces inside of curly braces in JSX attributes.
 * @author Jamund Ferguson
 * @author Brandyn Bennett
 * @author Michael Ficarra
 * @author Vignesh Anand
 * @author Jamund Ferguson
 * @author Yannick Croissant
 * @author Erik Wendel
 */
import dependency0 from '../../compat/hasown';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/eslint';
import dependency3 from '../util/report';

const has = dependency0;
const docsUrl = dependency1;
const { getSourceCode } = dependency2;
const report = dependency3;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

interface SpacingConfig {
    when?: string;
    allowMultiline?: boolean;
    spacing?: { objectLiterals?: string };
    attributes?: SpacingConfig | boolean;
    children?: SpacingConfig | boolean;
}
interface NormalizedConfig {
    when: string;
    allowMultiline?: boolean;
    objectLiteralSpaces?: string;
}
const SPACING = {
    always: 'always',
    never: 'never',
};
const SPACING_VALUES = [SPACING.always, SPACING.never];

const messages = {
    noNewlineAfter: "There should be no newline after '{{token}}'",
    noNewlineBefore: "There should be no newline before '{{token}}'",
    noSpaceAfter: "There should be no space after '{{token}}'",
    noSpaceBefore: "There should be no space before '{{token}}'",
    spaceNeededAfter: "A space is required after '{{token}}'",
    spaceNeededBefore: "A space is required before '{{token}}'",
};

const rule: LegacyRule<
    [
        (
            | ({
                when?: 'always' | 'never';
                allowMultiline?: boolean;
                spacing?: { objectLiterals?: 'always' | 'never'; [key: string]: unknown };
                [key: string]: unknown;
            } & {
                attributes?:
                      | {
                          when?: 'always' | 'never';
                          allowMultiline?: boolean;
                          spacing?: { objectLiterals?: 'always' | 'never'; [key: string]: unknown };
                          [key: string]: unknown;
                      }
                      | boolean;
                children?:
                      | {
                          when?: 'always' | 'never';
                          allowMultiline?: boolean;
                          spacing?: { objectLiterals?: 'always' | 'never'; [key: string]: unknown };
                          [key: string]: unknown;
                      }
                      | boolean;
                [key: string]: unknown;
            })
            | 'always'
            | 'never'
        )?,
        {
            allowMultiline?: boolean;
            spacing?: { objectLiterals?: 'always' | 'never'; [key: string]: unknown };
        }?,
    ]
> = {
    meta: {
        docs: {
            description:
                'Enforce or disallow spaces inside of curly braces in JSX attributes and expressions',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-curly-spacing'),
        },
        fixable: 'code',

        messages,

        schema: {
            definitions: {
                basicConfig: {
                    type: 'object',
                    properties: {
                        when: {
                            enum: SPACING_VALUES,
                        },
                        allowMultiline: {
                            type: 'boolean',
                        },
                        spacing: {
                            type: 'object',
                            properties: {
                                objectLiterals: {
                                    enum: SPACING_VALUES,
                                },
                            },
                        },
                    },
                },
                basicConfigOrBoolean: {
                    anyOf: [
                        {
                            $ref: '#/definitions/basicConfig',
                        },
                        {
                            type: 'boolean',
                        },
                    ],
                },
            },
            type: 'array',
            items: [
                {
                    anyOf: [
                        {
                            allOf: [
                                {
                                    $ref: '#/definitions/basicConfig',
                                },
                                {
                                    type: 'object',
                                    properties: {
                                        attributes: {
                                            $ref: '#/definitions/basicConfigOrBoolean',
                                        },
                                        children: {
                                            $ref: '#/definitions/basicConfigOrBoolean',
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            enum: SPACING_VALUES,
                        },
                    ],
                },
                {
                    type: 'object',
                    properties: {
                        allowMultiline: {
                            type: 'boolean',
                        },
                        spacing: {
                            type: 'object',
                            properties: {
                                objectLiterals: {
                                    enum: SPACING_VALUES,
                                },
                            },
                        },
                    },
                    additionalProperties: false,
                },
            ],
        },
    },

    create(context) {
        /**
         * @returns The result of this check.
         * @param configOrTrue The config or true value.
         * @param defaults The defaults value.
         * @param [lastPass] The last pass value.
         */
        function normalizeConfig(
            configOrTrue: SpacingConfig | true,
            defaults: NormalizedConfig,
            lastPass?: boolean,
        ) {
            const config = configOrTrue === true ? {} : configOrTrue;
            const when = config.when || defaults.when;
            const allowMultiline = has(config, 'allowMultiline')
                ? config.allowMultiline
                : defaults.allowMultiline;
            const spacing = config.spacing || {};
            let objectLiteralSpaces = spacing.objectLiterals || defaults.objectLiteralSpaces;
            if (lastPass) {
                // On the final pass assign the values that should be derived from others if they are still undefined
                objectLiteralSpaces = objectLiteralSpaces || when;
            }

            return {
                when,
                allowMultiline,
                objectLiteralSpaces,
            };
        }

        const DEFAULT_WHEN = SPACING.never;
        const DEFAULT_ALLOW_MULTILINE = true;
        const DEFAULT_ATTRIBUTES = true;
        const DEFAULT_CHILDREN = false;

        let originalConfig = context.options[0] || {};
        if (SPACING_VALUES.indexOf(originalConfig as string) !== -1) {
            originalConfig = { when: context.options[0] as 'always' | 'never', ...context.options[1] };
        }
        const configObject = originalConfig as SpacingConfig;
        const defaultConfig = normalizeConfig(configObject, {
            when: DEFAULT_WHEN,
            allowMultiline: DEFAULT_ALLOW_MULTILINE,
        });
        const attributes = has(configObject, 'attributes')
            ? configObject.attributes
            : DEFAULT_ATTRIBUTES;
        const attributesConfig = attributes ? normalizeConfig(attributes, defaultConfig, true) : null;
        const children = has(configObject, 'children') ? configObject.children : DEFAULT_CHILDREN;
        const childrenConfig = children ? normalizeConfig(children, defaultConfig, true) : null;

        // --------------------------------------------------------------------------
        // Helpers
        // --------------------------------------------------------------------------

        /**
         * Determines whether two adjacent tokens have a newline between them.
         * @param left - The left token object.
         * @param right - The right token object.
         * @returns Whether or not there is a newline between the tokens.
         */
        function isMultiline(left: Token | null, right: Token | null) {
            return left!.loc.end.line !== right!.loc.start.line;
        }

        /**
         * Trims text of whitespace between two ranges
         * @param fixer - the eslint fixer object
         * @param fromLoc - the start location
         * @param toLoc - the end location
         * @param mode - either 'start' or 'end'
         * @param spacing - a spacing value that will optionally add a space to the removed text
         * @returns The result of this check.
         */
        function fixByTrimmingWhitespace(
            fixer: Fixer,
            fromLoc: number,
            toLoc: number,
            mode: string,
            spacing?: string,
        ) {
            let replacementText = getSourceCode(context).text.slice(fromLoc, toLoc);
            if (mode === 'start') {
                replacementText = replacementText.replace(/^\s+/gm, '');
            } else {
                replacementText = replacementText.replace(/\s+$/gm, '');
            }
            if (spacing === SPACING.always) {
                if (mode === 'start') {
                    replacementText += ' ';
                } else {
                    replacementText = ` ${replacementText}`;
                }
            }
            return fixer.replaceTextRange([fromLoc, toLoc], replacementText);
        }

        /**
         * Reports that there shouldn't be a newline after the first token
         * @param node - The node to report in the event of an error.
         * @param token - The token to use for the report.
         * @param spacing The value to inspect.
         */
        function reportNoBeginningNewline(node: Node, token: Token, spacing: string) {
            report(context, messages.noNewlineAfter, 'noNewlineAfter', {
                node,
                loc: token.loc.start,
                data: {
                    token: token.value,
                },
                fix(fixer: Fixer) {
                    const nextToken = getSourceCode(context).getTokenAfter(token);
                    return fixByTrimmingWhitespace(
                        fixer,
                        token.range[1],
                        nextToken!.range[0],
                        'start',
                        spacing,
                    );
                },
            });
        }

        /**
         * Reports that there shouldn't be a newline before the last token
         * @param node - The node to report in the event of an error.
         * @param token - The token to use for the report.
         * @param spacing The value to inspect.
         */
        function reportNoEndingNewline(node: Node, token: Token, spacing: string) {
            report(context, messages.noNewlineBefore, 'noNewlineBefore', {
                node,
                loc: token.loc.start,
                data: {
                    token: token.value,
                },
                fix(fixer: Fixer) {
                    const previousToken = getSourceCode(context).getTokenBefore(token);
                    return fixByTrimmingWhitespace(
                        fixer,
                        previousToken!.range[1],
                        token.range[0],
                        'end',
                        spacing,
                    );
                },
            });
        }

        /**
         * Reports that there shouldn't be a space after the first token
         * @param node - The node to report in the event of an error.
         * @param token - The token to use for the report.
         */
        function reportNoBeginningSpace(node: Node, token: Token) {
            report(context, messages.noSpaceAfter, 'noSpaceAfter', {
                node,
                loc: token.loc.start,
                data: {
                    token: token.value,
                },
                fix(fixer: Fixer) {
                    const sourceCode = getSourceCode(context);
                    const nextToken = sourceCode.getTokenAfter(token);
                    let nextComment;

                    // eslint >=4.x
                    if (sourceCode.getCommentsAfter) {
                        nextComment = sourceCode.getCommentsAfter(token);
                        // eslint 3.x
                    } else {
                        const potentialComment = sourceCode.getTokenAfter(token, {
                            includeComments: true,
                        });
                        nextComment = nextToken === potentialComment ? [] : [potentialComment];
                    }

                    // Take comments into consideration to narrow the fix range to what is actually affected. (See
                    // #1414)
                    if (nextComment.length > 0) {
                        return fixByTrimmingWhitespace(
                            fixer,
                            token.range[1],
                            Math.min(nextToken!.range[0], nextComment[0]!.range[0]),
                            'start',
                        );
                    }

                    return fixByTrimmingWhitespace(fixer, token.range[1], nextToken!.range[0], 'start');
                },
            });
        }

        /**
         * Reports that there shouldn't be a space before the last token
         * @param node - The node to report in the event of an error.
         * @param token - The token to use for the report.
         */
        function reportNoEndingSpace(node: Node, token: Token) {
            report(context, messages.noSpaceBefore, 'noSpaceBefore', {
                node,
                loc: token.loc.start,
                data: {
                    token: token.value,
                },
                fix(fixer: Fixer) {
                    const sourceCode = getSourceCode(context);
                    const previousToken = sourceCode.getTokenBefore(token);
                    let previousComment;

                    // eslint >=4.x
                    if (sourceCode.getCommentsBefore) {
                        previousComment = sourceCode.getCommentsBefore(token);
                        // eslint 3.x
                    } else {
                        const potentialComment = sourceCode.getTokenBefore(token, {
                            includeComments: true,
                        });
                        previousComment = previousToken === potentialComment ? [] : [potentialComment];
                    }

                    // Take comments into consideration to narrow the fix range to what is actually affected. (See
                    // #1414)
                    if (previousComment.length > 0) {
                        return fixByTrimmingWhitespace(
                            fixer,
                            Math.max(previousToken!.range[1], previousComment[0]!.range[1]),
                            token.range[0],
                            'end',
                        );
                    }

                    return fixByTrimmingWhitespace(
                        fixer,
                        previousToken!.range[1],
                        token.range[0],
                        'end',
                    );
                },
            });
        }

        /**
         * Reports that there should be a space after the first token
         * @param node - The node to report in the event of an error.
         * @param token - The token to use for the report.
         */
        function reportRequiredBeginningSpace(node: Node, token: Token) {
            report(context, messages.spaceNeededAfter, 'spaceNeededAfter', {
                node,
                loc: token.loc.start,
                data: {
                    token: token.value,
                },
                fix(fixer: Fixer) {
                    return fixer.insertTextAfter(token, ' ');
                },
            });
        }

        /**
         * Reports that there should be a space before the last token
         * @param node - The node to report in the event of an error.
         * @param token - The token to use for the report.
         */
        function reportRequiredEndingSpace(node: Node, token: Token) {
            report(context, messages.spaceNeededBefore, 'spaceNeededBefore', {
                node,
                loc: token.loc.start,
                data: {
                    token: token.value,
                },
                fix(fixer: Fixer) {
                    return fixer.insertTextBefore(token, ' ');
                },
            });
        }

        /**
         * Determines if spacing in curly braces is valid.
         * @param node The AST node to check.
         */
        function validateBraceSpacing(node: Node) {
            let config;
            switch (node.parent.type) {
                case 'JSXAttribute':
                case 'JSXOpeningElement':
                    config = attributesConfig;
                    break;

                case 'JSXElement':
                case 'JSXFragment':
                    config = childrenConfig;
                    break;

                default:
                    return;
            }
            if (config === null) {
                return;
            }

            const sourceCode = getSourceCode(context);
            const first = sourceCode.getFirstToken(node);
            const last = sourceCode.getLastToken(node);
            let second = sourceCode.getTokenAfter(first!, { includeComments: true });
            let penultimate = sourceCode.getTokenBefore(last!, { includeComments: true });

            if (!second) {
                second = sourceCode.getTokenAfter(first!);
                const { leadingComments } = sourceCode.getNodeByRangeIndex(second!.range[0])!;
                second = leadingComments ? leadingComments[0]! : second;
            }
            if (!penultimate) {
                penultimate = sourceCode.getTokenBefore(last!);
                const { trailingComments } = sourceCode.getNodeByRangeIndex(penultimate!.range[0])!;
                penultimate = trailingComments
                    ? trailingComments[trailingComments.length - 1]!
                    : penultimate;
            }

            const isObjectLiteral = first!.value === second!.value;
            const spacing = isObjectLiteral ? config.objectLiteralSpaces : config.when;
            if (spacing === SPACING.always) {
                if (!sourceCode.isSpaceBetweenTokens(first!, second!)) {
                    reportRequiredBeginningSpace(node, first!);
                } else if (!config.allowMultiline && isMultiline(first, second)) {
                    reportNoBeginningNewline(node, first!, spacing);
                }
                if (!sourceCode.isSpaceBetweenTokens(penultimate!, last!)) {
                    reportRequiredEndingSpace(node, last!);
                } else if (!config.allowMultiline && isMultiline(penultimate, last)) {
                    reportNoEndingNewline(node, last!, spacing);
                }
            } else if (spacing === SPACING.never) {
                if (isMultiline(first, second)) {
                    if (!config.allowMultiline) {
                        reportNoBeginningNewline(node, first!, spacing);
                    }
                } else if (sourceCode.isSpaceBetweenTokens(first!, second!)) {
                    reportNoBeginningSpace(node, first!);
                }
                if (isMultiline(penultimate, last)) {
                    if (!config.allowMultiline) {
                        reportNoEndingNewline(node, last!, spacing);
                    }
                } else if (sourceCode.isSpaceBetweenTokens(penultimate!, last!)) {
                    reportNoEndingSpace(node, last!);
                }
            }
        }

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        return {
            JSXExpressionContainer: validateBraceSpacing,
            JSXSpreadAttribute: validateBraceSpacing,
        };
    },
};

export default rule;
