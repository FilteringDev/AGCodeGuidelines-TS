/**
 * @file enforce the location of single-line statements
 * @author Teddy Katz
 * @deprecated in ESLint v8.53.0
 */
import type { Fixer, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const POSITION_SCHEMA = { enum: ['beside', 'below', 'any'] };

const rule: LegacyRule<
    [
        ('beside' | 'below' | 'any')?,
        {
            overrides?: {
                if?: 'beside' | 'below' | 'any';
                else?: 'beside' | 'below' | 'any';
                while?: 'beside' | 'below' | 'any';
                do?: 'beside' | 'below' | 'any';
                for?: 'beside' | 'below' | 'any';
            };
        }?,
    ]
> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Enforce the location of single-line statements',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/nonblock-statement-body-position',
        },

        fixable: 'whitespace',

        schema: [
            POSITION_SCHEMA,
            {
                properties: {
                    overrides: {
                        properties: {
                            if: POSITION_SCHEMA,
                            else: POSITION_SCHEMA,
                            while: POSITION_SCHEMA,
                            do: POSITION_SCHEMA,
                            for: POSITION_SCHEMA,
                        },
                        additionalProperties: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            expectNoLinebreak: 'Expected no linebreak before this statement.',
            expectLinebreak: 'Expected a linebreak before this statement.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        //----------------------------------------------------------------------
        // Helpers
        //----------------------------------------------------------------------

        /**
         * Gets the applicable preference for a particular keyword
         * @param keywordName The name of a keyword, e.g. 'if'
         * @returns The applicable option for the keyword, e.g. 'beside'
         */
        function getOption(keywordName: 'if' | 'else' | 'while' | 'do' | 'for') {
            return (
                (context.options[1]
                    && context.options[1].overrides
                    && context.options[1].overrides[keywordName])
                || context.options[0]
                || 'beside'
            );
        }

        /**
         * Validates the location of a single-line statement
         * @param node The single-line statement
         * @param keywordName The applicable keyword name for the single-line statement
         */
        function validateStatement(
            node: Node,
            keywordName: 'if' | 'else' | 'while' | 'do' | 'for',
        ) {
            const option = getOption(keywordName);

            if (node.type === 'BlockStatement' || option === 'any') {
                return;
            }

            const tokenBefore = sourceCode.getTokenBefore(node);

            if (tokenBefore!.loc.end.line === node.loc.start.line && option === 'below') {
                context.report({
                    node,
                    messageId: 'expectLinebreak',
                    fix: (fixer: Fixer) => fixer.insertTextBefore(node, '\n'),
                });
            } else if (
                tokenBefore!.loc.end.line !== node.loc.start.line
                && option === 'beside'
            ) {
                context.report({
                    node,
                    messageId: 'expectNoLinebreak',
                    fix(fixer: Fixer) {
                        if (
                            sourceCode
                                .getText()
                                .slice(tokenBefore!.range[1], node.range[0])
                                .trim()
                        ) {
                            return null;
                        }
                        return fixer.replaceTextRange(
                            [tokenBefore!.range[1], node.range[0]],
                            ' ',
                        );
                    },
                });
            }
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        return {
            IfStatement(node: Node<'IfStatement'>) {
                validateStatement(node.consequent, 'if');

                // Check the `else` node, but don't check 'else if' statements.
                if (node.alternate && node.alternate.type !== 'IfStatement') {
                    validateStatement(node.alternate, 'else');
                }
            },
            WhileStatement: (node: Node<'WhileStatement'>) => validateStatement(node.body, 'while'),
            DoWhileStatement: (node: Node<'DoWhileStatement'>) => validateStatement(node.body, 'do'),
            ForStatement: (node: Node<'ForStatement'>) => validateStatement(node.body, 'for'),
            ForInStatement: (node: Node<'ForInStatement'>) => validateStatement(node.body, 'for'),
            ForOfStatement: (node: Node<'ForOfStatement'>) => validateStatement(node.body, 'for'),
        };
    },
};

export default rule;
