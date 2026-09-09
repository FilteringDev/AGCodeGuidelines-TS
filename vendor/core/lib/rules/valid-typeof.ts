import type {
    Scope, Fixer, LegacyRule, Node,
} from '../../../types';
/**
 * @file Ensures that the results of typeof are compared against a valid string
 * @author Ian Christian Myers
 */
import dependency0 from './utils/ast-utils';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ requireStringLiterals?: boolean }?]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Enforce comparing `typeof` expressions against valid strings',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/valid-typeof',
        },

        hasSuggestions: true,

        schema: [
            {
                type: 'object',
                properties: {
                    requireStringLiterals: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            invalidValue: 'Invalid typeof comparison value.',
            notString: 'Typeof comparisons should be to string literals.',
            suggestString: 'Use `"{{type}}"` instead of `{{type}}`.',
        },
    },

    create(context) {
        const VALID_TYPES = new Set([
            'symbol',
            'undefined',
            'object',
            'boolean',
            'number',
            'string',
            'function',
            'bigint',
        ]);
        const OPERATORS = new Set(['==', '===', '!=', '!==']);
        const { sourceCode } = context;
        const requireStringLiterals = context.options[0] && context.options[0].requireStringLiterals;

        let globalScope: Scope;

        /**
         * Checks whether the given node represents a reference to a global variable that is not declared in the
         * source code.
         * These identifiers will be allowed, as it is assumed that user has no control over the names of external
         * global variables.
         * @param node `Identifier` node to check.
         * @returns `true` if the node is a reference to a global variable.
         */
        function isReferenceToGlobalVariable(node: Node<'Identifier'>) {
            const variable = globalScope.set.get(node.name);

            return (
                variable
                && variable.defs.length === 0
                && variable.references.some((ref) => ref.identifier === node)
            );
        }

        /**
         * Determines whether a node is a typeof expression.
         * @param node The node
         * @returns `true` if the node is a typeof expression
         */
        function isTypeofExpression(node: Node) {
            return node.type === 'UnaryExpression' && node.operator === 'typeof';
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            Program(node: Node<'Program'>) {
                globalScope = sourceCode.getScope(node);
            },

            UnaryExpression(node: Node<'UnaryExpression'>) {
                if (isTypeofExpression(node)) {
                    const { parent } = node;

                    if (parent.type === 'BinaryExpression' && OPERATORS.has(parent.operator)) {
                        const sibling = parent.left === node ? parent.right : parent.left;

                        if (
                            sibling.type === 'Literal'
                            || astUtils.isStaticTemplateLiteral(sibling)
                        ) {
                            const value = sibling.type === 'Literal'
                                ? sibling.value
                                : sibling.quasis[0]!.value.cooked;

                            if (typeof value !== 'string' || !VALID_TYPES.has(value)) {
                                context.report({ node: sibling, messageId: 'invalidValue' });
                            }
                        } else if (
                            sibling.type === 'Identifier'
                            && sibling.name === 'undefined'
                            && isReferenceToGlobalVariable(sibling)
                        ) {
                            context.report({
                                node: sibling,
                                messageId: requireStringLiterals ? 'notString' : 'invalidValue',
                                suggest: [
                                    {
                                        messageId: 'suggestString',
                                        data: { type: 'undefined' },
                                        fix(fixer: Fixer) {
                                            return fixer.replaceText(sibling, '"undefined"');
                                        },
                                    },
                                ],
                            });
                        } else if (requireStringLiterals && !isTypeofExpression(sibling)) {
                            context.report({ node: sibling, messageId: 'notString' });
                        }
                    }
                }
            },
        };
    },
};

export default rule;
