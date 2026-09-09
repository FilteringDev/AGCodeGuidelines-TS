import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file Validate spacing before closing bracket in JSX.
 * @author ryym
 * @deprecated
 */
import dependency0 from '../util/getTokenBeforeClosingBracket';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/log';
import dependency3 from '../util/report';
import dependency4 from '../util/eslint';

const getTokenBeforeClosingBracket = dependency0;
const docsUrl = dependency1;
const log = dependency2;
const report = dependency3;
const { getSourceCode } = dependency4;

let isWarnedForDeprecation = false;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noSpaceBeforeClose: 'A space is forbidden before closing bracket',
    needSpaceBeforeClose: 'A space is required before closing bracket',
};

const rule: LegacyRule<[('always' | 'never')?]> = {
    meta: {
        deprecated: true,
        replacedBy: ['jsx-tag-spacing'],
        docs: {
            description: 'Enforce spacing before closing bracket in JSX',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-space-before-closing'),
        },
        fixable: 'code',

        messages,

        schema: [
            {
                enum: ['always', 'never'],
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || 'always';

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        return {
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                if (!node.selfClosing) {
                    return;
                }

                const sourceCode = getSourceCode(context);

                const leftToken = getTokenBeforeClosingBracket(node);
                const closingSlash = sourceCode.getTokenAfter(leftToken!);

                if (leftToken!.loc.end.line !== closingSlash!.loc.start.line) {
                    return;
                }

                if (
                    configuration === 'always'
                    && !sourceCode.isSpaceBetweenTokens(leftToken!, closingSlash!)
                ) {
                    report(context, messages.needSpaceBeforeClose, 'needSpaceBeforeClose', {
                        loc: closingSlash!.loc.start,
                        fix(fixer: Fixer) {
                            return fixer.insertTextBefore(closingSlash!, ' ');
                        },
                    });
                } else if (
                    configuration === 'never'
                    && sourceCode.isSpaceBetweenTokens(leftToken!, closingSlash!)
                ) {
                    report(context, messages.noSpaceBeforeClose, 'noSpaceBeforeClose', {
                        loc: closingSlash!.loc.start,
                        fix(fixer: Fixer) {
                            const previousToken = sourceCode.getTokenBefore(closingSlash!);
                            return fixer.removeRange([previousToken!.range[1], closingSlash!.range[0]]);
                        },
                    });
                }
            },

            Program() {
                if (isWarnedForDeprecation) {
                    return;
                }

                log(
                    'The react/jsx-space-before-closing rule is deprecated. '
                        + 'Please use the react/jsx-tag-spacing rule with the '
                        + '"beforeSelfClosing" option instead.',
                );
                isWarnedForDeprecation = true;
            },
        };
    },
};

export default rule;
