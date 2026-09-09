/**
 * @file Rule to flag assignment of the exception parameter
 * @author Stephen Murray <spmurrayzzz>
 */
import dependency0 from './utils/ast-utils';
import type {
    LegacyRule, Node, Reference, Variable,
} from '../../../types';

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow reassigning exceptions in `catch` clauses',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-ex-assign',
        },

        schema: [],

        messages: {
            unexpected: 'Do not assign to the exception parameter.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * Finds and reports references that are non initializer and writable.
         * @param variable A variable to check.
         */
        function checkVariable(variable: Variable) {
            astUtils
                .getModifyingReferences(variable.references)
                .forEach((reference: Reference) => {
                    context.report({ node: reference.identifier, messageId: 'unexpected' });
                });
        }

        return {
            CatchClause(node: Node<'CatchClause'>) {
                sourceCode.getDeclaredVariables(node).forEach(checkVariable);
            },
        };
    },
};

export default rule;
