import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file Require or prevent a new line after jsx elements and expressions.
 * @author Johnny Zabala
 * @author Joseph Stiles
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/eslint';
import dependency2 from '../util/report';

const docsUrl = dependency0;
const { getText } = dependency1;
const report = dependency2;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    require: 'JSX element should start in a new line',
    prevent: 'JSX element should not start in a new line',
    allowMultilines: 'Multiline JSX elements should start in a new line',
};

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isMultilined(node: Node) {
    return node && node.loc.start.line !== node.loc.end.line;
}

const rule: LegacyRule<[{ prevent?: boolean; allowMultilines?: boolean }?]> = {
    meta: {
        docs: {
            description: 'Require or prevent a new line after jsx elements and expressions.',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-newline'),
        },
        fixable: 'code',

        messages,
        schema: [
            {
                type: 'object',
                properties: {
                    prevent: {
                        default: false,
                        type: 'boolean',
                    },
                    allowMultilines: {
                        default: false,
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
                if: {
                    properties: {
                        allowMultilines: {
                            const: true,
                        },
                    },
                },
                then: {
                    properties: {
                        prevent: {
                            const: true,
                        },
                    },
                    required: ['prevent'],
                },
            },
        ],
    },
    create(context) {
        const jsxElementParents = new Set<Node<'JSXElement' | 'JSXFragment'>>();

        /**
         * @returns The result of this check.
         * @param element The element value.
         */
        function isBlockCommentInCurlyBraces(element: Node) {
            const elementRawValue = getText(context, element);
            return /^\s*{\/\*/.test(elementRawValue);
        }

        /**
         * @returns The result of this check.
         * @param element The element value.
         */
        function isNonBlockComment(element: Node) {
            return (
                !isBlockCommentInCurlyBraces(element)
                && (element.type === 'JSXElement' || element.type === 'JSXExpressionContainer')
            );
        }

        return {
            'Program:exit': function onProgramExit() {
                jsxElementParents.forEach((parent) => {
                    parent.children.forEach((element, index, elements) => {
                        if (element.type === 'JSXElement' || element.type === 'JSXExpressionContainer') {
                            const configuration = context.options[0] || {};
                            const prevent = configuration.prevent || false;
                            const allowMultilines = configuration.allowMultilines || false;

                            const firstAdjacentSibling = elements[index + 1];
                            const secondAdjacentSibling = elements[index + 2];

                            const hasSibling = firstAdjacentSibling
                                && secondAdjacentSibling
                                && (firstAdjacentSibling.type === 'Literal'
                                    || firstAdjacentSibling.type === 'JSXText');

                            if (!hasSibling) {
                                return;
                            }

                            // Check adjacent sibling has the proper amount of newlines
                            const isWithoutNewLine = !/\n\s*\n/.test(
                                firstAdjacentSibling.value as string,
                            );

                            if (isBlockCommentInCurlyBraces(element)) {
                                return;
                            }
                            if (
                                allowMultilines
                                && (isMultilined(element)
                                    || isMultilined(elements.slice(index + 2).find(isNonBlockComment)!))
                            ) {
                                if (!isWithoutNewLine) {
                                    return;
                                }

                                const regex = /(\n)(?!.*\1)/g;
                                const replacement = '\n\n';
                                const messageId = 'allowMultilines';

                                report(context, messages[messageId], messageId, {
                                    node: secondAdjacentSibling,
                                    fix(fixer: Fixer) {
                                        return fixer.replaceText(
                                            firstAdjacentSibling,
                                            getText(context, firstAdjacentSibling).replace(
                                                regex,
                                                replacement,
                                            ),
                                        );
                                    },
                                });

                                return;
                            }

                            if (isWithoutNewLine === prevent) {
                                return;
                            }

                            const messageId = prevent ? 'prevent' : 'require';

                            const regex = prevent ? /(\n\n)(?!.*\1)/g : /(\n)(?!.*\1)/g;

                            const replacement = prevent ? '\n' : '\n\n';

                            report(context, messages[messageId], messageId, {
                                node: secondAdjacentSibling,
                                fix(fixer: Fixer) {
                                    return fixer.replaceText(
                                        firstAdjacentSibling,
                                        // double or remove the last newline
                                        getText(context, firstAdjacentSibling).replace(
                                            regex,
                                            replacement,
                                        ),
                                    );
                                },
                            });
                        }
                    });
                });
            },
            ':matches(JSXElement, JSXFragment) > :matches(JSXElement, JSXExpressionContainer)': (
                node: Node,
            ) => {
                jsxElementParents.add(node.parent as Node<'JSXElement' | 'JSXFragment'>);
            },
        };
    },
};

export default rule;
