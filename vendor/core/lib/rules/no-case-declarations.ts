/**
 * @file Rule to flag use of an lexical declarations inside a case clause
 * @author Erik Arvidsson
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow lexical declarations in case clauses',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-case-declarations',
        },

        schema: [],

        messages: {
            unexpected: 'Unexpected lexical declaration in case block.',
        },
    },

    create(context) {
        /**
         * Checks whether or not a node is a lexical declaration.
         * @param node A direct child statement of a switch case.
         * @returns Whether or not the node is a lexical declaration.
         */
        function isLexicalDeclaration(node: Node) {
            switch (node.type) {
                case 'FunctionDeclaration':
                case 'ClassDeclaration':
                    return true;
                case 'VariableDeclaration':
                    return node.kind !== 'var';
                default:
                    return false;
            }
        }

        return {
            SwitchCase(node: Node<'SwitchCase'>) {
                for (let i = 0; i < node.consequent.length; i += 1) {
                    const statement = node.consequent[i];

                    if (isLexicalDeclaration(statement!)) {
                        context.report({
                            node: statement!,
                            messageId: 'unexpected',
                        });
                    }
                }
            },
        };
    },
};

export default rule;
