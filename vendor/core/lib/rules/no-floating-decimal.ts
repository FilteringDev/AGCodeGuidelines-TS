/**
 * @file Rule to flag use of a leading/trailing decimal point in a numeric literal
 * @author James Allardice
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import type { Fixer, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'suggestion',

        docs: {
            description: 'Disallow leading or trailing decimal points in numeric literals',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-floating-decimal',
        },

        schema: [],
        fixable: 'code',
        messages: {
            leading: 'A leading decimal point can be confused with a dot.',
            trailing: 'A trailing decimal point can be confused with a dot.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        return {
            Literal(node: Node<'Literal'>) {
                if (typeof node.value === 'number') {
                    if (node!.raw!.startsWith('.')) {
                        context.report({
                            node,
                            messageId: 'leading',
                            fix(fixer: Fixer) {
                                const tokenBefore = sourceCode.getTokenBefore(node);
                                const needsSpaceBefore = tokenBefore
                                    && tokenBefore.range[1] === node.range[0]
                                    && !astUtils.canTokensBeAdjacent(tokenBefore, `0${node.raw}`);

                                return fixer.insertTextBefore(
                                    node,
                                    needsSpaceBefore ? ' 0' : '0',
                                );
                            },
                        });
                    }
                    if (node!.raw!.indexOf('.') === node!.raw!.length - 1) {
                        context.report({
                            node,
                            messageId: 'trailing',
                            fix: (fixer: Fixer) => fixer.insertTextAfter(node, '0'),
                        });
                    }
                }
            },
        };
    },
};

export default rule;
