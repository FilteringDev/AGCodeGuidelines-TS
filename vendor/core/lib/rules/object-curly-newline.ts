/**
 * @file Rule to require or disallow line breaks inside braces.
 * @author Toru Nagashima
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import type {
    Fixer, LegacyRule, Node, Token,
} from '../../../types';

type OptionValue =
    | 'always'
    | 'never'
    | { multiline?: boolean; minProperties?: number; consistent?: boolean };
type NodeOptions = Partial<
    Record<
        'ObjectExpression' | 'ObjectPattern' | 'ImportDeclaration' | 'ExportDeclaration',
        OptionValue
    >
>;
type Options = OptionValue | NodeOptions;

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

// Schema objects.
const OPTION_VALUE = {
    oneOf: [
        {
            enum: ['always', 'never'],
        },
        {
            type: 'object',
            properties: {
                multiline: {
                    type: 'boolean',
                },
                minProperties: {
                    type: 'integer',
                    minimum: 0,
                },
                consistent: {
                    type: 'boolean',
                },
            },
            additionalProperties: false,
            minProperties: 1,
        },
    ],
};

/**
 * Normalizes a given option value.
 * @param value An option value to parse.
 * @returns Normalized option object.
 */
function normalizeOptionValue(value: OptionValue | undefined) {
    let multiline = false;
    let minProperties = Number.POSITIVE_INFINITY;
    let consistent = false;

    if (value) {
        if (value === 'always') {
            minProperties = 0;
        } else if (value === 'never') {
            minProperties = Number.POSITIVE_INFINITY;
        } else {
            multiline = Boolean(value.multiline);
            minProperties = value.minProperties || Number.POSITIVE_INFINITY;
            consistent = Boolean(value.consistent);
        }
    } else {
        consistent = true;
    }

    return { multiline, minProperties, consistent };
}

/**
 * Checks if a value is an object.
 * @param value The value to check
 * @returns `true` if the value is an object, otherwise `false`
 */
function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/**
 * Checks if an option is a node-specific option
 * @param option The option to check
 * @returns `true` if the option is node-specific, otherwise `false`
 */
function isNodeSpecificOption(option: unknown) {
    return isObject(option) || typeof option === 'string';
}

/**
 * Normalizes a given option value.
 * @param options An option value to parse.
 * @returns Normalized option object.
 */
function normalizeOptions(options: Options | undefined) {
    if (isObject(options) && Object.values(options).some(isNodeSpecificOption)) {
        // The schema and the value-kind check identify the per-node option form.
        const nodeOptions = options as NodeOptions;
        return {
            ObjectExpression: normalizeOptionValue(nodeOptions.ObjectExpression),
            ObjectPattern: normalizeOptionValue(nodeOptions.ObjectPattern),
            ImportDeclaration: normalizeOptionValue(nodeOptions.ImportDeclaration),
            ExportNamedDeclaration: normalizeOptionValue(nodeOptions.ExportDeclaration),
        };
    }

    // The remaining schema form configures every node.
    const value = normalizeOptionValue(options as OptionValue | undefined);

    return {
        ObjectExpression: value,
        ObjectPattern: value,
        ImportDeclaration: value,
        ExportNamedDeclaration: value,
    };
}

/**
 * Determines if ObjectExpression, ObjectPattern, ImportDeclaration or ExportNamedDeclaration
 * node needs to be checked for missing line breaks
 * @param node Node under inspection
 * @param options option specific to node type
 * @param options.multiline The multiline value.
 * @param options.minProperties The min properties value.
 * @param options.consistent The consistent value.
 * @param first First object property
 * @param last Last object property
 * @returns `true` if node needs to be checked for missing line breaks
 */
function areLineBreaksRequired(
    node: Node<
        'ExportNamedDeclaration' | 'ImportDeclaration' | 'ObjectExpression' | 'ObjectPattern'
    >,
    options: { multiline: boolean; minProperties: number; consistent: boolean },
    first: Token,
    last: Token,
) {
    let objectProperties;

    if (node.type === 'ObjectExpression' || node.type === 'ObjectPattern') {
        objectProperties = node.properties;
    } else {
        // is ImportDeclaration or ExportNamedDeclaration
        objectProperties = node.specifiers.filter(
            (s) => s.type === 'ImportSpecifier' || s.type === 'ExportSpecifier',
        );
    }

    return (
        objectProperties.length >= options.minProperties
        || (options.multiline
            && objectProperties.length > 0
            && first.loc.start.line !== last.loc.end.line)
    );
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        (
            | 'always'
            | 'never'
            | { multiline?: boolean; minProperties?: number; consistent?: boolean }
            | {
                ObjectExpression?:
                      | 'always'
                      | 'never'
                      | { multiline?: boolean; minProperties?: number; consistent?: boolean };
                ObjectPattern?:
                      | 'always'
                      | 'never'
                      | { multiline?: boolean; minProperties?: number; consistent?: boolean };
                ImportDeclaration?:
                      | 'always'
                      | 'never'
                      | { multiline?: boolean; minProperties?: number; consistent?: boolean };
                ExportDeclaration?:
                      | 'always'
                      | 'never'
                      | { multiline?: boolean; minProperties?: number; consistent?: boolean };
            }
        )?,
    ]
> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description:
                'Enforce consistent line breaks after opening and before closing braces',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/object-curly-newline',
        },

        fixable: 'whitespace',

        schema: [
            {
                oneOf: [
                    OPTION_VALUE,
                    {
                        type: 'object',
                        properties: {
                            ObjectExpression: OPTION_VALUE,
                            ObjectPattern: OPTION_VALUE,
                            ImportDeclaration: OPTION_VALUE,
                            ExportDeclaration: OPTION_VALUE,
                        },
                        additionalProperties: false,
                        minProperties: 1,
                    },
                ],
            },
        ],

        messages: {
            unexpectedLinebreakBeforeClosingBrace:
                'Unexpected line break before this closing brace.',
            unexpectedLinebreakAfterOpeningBrace:
                'Unexpected line break after this opening brace.',
            expectedLinebreakBeforeClosingBrace:
                'Expected a line break before this closing brace.',
            expectedLinebreakAfterOpeningBrace:
                'Expected a line break after this opening brace.',
        },
    },

    create(context) {
        const { sourceCode } = context;
        const normalizedOptions = normalizeOptions(context.options[0]);

        /**
         * Reports a given node if it violated this rule.
         * @param node A node to check. This is an ObjectExpression, ObjectPattern, ImportDeclaration or
         * ExportNamedDeclaration node.
         */
        function check(
            node: Node<
                | 'ExportNamedDeclaration'
                | 'ImportDeclaration'
                | 'ObjectExpression'
                | 'ObjectPattern'
            >,
        ) {
            const options = normalizedOptions[node.type];

            if (
                (node.type === 'ImportDeclaration'
                    && !node.specifiers.some(
                        (specifier) => specifier.type === 'ImportSpecifier',
                    ))
                || (node.type === 'ExportNamedDeclaration'
                    && !node.specifiers.some((specifier) => specifier.type === 'ExportSpecifier'))
            ) {
                return;
            }

            const openBrace = sourceCode.getFirstToken(
                node,
                (token: Token) => token.value === '{',
            );

            let closeBrace;

            if (node.typeAnnotation) {
                closeBrace = sourceCode.getTokenBefore(node.typeAnnotation);
            } else {
                closeBrace = sourceCode.getLastToken(
                    node,
                    (token: Token) => token.value === '}',
                );
            }

            let first = sourceCode.getTokenAfter(openBrace!, { includeComments: true });
            let last = sourceCode.getTokenBefore(closeBrace!, { includeComments: true });

            const needsLineBreaks = areLineBreaksRequired(node, options, first!, last!);

            const hasCommentsFirstToken = astUtils.isCommentToken(first!);
            const hasCommentsLastToken = astUtils.isCommentToken(last!);

            /**
             * Use tokens or comments to check multiline or not.
             * But use only tokens to check whether line breaks are needed.
             * This allows:
             *     var obj = { // eslint-disable-line foo
             *         a: 1
             *     }
             */
            first = sourceCode.getTokenAfter(openBrace!);
            last = sourceCode.getTokenBefore(closeBrace!);

            if (needsLineBreaks) {
                if (astUtils.isTokenOnSameLine(openBrace!, first!)) {
                    context.report({
                        messageId: 'expectedLinebreakAfterOpeningBrace',
                        node,
                        loc: openBrace!.loc,
                        fix(fixer: Fixer) {
                            if (hasCommentsFirstToken) {
                                return null;
                            }

                            return fixer.insertTextAfter(openBrace!, '\n');
                        },
                    });
                }
                if (astUtils.isTokenOnSameLine(last!, closeBrace!)) {
                    context.report({
                        messageId: 'expectedLinebreakBeforeClosingBrace',
                        node,
                        loc: closeBrace!.loc,
                        fix(fixer: Fixer) {
                            if (hasCommentsLastToken) {
                                return null;
                            }

                            return fixer.insertTextBefore(closeBrace!, '\n');
                        },
                    });
                }
            } else {
                const { consistent } = options;
                const hasLineBreakBetweenOpenBraceAndFirst = !astUtils.isTokenOnSameLine(
                    openBrace!,
                    first!,
                );
                const hasLineBreakBetweenCloseBraceAndLast = !astUtils.isTokenOnSameLine(
                    last!,
                    closeBrace!,
                );

                if (
                    (!consistent && hasLineBreakBetweenOpenBraceAndFirst)
                    || (consistent
                        && hasLineBreakBetweenOpenBraceAndFirst
                        && !hasLineBreakBetweenCloseBraceAndLast)
                ) {
                    context.report({
                        messageId: 'unexpectedLinebreakAfterOpeningBrace',
                        node,
                        loc: openBrace!.loc,
                        fix(fixer: Fixer) {
                            if (hasCommentsFirstToken) {
                                return null;
                            }

                            return fixer.removeRange([openBrace!.range[1], first!.range[0]]);
                        },
                    });
                }
                if (
                    (!consistent && hasLineBreakBetweenCloseBraceAndLast)
                    || (consistent
                        && !hasLineBreakBetweenOpenBraceAndFirst
                        && hasLineBreakBetweenCloseBraceAndLast)
                ) {
                    context.report({
                        messageId: 'unexpectedLinebreakBeforeClosingBrace',
                        node,
                        loc: closeBrace!.loc,
                        fix(fixer: Fixer) {
                            if (hasCommentsLastToken) {
                                return null;
                            }

                            return fixer.removeRange([last!.range[1], closeBrace!.range[0]]);
                        },
                    });
                }
            }
        }

        return {
            ObjectExpression: check,
            ObjectPattern: check,
            ImportDeclaration: check,
            ExportNamedDeclaration: check,
        };
    },
};

export default rule;
