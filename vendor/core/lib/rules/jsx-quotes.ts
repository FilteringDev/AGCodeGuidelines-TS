/**
 * @file A rule to ensure consistent quotes used in jsx syntax.
 * @author Mathias Schreck <https://github.com/lo1tuma>
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import type { Fixer, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const QUOTE_SETTINGS = {
    'prefer-double': {
        quote: '"',
        description: 'singlequote',
        convert(str: string) {
            return str.replace(/'/gu, '"');
        },
    },
    'prefer-single': {
        quote: "'",
        description: 'doublequote',
        convert(str: string) {
            return str.replace(/"/gu, "'");
        },
    },
};

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[('prefer-single' | 'prefer-double')?]> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description:
                'Enforce the consistent use of either double or single quotes in JSX attributes',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/jsx-quotes',
        },

        fixable: 'whitespace',

        schema: [
            {
                enum: ['prefer-single', 'prefer-double'],
            },
        ],
        messages: {
            unexpected: 'Unexpected usage of {{description}}.',
        },
    },

    create(context) {
        const quoteOption = context.options[0] || 'prefer-double';
        const setting = QUOTE_SETTINGS[quoteOption];

        /**
         * Checks if the given string literal node uses the expected quotes
         * @param node A string literal node.
         * @returns Whether or not the string literal used the expected quotes.
         */
        function usesExpectedQuotes(node: Node<'Literal'>) {
            return (
                String(node.value).includes(setting.quote)
                || astUtils.isSurroundedBy(node.raw!, setting.quote)
            );
        }

        return {
            JSXAttribute(node: Node<'JSXAttribute'>) {
                const attributeValue = node.value;

                if (
                    attributeValue
                    && astUtils.isStringLiteral(attributeValue)
                    && !usesExpectedQuotes(attributeValue)
                ) {
                    context.report({
                        node: attributeValue,
                        messageId: 'unexpected',
                        data: {
                            description: setting.description,
                        },
                        fix(fixer: Fixer) {
                            return fixer.replaceText(
                                attributeValue,
                                setting.convert(attributeValue.raw!),
                            );
                        },
                    });
                }
            },
        };
    },
};

export default rule;
