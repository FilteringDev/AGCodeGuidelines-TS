import type {
    RuleContext, Token, Fixer, LegacyRule, Node,
} from '../../types';
/**
 * @file enforce consistent line breaks inside jsx curly
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/eslint';
import dependency2 from '../util/report';

type Options =
    | 'consistent'
    | 'never'
    | {
        singleline?: 'consistent' | 'require' | 'forbid';
        multiline?: 'consistent' | 'require' | 'forbid';
    };

const docsUrl = dependency0;
const eslintUtil = dependency1;
const report = dependency2;

const { getSourceCode } = eslintUtil;
const { getText } = eslintUtil;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/**
 * @param context The rule context.
 * @returns The result of this check.
 */
function getNormalizedOption(context: RuleContext<[Options?]>) {
    const rawOption = context.options[0] || 'consistent';

    if (rawOption === 'consistent') {
        return {
            multiline: 'consistent',
            singleline: 'consistent',
        };
    }

    if (rawOption === 'never') {
        return {
            multiline: 'forbid',
            singleline: 'forbid',
        };
    }

    return {
        multiline: rawOption.multiline || 'consistent',
        singleline: rawOption.singleline || 'consistent',
    };
}

const messages = {
    expectedBefore: "Expected newline before '}'.",
    expectedAfter: "Expected newline after '{'.",
    unexpectedBefore: "Unexpected newline before '}'.",
    unexpectedAfter: "Unexpected newline after '{'.",
};

const rule: LegacyRule<[Options?]> = {
    meta: {
        type: 'layout',

        docs: {
            description:
                'Enforce consistent linebreaks in curly braces in JSX attributes and expressions',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-curly-newline'),
        },

        fixable: 'whitespace',

        schema: [
            {
                anyOf: [
                    {
                        enum: ['consistent', 'never'],
                    },
                    {
                        type: 'object',
                        properties: {
                            singleline: { enum: ['consistent', 'require', 'forbid'] },
                            multiline: { enum: ['consistent', 'require', 'forbid'] },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        ],

        messages,
    },

    create(context) {
        const sourceCode = getSourceCode(context);
        const option = getNormalizedOption(context);

        // ----------------------------------------------------------------------
        // Helpers
        // ----------------------------------------------------------------------

        /**
         * Determines whether two adjacent tokens are on the same line.
         * @param left - The left token object.
         * @param right - The right token object.
         * @returns Whether or not the tokens are on the same line.
         */
        function isTokenOnSameLine(left: Token | null, right: Token | null) {
            return left!.loc.end.line === right!.loc.start.line;
        }

        /**
         * Determines whether there should be newlines inside curlys
         * @param expression The expression contained in the curlys
         * @param hasLeftNewline `true` if the left curly has a newline in the current code.
         * @returns `true` if there should be newlines inside the function curlys
         */
        function shouldHaveNewlines(expression: Node, hasLeftNewline: boolean) {
            const isMultiline = expression.loc.start.line !== expression.loc.end.line;

            switch (isMultiline ? option.multiline : option.singleline) {
                case 'forbid':
                    return false;
                case 'require':
                    return true;
                case 'consistent':
                default:
                    return hasLeftNewline;
            }
        }

        /**
         * Validates curlys
         * @param curlys An object with keys `leftParen` for the left paren token, and `rightParen` for the right
         * paren token
         * @param curlys.rightCurly The rightCurly value.
         * @param curlys.leftCurly The leftCurly value.
         * @param expression The expression inside the curly
         */
        function validateCurlys(curlys: { leftCurly: Token; rightCurly: Token }, expression: Node) {
            const { leftCurly } = curlys;
            const { rightCurly } = curlys;
            const tokenAfterLeftCurly = sourceCode.getTokenAfter(leftCurly);
            const tokenBeforeRightCurly = sourceCode.getTokenBefore(rightCurly);
            const hasLeftNewline = !isTokenOnSameLine(leftCurly, tokenAfterLeftCurly);
            const hasRightNewline = !isTokenOnSameLine(tokenBeforeRightCurly, rightCurly);
            const needsNewlines = shouldHaveNewlines(expression, hasLeftNewline);

            if (hasLeftNewline && !needsNewlines) {
                report(context, messages.unexpectedAfter, 'unexpectedAfter', {
                    node: leftCurly,
                    fix(fixer: Fixer) {
                        return getText(context)
                            .slice(leftCurly.range[1], tokenAfterLeftCurly!.range[0])
                            .trim()
                            ? null // If there is a comment between the { and the first element, don't do a fix.
                            : fixer.removeRange([leftCurly.range[1], tokenAfterLeftCurly!.range[0]]);
                    },
                });
            } else if (!hasLeftNewline && needsNewlines) {
                report(context, messages.expectedAfter, 'expectedAfter', {
                    node: leftCurly,
                    fix: (fixer: Fixer) => fixer.insertTextAfter(leftCurly, '\n'),
                });
            }

            if (hasRightNewline && !needsNewlines) {
                report(context, messages.unexpectedBefore, 'unexpectedBefore', {
                    node: rightCurly,
                    fix(fixer: Fixer) {
                        return getText(context)
                            .slice(tokenBeforeRightCurly!.range[1], rightCurly.range[0])
                            .trim()
                            ? null // If there is a comment between the last element and the }, don't do a fix.
                            : fixer.removeRange([tokenBeforeRightCurly!.range[1], rightCurly.range[0]]);
                    },
                });
            } else if (!hasRightNewline && needsNewlines) {
                report(context, messages.expectedBefore, 'expectedBefore', {
                    node: rightCurly,
                    fix: (fixer: Fixer) => fixer.insertTextBefore(rightCurly, '\n'),
                });
            }
        }

        // ----------------------------------------------------------------------
        // Public
        // ----------------------------------------------------------------------

        return {
            JSXExpressionContainer(node: Node<'JSXExpressionContainer'>) {
                const curlyTokens = {
                    leftCurly: sourceCode.getFirstToken(node),
                    rightCurly: sourceCode.getLastToken(node),
                };
                validateCurlys(curlyTokens, node.expression);
            },
        };
    },
};

export default rule;
