/**
 * @file A rule to disallow the type conversions with shorter notations.
 * @author Toru Nagashima
 */
import dependency0 from './utils/ast-utils';
import type {
    Fixer, LegacyRule, Node, SourceCode,
} from '../../../types';

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const INDEX_OF_PATTERN = /^(?:i|lastI)ndexOf$/u;
const ALLOWABLE_OPERATORS = ['~', '!!', '+', '*'];

/**
 * Parses and normalizes an option object.
 * @param options An option object to parse.
 * @param options.boolean The boolean value.
 * @param options.number The number value.
 * @param options.string The string value.
 * @param options.disallowTemplateShorthand The disallow template shorthand value.
 * @param options.allow The allow value.
 * @returns The parsed and normalized option object.
 */
function parseOptions(options: {
    boolean?: boolean;
    number?: boolean;
    string?: boolean;
    disallowTemplateShorthand?: boolean;
    allow?: ('~' | '!!' | '+' | '*')[];
}) {
    return {
        boolean: 'boolean' in options ? options.boolean : true,
        number: 'number' in options ? options.number : true,
        string: 'string' in options ? options.string : true,
        disallowTemplateShorthand:
            'disallowTemplateShorthand' in options ? options.disallowTemplateShorthand : false,
        allow: options.allow || [],
    };
}

/**
 * Checks whether or not a node is a double logical negating.
 * @param node An UnaryExpression node to check.
 * @returns Whether or not the node is a double logical negating.
 */
function isDoubleLogicalNegating(node: Node<'UnaryExpression'>) {
    return (
        node.operator === '!'
        && node.argument.type === 'UnaryExpression'
        && node.argument.operator === '!'
    );
}

/**
 * Checks whether or not a node is a binary negating of `.indexOf()` method calling.
 * @param node An UnaryExpression node to check.
 * @returns Whether or not the node is a binary negating of `.indexOf()` method calling.
 */
function isBinaryNegatingOfIndexOf(node: Node<'UnaryExpression'>) {
    if (node.operator !== '~') {
        return false;
    }
    const callNode = astUtils.skipChainExpression(node.argument);

    return (
        callNode.type === 'CallExpression'
        && astUtils.isSpecificMemberAccess(callNode.callee, null, INDEX_OF_PATTERN)
    );
}

/**
 * Checks whether or not a node is a multiplying by one.
 * @param node A BinaryExpression node to check.
 * @returns Whether or not the node is a multiplying by one.
 */
function isMultiplyByOne(node: Node<'BinaryExpression'>) {
    return (
        node.operator === '*'
        && ((node.left.type === 'Literal' && node.left.value === 1)
            || (node.right.type === 'Literal' && node.right.value === 1))
    );
}

/**
 * Checks whether the given node logically represents multiplication by a fraction of `1`.
 * For example, `a * 1` in `a * 1 / b` is technically multiplication by `1`, but the
 * whole expression can be logically interpreted as `a * (1 / b)` rather than `(a * 1) / b`.
 * @param node A BinaryExpression node to check.
 * @param sourceCode The source code object.
 * @returns Whether or not the node is a multiplying by a fraction of `1`.
 */
function isMultiplyByFractionOfOne(node: Node<'BinaryExpression'>, sourceCode: SourceCode) {
    return (
        node.type === 'BinaryExpression'
        && node.operator === '*'
        && node.right.type === 'Literal'
        && node.right.value === 1
        && node.parent.type === 'BinaryExpression'
        && node.parent.operator === '/'
        && node.parent.left === node
        && !astUtils.isParenthesised(sourceCode, node)
    );
}

/**
 * Checks whether the result of a node is numeric or not
 * @param node The node to test
 * @returns true if the node is a number literal or a `Number()`, `parseInt` or `parseFloat` call
 */
function isNumeric(node: Node) {
    return (
        (node.type === 'Literal' && typeof node.value === 'number')
        || (node.type === 'CallExpression'
            && (node.callee.name === 'Number'
                || node.callee.name === 'parseInt'
                || node.callee.name === 'parseFloat'))
    );
}

/**
 * Returns the first non-numeric operand in a BinaryExpression. Designed to be
 * used from bottom to up since it walks up the BinaryExpression trees using
 * node.parent to find the result.
 * @param node The BinaryExpression node to be walked up on
 * @returns The first non-numeric item in the BinaryExpression tree or null
 */
function getNonNumericOperand(node: Node<'BinaryExpression'>) {
    const { left } = node;
    const { right } = node;

    if (right.type !== 'BinaryExpression' && !isNumeric(right)) {
        return right;
    }

    if (left.type !== 'BinaryExpression' && !isNumeric(left)) {
        return left;
    }

    return null;
}

/**
 * Checks whether an expression evaluates to a string.
 * @param node node that represents the expression to check.
 * @returns Whether or not the expression evaluates to a string.
 */
function isStringType(node: Node) {
    return (
        astUtils.isStringLiteral(node)
        || (node.type === 'CallExpression'
            && node.callee.type === 'Identifier'
            && node.callee.name === 'String')
    );
}

/**
 * Checks whether a node is an empty string literal or not.
 * @param node The node to check.
 * @returns Whether or not the passed in node is an
 * empty string literal or not.
 */
function isEmptyString(node: Node) {
    return (
        astUtils.isStringLiteral(node)
        && (node.value === ''
            || (node.type === 'TemplateLiteral'
                && node.quasis.length === 1
                && node!.quasis[0]!.value.cooked === ''))
    );
}

/**
 * Checks whether or not a node is a concatenating with an empty string.
 * @param node A BinaryExpression node to check.
 * @returns Whether or not the node is a concatenating with an empty string.
 */
function isConcatWithEmptyString(node: Node<'BinaryExpression'>) {
    return (
        node.operator === '+'
        && ((isEmptyString(node.left) && !isStringType(node.right))
            || (isEmptyString(node.right) && !isStringType(node.left)))
    );
}

/**
 * Checks whether or not a node is appended with an empty string.
 * @param node An AssignmentExpression node to check.
 * @returns Whether or not the node is appended with an empty string.
 */
function isAppendEmptyString(node: Node<'AssignmentExpression'>) {
    return node.operator === '+=' && isEmptyString(node.right);
}

/**
 * Returns the operand that is not an empty string from a flagged BinaryExpression.
 * @param node The flagged BinaryExpression node to check.
 * @returns The operand that is not an empty string from a flagged BinaryExpression.
 */
function getNonEmptyOperand(node: Node<'AssignmentExpression' | 'BinaryExpression'>) {
    return isEmptyString(node.left) ? node.right : node.left;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        {
            boolean?: boolean;
            number?: boolean;
            string?: boolean;
            disallowTemplateShorthand?: boolean;
            allow?: ('~' | '!!' | '+' | '*')[];
        }?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow shorthand type conversions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-implicit-coercion',
        },

        fixable: 'code',

        schema: [
            {
                type: 'object',
                properties: {
                    boolean: {
                        type: 'boolean',
                        default: true,
                    },
                    number: {
                        type: 'boolean',
                        default: true,
                    },
                    string: {
                        type: 'boolean',
                        default: true,
                    },
                    disallowTemplateShorthand: {
                        type: 'boolean',
                        default: false,
                    },
                    allow: {
                        type: 'array',
                        items: {
                            enum: ALLOWABLE_OPERATORS,
                        },
                        uniqueItems: true,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            useRecommendation: 'use `{{recommendation}}` instead.',
        },
    },

    create(context) {
        const options = parseOptions(context.options[0] || {});
        const { sourceCode } = context;

        /**
         * Reports an error and autofixes the node
         * @param node An ast node to report the error on.
         * @param recommendation The recommended code for the issue
         * @param shouldFix Whether this report should fix the node
         */
        function report(
            node: Node<
                | 'AssignmentExpression'
                | 'BinaryExpression'
                | 'TemplateLiteral'
                | 'UnaryExpression'
            >,
            recommendation: string,
            shouldFix: boolean,
        ) {
            context.report({
                node,
                messageId: 'useRecommendation',
                data: {
                    recommendation,
                },
                fix(fixer: Fixer) {
                    if (!shouldFix) {
                        return null;
                    }

                    const tokenBefore = sourceCode.getTokenBefore(node);

                    if (
                        tokenBefore
                        && tokenBefore.range[1] === node.range[0]
                        && !astUtils.canTokensBeAdjacent(tokenBefore, recommendation)
                    ) {
                        return fixer.replaceText(node, ` ${recommendation}`);
                    }
                    return fixer.replaceText(node, recommendation);
                },
            });
        }

        return {
            UnaryExpression(node: Node<'UnaryExpression'>) {
                let operatorAllowed;

                // !!foo
                operatorAllowed = options.allow.includes('!!');
                if (!operatorAllowed && options.boolean && isDoubleLogicalNegating(node)) {
                    const recommendation = `Boolean(${sourceCode.getText((node.argument as Node<'UnaryExpression'>).argument)})`;

                    report(node, recommendation, true);
                }

                // ~foo.indexOf(bar)
                operatorAllowed = options.allow.includes('~');
                if (!operatorAllowed && options.boolean && isBinaryNegatingOfIndexOf(node)) {
                    // `foo?.indexOf(bar) !== -1` will be true (== found) if the `foo` is nullish. So use `>= 0` in
                    // that case.
                    const comparison = node.argument.type === 'ChainExpression' ? '>= 0' : '!== -1';
                    const recommendation = `${sourceCode.getText(node.argument)} ${comparison}`;

                    report(node, recommendation, false);
                }

                // +foo
                operatorAllowed = options.allow.includes('+');
                if (
                    !operatorAllowed
                    && options.number
                    && node.operator === '+'
                    && !isNumeric(node.argument)
                ) {
                    const recommendation = `Number(${sourceCode.getText(node.argument)})`;

                    report(node, recommendation, true);
                }
            },

            // Use `:exit` to prevent double reporting
            'BinaryExpression:exit': function onBinaryExpressionExit(
                node: Node<'BinaryExpression'>,
            ) {
                let operatorAllowed;

                // 1 * foo
                operatorAllowed = options.allow.includes('*');
                const nonNumericOperand = !operatorAllowed
                    && options.number
                    && isMultiplyByOne(node)
                    && !isMultiplyByFractionOfOne(node, sourceCode)
                    && getNonNumericOperand(node);

                if (nonNumericOperand) {
                    const recommendation = `Number(${sourceCode.getText(nonNumericOperand)})`;

                    report(node, recommendation, true);
                }

                // "" + foo
                operatorAllowed = options.allow.includes('+');
                if (!operatorAllowed && options.string && isConcatWithEmptyString(node)) {
                    const recommendation = `String(${sourceCode.getText(getNonEmptyOperand(node))})`;

                    report(node, recommendation, true);
                }
            },

            AssignmentExpression(node: Node<'AssignmentExpression'>) {
                // foo += ""
                const operatorAllowed = options.allow.includes('+');

                if (!operatorAllowed && options.string && isAppendEmptyString(node)) {
                    const code = sourceCode.getText(getNonEmptyOperand(node));
                    const recommendation = `${code} = String(${code})`;

                    report(node, recommendation, true);
                }
            },

            TemplateLiteral(node: Node<'TemplateLiteral'>) {
                if (!options.disallowTemplateShorthand) {
                    return;
                }

                // tag`${foo}`
                if (node.parent.type === 'TaggedTemplateExpression') {
                    return;
                }

                // `` or `${foo}${bar}`
                if (node.expressions.length !== 1) {
                    return;
                }

                //  `prefix${foo}`
                if (node!.quasis[0]!.value.cooked !== '') {
                    return;
                }

                //  `${foo}postfix`
                if (node!.quasis[1]!.value.cooked !== '') {
                    return;
                }

                // if the expression is already a string, then this isn't a coercion
                if (isStringType(node.expressions[0]!)) {
                    return;
                }

                const code = sourceCode.getText(node.expressions[0]);
                const recommendation = `String(${code})`;

                report(node, recommendation, true);
            },
        };
    },
};

export default rule;
