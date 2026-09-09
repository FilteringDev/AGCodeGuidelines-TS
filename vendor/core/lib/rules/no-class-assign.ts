/**
 * @file A rule to disallow modifying variables of class declarations
 * @author Toru Nagashima
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
            description: 'Disallow reassigning class members',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-class-assign',
        },

        schema: [],

        messages: {
            class: "'{{name}}' is a class.",
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
                    context.report({
                        node: reference.identifier,
                        messageId: 'class',
                        data: { name: reference.identifier.name },
                    });
                });
        }

        /**
         * Finds and reports references that are non initializer and writable.
         * @param node A ClassDeclaration/ClassExpression node to check.
         */
        function checkForClass(node: Node<'ClassDeclaration' | 'ClassExpression'>) {
            sourceCode.getDeclaredVariables(node).forEach(checkVariable);
        }

        return {
            ClassDeclaration: checkForClass,
            ClassExpression: checkForClass,
        };
    },
};

export default rule;
