/**
 * @file Rule to check for "block scoped" variables by binding context
 * @author Matt DuVall <http://www.mattduvall.com>
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

import type {
    Definition, LegacyRule, Node, Reference,
} from '../../../types';

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Enforce the use of variables within the scope they are defined',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/block-scoped-var',
        },

        schema: [],

        messages: {
            outOfScope:
                "'{{name}}' declared on line {{definitionLine}} column {{definitionColumn}} is used outside of binding context.",
        },
    },

    create(context) {
        let stack: [number, number][] = [];
        const { sourceCode } = context;

        /**
         * Makes a block scope.
         * @param node A node of a scope.
         */
        function enterScope(
            node: Node<
                | 'BlockStatement'
                | 'CatchClause'
                | 'ForInStatement'
                | 'ForOfStatement'
                | 'ForStatement'
                | 'StaticBlock'
                | 'SwitchStatement'
            >,
        ) {
            stack.push(node.range);
        }

        /**
         * Pops the last block scope.
         */
        function exitScope() {
            stack.pop();
        }

        /**
         * Reports a given reference.
         * @param reference A reference to report.
         * @param definition A definition for which to report reference.
         */
        function report(reference: Reference, definition: Definition) {
            const { identifier } = reference;
            const definitionPosition = definition.name.loc.start;

            context.report({
                node: identifier,
                messageId: 'outOfScope',
                data: {
                    name: identifier.name,
                    definitionLine: definitionPosition.line,
                    definitionColumn: definitionPosition.column + 1,
                },
            });
        }

        /**
         * Finds and reports references which are outside of valid scopes.
         * @param node A node to get variables.
         */
        function checkForVariables(node: Node<'VariableDeclaration'>) {
            if (node.kind !== 'var') {
                return;
            }

            // Defines a predicate to check whether or not a given reference is outside of valid scope.
            const scopeRange = stack[stack.length - 1];

            /**
             * Check if a reference is out of scope
             * @param reference node to examine
             * @returns True is its outside the scope
             */
            function isOutsideOfScope(reference: Reference) {
                const idRange = reference.identifier.range;

                return idRange[0] < scopeRange![0] || idRange[1] > scopeRange![1];
            }

            // Gets declared variables, and checks its references.
            const variables = sourceCode.getDeclaredVariables(node);

            for (let i = 0; i < variables.length; i += 1) {
                // Reports.
                const variable = variables[i]!;
                variable.references.filter(isOutsideOfScope)
                    .forEach((ref) => report(ref, variable.defs.find((def) => def.parent === node)!));
            }
        }

        return {
            Program(node: Node<'Program'>) {
                stack = [node.range];
            },

            // Manages scopes.
            BlockStatement: enterScope,
            'BlockStatement:exit': exitScope,
            ForStatement: enterScope,
            'ForStatement:exit': exitScope,
            ForInStatement: enterScope,
            'ForInStatement:exit': exitScope,
            ForOfStatement: enterScope,
            'ForOfStatement:exit': exitScope,
            SwitchStatement: enterScope,
            'SwitchStatement:exit': exitScope,
            CatchClause: enterScope,
            'CatchClause:exit': exitScope,
            StaticBlock: enterScope,
            'StaticBlock:exit': exitScope,

            // Finds and reports references which are outside of valid scope.
            VariableDeclaration: checkForVariables,
        };
    },
};

export default rule;
