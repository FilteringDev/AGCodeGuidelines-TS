/**
 * @file enforce default parameters to be last
 * @author Chiawen Chen
 */
import type { LegacyRule, Node } from '../../../types';

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Enforce default parameters to be last',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/default-param-last',
        },

        schema: [],

        messages: {
            shouldBeLast: 'Default parameters should be last.',
        },
    },

    create(context) {
        /**
         * Handler for function contexts.
         * @param node function node
         */
        function handleFunction(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
        ) {
            let hasSeenPlainParam = false;

            node.params.toReversed().forEach((param) => {
                if (param!.type !== 'AssignmentPattern' && param!.type !== 'RestElement') {
                    hasSeenPlainParam = true;
                    return;
                }

                if (hasSeenPlainParam && param!.type === 'AssignmentPattern') {
                    context.report({
                        node: param!,
                        messageId: 'shouldBeLast',
                    });
                }
            });
        }

        return {
            FunctionDeclaration: handleFunction,
            FunctionExpression: handleFunction,
            ArrowFunctionExpression: handleFunction,
        };
    },
};

export default rule;
