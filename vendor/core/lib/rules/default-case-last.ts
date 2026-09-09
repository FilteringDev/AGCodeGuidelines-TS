/**
 * @file Rule to enforce default clauses in switch statements to be last
 * @author Milos Djermanovic
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Enforce default clauses in switch statements to be last',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/default-case-last',
        },

        schema: [],

        messages: {
            notLast: 'Default clause should be the last clause.',
        },
    },

    create(context) {
        return {
            SwitchStatement(node: Node<'SwitchStatement'>) {
                const { cases } = node;
                const indexOfDefault = cases.findIndex((c) => c.test === null);

                if (indexOfDefault !== -1 && indexOfDefault !== cases.length - 1) {
                    const defaultClause = cases[indexOfDefault];

                    context.report({ node: defaultClause!, messageId: 'notLast' });
                }
            },
        };
    },
};

export default rule;
