/**
 * @file Rule to check that spaced function application
 * @author Matt DuVall <http://www.mattduvall.com>
 * @deprecated in ESLint v3.3.0
 */
import type { Fixer, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'layout',

        docs: {
            description:
                'Disallow spacing between function identifiers and their applications (deprecated)',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-spaced-func',
        },

        deprecated: true,

        replacedBy: ['func-call-spacing'],

        fixable: 'whitespace',
        schema: [],

        messages: {
            noSpacedFunction: 'Unexpected space between function name and paren.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * Check if open space is present in a function name
         * @param node node to evaluate
         */
        function detectOpenSpaces(node: Node<'CallExpression' | 'NewExpression'>) {
            const lastCalleeToken = sourceCode.getLastToken(node.callee);
            let prevToken = lastCalleeToken;
            let parenToken = sourceCode.getTokenAfter(lastCalleeToken);

            // advances to an open parenthesis.
            while (
                parenToken
                && parenToken.range[1] < node.range[1]
                && parenToken.value !== '('
            ) {
                prevToken = parenToken;
                parenToken = sourceCode.getTokenAfter(parenToken);
            }

            // look for a space between the callee and the open paren
            if (
                parenToken
                && parenToken.range[1] < node.range[1]
                && sourceCode.isSpaceBetweenTokens(prevToken, parenToken)
            ) {
                context.report({
                    node,
                    loc: lastCalleeToken!.loc.start,
                    messageId: 'noSpacedFunction',
                    fix(fixer: Fixer) {
                        return fixer.removeRange([prevToken!.range[1], parenToken.range[0]]);
                    },
                });
            }
        }

        return {
            CallExpression: detectOpenSpaces,
            NewExpression: detectOpenSpaces,
        };
    },
};

export default rule;
