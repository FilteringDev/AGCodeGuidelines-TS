import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file Ensure proper position of the first property in JSX
 * @author Joachim Seminck
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/report';
import dependency2 from '../util/props';

const docsUrl = dependency0;
const report = dependency1;
const propsUtil = dependency2;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    propOnNewLine: 'Property should be placed on a new line',
    propOnSameLine: 'Property should be placed on the same line as the component declaration',
};

const rule: LegacyRule<[('always' | 'never' | 'multiline' | 'multiline-multiprop' | 'multiprop')?]> = {
    meta: {
        docs: {
            description: 'Enforce proper position of the first property in JSX',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-first-prop-new-line'),
        },
        fixable: 'code',

        messages,

        schema: [
            {
                enum: ['always', 'never', 'multiline', 'multiline-multiprop', 'multiprop'],
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || 'multiline-multiprop';

        /**
         * @returns The result of this check.
         * @param jsxNode The jsx node value.
         */
        function isMultilineJSX(jsxNode: Node<'JSXOpeningElement'>) {
            return jsxNode.loc.start.line < jsxNode.loc.end.line;
        }

        return {
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                if (
                    (configuration === 'multiline' && isMultilineJSX(node))
                    || (configuration === 'multiline-multiprop'
                        && isMultilineJSX(node)
                        && node.attributes.length > 1)
                    || (configuration === 'multiprop' && node.attributes.length > 1)
                    || configuration === 'always'
                ) {
                    node.attributes.some((decl) => {
                        if (decl.loc.start.line === node.loc.start.line) {
                            report(context, messages.propOnNewLine, 'propOnNewLine', {
                                node: decl,
                                fix(fixer: Fixer) {
                                    const nodeTypeArguments = propsUtil.getTypeArguments(node);
                                    return fixer.replaceTextRange(
                                        [(nodeTypeArguments || node.name).range[1], decl.range[0]],
                                        '\n',
                                    );
                                },
                            });
                        }
                        return true;
                    });
                } else if (
                    (configuration === 'never' && node.attributes.length > 0)
                    || (configuration === 'multiprop'
                        && isMultilineJSX(node)
                        && node.attributes.length <= 1)
                ) {
                    const firstNode = node.attributes[0];
                    if (node.loc.start.line < firstNode!.loc.start.line) {
                        report(context, messages.propOnSameLine, 'propOnSameLine', {
                            node: firstNode!,
                            fix(fixer: Fixer) {
                                return fixer.replaceTextRange(
                                    [node.name.range[1], firstNode!.range[0]],
                                    ' ',
                                );
                            },
                        });
                    }
                }
            },
        };
    },
};

export default rule;
