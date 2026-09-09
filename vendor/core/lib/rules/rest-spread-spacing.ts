/**
 * @file Enforce spacing between rest and spread operators and their expressions.
 * @author Kai Cataldo
 * @deprecated in ESLint v8.53.0
 */
import type { Fixer, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[('always' | 'never')?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description:
                'Enforce spacing between rest and spread operators and their expressions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/rest-spread-spacing',
        },

        fixable: 'whitespace',

        schema: [
            {
                enum: ['always', 'never'],
            },
        ],

        messages: {
            unexpectedWhitespace: 'Unexpected whitespace after {{type}} operator.',
            expectedWhitespace: 'Expected whitespace after {{type}} operator.',
        },
    },

    create(context) {
        const { sourceCode } = context;
        const alwaysSpace = context.options[0] === 'always';

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Checks whitespace between rest/spread operators and their expressions
         * @param node The node to check
         */
        function checkWhiteSpace(node: Node<'RestElement' | 'SpreadElement'>) {
            const operator = sourceCode.getFirstToken(node);
            const nextToken = sourceCode.getTokenAfter(operator);
            const hasWhitespace = sourceCode.isSpaceBetweenTokens(operator, nextToken!);
            let type;

            switch (String(node.type)) {
                case 'SpreadElement':
                    type = 'spread';
                    if (node.parent.type === 'ObjectExpression') {
                        type += ' property';
                    }
                    break;
                case 'RestElement':
                    type = 'rest';
                    if (node.parent.type === 'ObjectPattern') {
                        type += ' property';
                    }
                    break;
                case 'ExperimentalSpreadProperty':
                    type = 'spread property';
                    break;
                case 'ExperimentalRestProperty':
                    type = 'rest property';
                    break;
                default:
                    return;
            }

            if (alwaysSpace && !hasWhitespace) {
                context.report({
                    node,
                    loc: operator!.loc,
                    messageId: 'expectedWhitespace',
                    data: {
                        type,
                    },
                    fix(fixer: Fixer) {
                        return fixer.replaceTextRange(
                            [operator!.range[1], nextToken!.range[0]],
                            ' ',
                        );
                    },
                });
            } else if (!alwaysSpace && hasWhitespace) {
                context.report({
                    node,
                    loc: {
                        start: operator!.loc.end,
                        end: nextToken!.loc.start,
                    },
                    messageId: 'unexpectedWhitespace',
                    data: {
                        type,
                    },
                    fix(fixer: Fixer) {
                        return fixer.removeRange([operator!.range[1], nextToken!.range[0]]);
                    },
                });
            }
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            SpreadElement: checkWhiteSpace,
            RestElement: checkWhiteSpace,
            ExperimentalSpreadProperty: checkWhiteSpace,
            ExperimentalRestProperty: checkWhiteSpace,
        };
    },
};

export default rule;
