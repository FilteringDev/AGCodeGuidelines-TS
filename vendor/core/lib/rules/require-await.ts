/**
 * @file Rule to disallow async functions which have no `await` expression.
 * @author Toru Nagashima
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Capitalize the 1st letter of the given text.
 * @param text The text to capitalize.
 * @returns The text that the 1st letter was capitalized.
 */
function capitalizeFirstLetter(text: string) {
    return text![0]!.toUpperCase() + text.slice(1);
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow async functions which have no `await` expression',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/require-await',
        },

        schema: [],

        messages: {
            missingAwait: "{{name}} has no 'await' expression.",
        },
    },

    create(context) {
        const { sourceCode } = context;
        interface ScopeInfoState {
            hasAwait: boolean;
            upper: ScopeInfoState | null;
        }
        let scopeInfo: ScopeInfoState | null = null;

        /**
         * Push the scope info object to the stack.
         */
        function enterFunction() {
            scopeInfo = {
                upper: scopeInfo,
                hasAwait: false,
            };
        }

        /**
         * Pop the top scope info object from the stack.
         * Also, it reports the function if needed.
         * @param node The node to report.
         */
        function exitFunction(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
        ) {
            if (
                !node.generator
                && node.async
                && !scopeInfo!.hasAwait
                && !astUtils.isEmptyFunction(node)
            ) {
                context.report({
                    node,
                    loc: astUtils.getFunctionHeadLoc(node, sourceCode),
                    messageId: 'missingAwait',
                    data: {
                        name: capitalizeFirstLetter(astUtils.getFunctionNameWithKind(node)),
                    },
                });
            }

            scopeInfo = scopeInfo!.upper;
        }

        return {
            FunctionDeclaration: enterFunction,
            FunctionExpression: enterFunction,
            ArrowFunctionExpression: enterFunction,
            'FunctionDeclaration:exit': exitFunction,
            'FunctionExpression:exit': exitFunction,
            'ArrowFunctionExpression:exit': exitFunction,

            AwaitExpression() {
                if (!scopeInfo) {
                    return;
                }

                scopeInfo.hasAwait = true;
            },
            ForOfStatement(node: Node<'ForOfStatement'>) {
                if (!scopeInfo) {
                    return;
                }

                if (node.await) {
                    scopeInfo.hasAwait = true;
                }
            },
        };
    },
};

export default rule;
