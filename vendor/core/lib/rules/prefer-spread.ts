/**
 * @file A rule to suggest using of the spread operator instead of `.apply()`.
 * @author Toru Nagashima
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node, SourceCode } from '../../../types';

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks whether or not a node is a `.apply()` for variadic.
 * @param node A CallExpression node to check.
 * @returns Whether or not the node is a `.apply()` for variadic.
 */
function isVariadicApplyCalling(node: Node<'CallExpression'>) {
    return (
        astUtils.isSpecificMemberAccess(node.callee, null, 'apply')
        && node.arguments.length === 2
        && node.arguments[1]!.type !== 'ArrayExpression'
        && node.arguments[1]!.type !== 'SpreadElement'
    );
}

/**
 * Checks whether or not `thisArg` is not changed by `.apply()`.
 * @param expectedThis The node that is the owner of the applied function.
 * @param thisArg The node that is given to the first argument of the `.apply()`.
 * @param context The ESLint rule context object.
 * @returns Whether or not `thisArg` is not changed by `.apply()`.
 */
function isValidThisArg(expectedThis: Node | null, thisArg: Node, context: SourceCode) {
    if (!expectedThis) {
        return astUtils.isNullOrUndefined(thisArg);
    }
    return astUtils.equalTokens(expectedThis, thisArg, context);
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Require spread operators instead of `.apply()`',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/prefer-spread',
        },

        schema: [],
        fixable: null,

        messages: {
            preferSpread: "Use the spread operator instead of '.apply()'.",
        },
    },

    create(context) {
        const { sourceCode } = context;

        return {
            CallExpression(node: Node<'CallExpression'>) {
                if (!isVariadicApplyCalling(node)) {
                    return;
                }

                const applied = astUtils.skipChainExpression(
                    (astUtils.skipChainExpression(node.callee) as Node<'MemberExpression'>)
                        .object,
                );
                const expectedThis = applied.type === 'MemberExpression' ? applied.object : null;
                const thisArg = node.arguments[0];

                if (isValidThisArg(expectedThis, thisArg!, sourceCode)) {
                    context.report({
                        node,
                        messageId: 'preferSpread',
                    });
                }
            },
        };
    },
};

export default rule;
