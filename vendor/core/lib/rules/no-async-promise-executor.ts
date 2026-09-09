/**
 * @file disallow using an async function as a Promise executor
 * @author Teddy Katz
 */
import type { LegacyRule, Node, Token } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow using an async function as a Promise executor',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-async-promise-executor',
        },

        fixable: null,
        schema: [],
        messages: {
            async: 'Promise executor functions should not be async.',
        },
    },

    create(context) {
        return {
            "NewExpression[callee.name='Promise'][arguments.0.async=true]":
                function onNewExpressionCalleeNamePromiseArguments0AsyncTrue(
                    node: Node<'NewExpression'>,
                ) {
                    context.report({
                        node: context.sourceCode.getFirstToken(
                            node.arguments[0]!!,
                            (token: Token) => token.value === 'async',
                        )!,
                        messageId: 'async',
                    });
                },
        };
    },
};

export default rule;
