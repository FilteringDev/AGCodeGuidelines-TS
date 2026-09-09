/**
 * @file A rule to warn against using arrow functions when they could be
 * confused with comparisons
 * @author Jxck <https://github.com/Jxck>
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import type { Fixer, LegacyRule, Node } from '../../../types';

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks whether or not a node is a conditional expression.
 * @param node node to test
 * @returns `true` if the node is a conditional expression.
 */
function isConditional(node: Node) {
    return node && node.type === 'ConditionalExpression';
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ allowParens?: boolean; onlyOneSimpleParam?: boolean }?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'suggestion',

        docs: {
            description:
                'Disallow arrow functions where they could be confused with comparisons',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-confusing-arrow',
        },

        fixable: 'code',

        schema: [
            {
                type: 'object',
                properties: {
                    allowParens: { type: 'boolean', default: true },
                    onlyOneSimpleParam: { type: 'boolean', default: false },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            confusing: 'Arrow function used ambiguously with a conditional expression.',
        },
    },

    create(context) {
        const config = context.options[0] || {};
        const allowParens = config.allowParens || config.allowParens === undefined;
        const { onlyOneSimpleParam } = config;
        const { sourceCode } = context;

        /**
         * Reports if an arrow function contains an ambiguous conditional.
         * @param node A node to check and report.
         */
        function checkArrowFunc(node: Node<'ArrowFunctionExpression'>) {
            const { body } = node;

            if (
                isConditional(body)
                && !(allowParens && astUtils.isParenthesised(sourceCode, body))
                && !(
                    onlyOneSimpleParam
                    && !(node.params.length === 1 && node!.params[0]!.type === 'Identifier')
                )
            ) {
                context.report({
                    node,
                    messageId: 'confusing',
                    fix(fixer: Fixer) {
                        // if `allowParens` is not set to true don't bother wrapping in parens
                        return allowParens
                            ? fixer.replaceText(node.body, `(${sourceCode.getText(node.body)})`)
                            : null;
                    },
                });
            }
        }

        return {
            ArrowFunctionExpression: checkArrowFunc,
        };
    },
};

export default rule;
