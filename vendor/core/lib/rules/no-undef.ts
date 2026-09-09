/**
 * @file Rule to flag references to undeclared variables.
 * @author Mark Macdonald
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks if the given node is the argument of a typeof operator.
 * @param node The AST node being checked.
 * @returns Whether or not the node is the argument of a typeof operator.
 */
function hasTypeOfOperator(node: Node<'Identifier'>) {
    const { parent } = node;

    return parent.type === 'UnaryExpression' && parent.operator === 'typeof';
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ typeof?: boolean }?]> = {
    meta: {
        type: 'problem',

        docs: {
            description:
                'Disallow the use of undeclared variables unless mentioned in `/*global */` comments',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-undef',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    typeof: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            undef: "'{{name}}' is not defined.",
        },
    },

    create(context) {
        const options = context.options[0];
        const considerTypeOf = (options && options.typeof === true) || false;
        const { sourceCode } = context;

        return {
            'Program:exit': function onProgramExit(node: Node<'Program'>) {
                const globalScope = sourceCode.getScope(node);

                globalScope.through.forEach((ref) => {
                    const { identifier } = ref;

                    if (!considerTypeOf && hasTypeOfOperator(identifier)) {
                        return;
                    }

                    context.report({
                        node: identifier,
                        messageId: 'undef',
                        data: identifier,
                    });
                });
            },
        };
    },
};

export default rule;
