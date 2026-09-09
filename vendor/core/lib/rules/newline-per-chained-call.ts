/**
 * @file Rule to ensure newline per method call when chaining calls
 * @author Rajendra Patil
 * @author Burak Yigit Kaya
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import type { Fixer, LegacyRule, Node } from '../../../types';

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ ignoreChainWithDepth?: number }?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Require a newline after each call in a method chain',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/newline-per-chained-call',
        },

        fixable: 'whitespace',

        schema: [
            {
                type: 'object',
                properties: {
                    ignoreChainWithDepth: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 10,
                        default: 2,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            expected: 'Expected line break before `{{callee}}`.',
        },
    },

    create(context) {
        const options = context.options[0] || {};
        const ignoreChainWithDepth = options.ignoreChainWithDepth || 2;

        const { sourceCode } = context;

        /**
         * Get the prefix of a given MemberExpression node.
         * If the MemberExpression node is a computed value it returns a
         * left bracket. If not it returns a period.
         * @param node A MemberExpression node to get
         * @returns The prefix of the node.
         */
        function getPrefix(node: Node<'MemberExpression'>) {
            if (node.computed) {
                if (node.optional) {
                    return '?.[';
                }
                return '[';
            }
            if (node.optional) {
                return '?.';
            }
            return '.';
        }

        /**
         * Gets the property text of a given MemberExpression node.
         * If the text is multiline, this returns only the first line.
         * @param node A MemberExpression node to get.
         * @returns The property text of the node.
         */
        function getPropertyText(node: Node<'MemberExpression'>) {
            const prefix = getPrefix(node);
            const lines = sourceCode.getText(node.property).split(astUtils.LINEBREAK_MATCHER);
            const suffix = node.computed && lines.length === 1 ? ']' : '';

            return prefix + lines[0] + suffix;
        }

        return {
            'CallExpression:exit': function onCallExpressionExit(node: Node<'CallExpression'>) {
                const callee = astUtils.skipChainExpression(node.callee);

                if (callee.type !== 'MemberExpression') {
                    return;
                }

                let parent: Node | undefined = astUtils.skipChainExpression(callee.object);
                let depth = 1;

                while (parent && 'callee' in parent && parent.callee) {
                    depth += 1;
                    parent = astUtils.skipChainExpression(
                        'object' in astUtils.skipChainExpression(parent.callee)
                            ? (
                                astUtils.skipChainExpression(
                                    parent.callee,
                                ) as Node<'MemberExpression'>
                            ).object
                            : undefined,
                    );
                }

                if (
                    depth > ignoreChainWithDepth
                    && astUtils.isTokenOnSameLine(callee.object, callee.property)
                ) {
                    const firstTokenAfterObject = sourceCode.getTokenAfter(
                        callee.object,
                        astUtils.isNotClosingParenToken,
                    );

                    context.report({
                        node: callee.property,
                        loc: {
                            start: firstTokenAfterObject!.loc.start,
                            end: callee.loc.end,
                        },
                        messageId: 'expected',
                        data: {
                            callee: getPropertyText(callee),
                        },
                        fix(fixer: Fixer) {
                            return fixer.insertTextBefore(firstTokenAfterObject!, '\n');
                        },
                    });
                }
            },
        };
    },
};

export default rule;
