/**
 * @file Require or disallow Unicode BOM
 * @author Andrew Johnston <https://github.com/ehjay>
 */
import type { Fixer, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[('always' | 'never')?]> = {
    meta: {
        type: 'layout',

        docs: {
            description: 'Require or disallow Unicode byte order mark (BOM)',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/unicode-bom',
        },

        fixable: 'whitespace',

        schema: [
            {
                enum: ['always', 'never'],
            },
        ],
        messages: {
            expected: 'Expected Unicode BOM (Byte Order Mark).',
            unexpected: 'Unexpected Unicode BOM (Byte Order Mark).',
        },
    },

    create(context) {
        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            Program: function checkUnicodeBOM(node: Node<'Program'>) {
                const { sourceCode } = context;
                const location = { column: 0, line: 1 };
                const requireBOM = context.options[0] || 'never';

                if (!sourceCode.hasBOM && requireBOM === 'always') {
                    context.report({
                        node,
                        loc: location,
                        messageId: 'expected',
                        fix(fixer: Fixer) {
                            return fixer.insertTextBeforeRange([0, 1], '\uFEFF');
                        },
                    });
                } else if (sourceCode.hasBOM && requireBOM === 'never') {
                    context.report({
                        node,
                        loc: location,
                        messageId: 'unexpected',
                        fix(fixer: Fixer) {
                            return fixer.removeRange([-1, 0]);
                        },
                    });
                }
            },
        };
    },
};

export default rule;
