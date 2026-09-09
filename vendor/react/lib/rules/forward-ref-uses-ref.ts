import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file Require all forwardRef components include a ref parameter
 */
import dependency0 from '../util/ast';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/report';
import dependency3 from '../util/message';

const { isParenthesized } = dependency0;
const docsUrl = dependency1;
const report = dependency2;
const getMessageData = dependency3;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/**
 * @param node The value to inspect.
 * @returns If the node represents the identifier `forwardRef`.
 */
function isForwardRefIdentifier(node: Node) {
    return node.type === 'Identifier' && node.name === 'forwardRef';
}

/**
 * @param node The value to inspect.
 * @returns If the node represents a function call `forwardRef()` or `React.forwardRef()`.
 */
function isForwardRefCall(node: Node) {
    return (
        node.type === 'CallExpression'
        && (isForwardRefIdentifier(node.callee)
            || (node.callee.type === 'MemberExpression' && isForwardRefIdentifier(node.callee.property)))
    );
}

const messages = {
    missingRefParameter: 'forwardRef is used with this component but no ref parameter is set',
    addRefParameter: 'Add a ref parameter',
    removeForwardRef: 'Remove forwardRef wrapper',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Require all forwardRef components include a ref parameter',
            category: 'Possible Errors',
            recommended: false,
            url: docsUrl('forward-ref-uses-ref'),
        },
        messages,
        schema: [],
        type: 'suggestion',
        hasSuggestions: true,
    },

    create(context) {
        const sourceCode = context.getSourceCode();

        return {
            'FunctionExpression, ArrowFunctionExpression':
                function onFunctionExpressionArrowFunctionExpression(
                    node: Node<'FunctionExpression' | 'ArrowFunctionExpression'>,
                ) {
                    if (!isForwardRefCall(node.parent)) {
                        return;
                    }

                    if (node.params.length === 1) {
                        report(context, messages.missingRefParameter, 'missingRefParameter', {
                            node,
                            suggest: [
                                Object.assign(
                                    getMessageData('addRefParameter', messages.addRefParameter),
                                    {
                                        fix(fixer: Fixer) {
                                            const param = node.params[0];
                                            // If using shorthand arrow function syntax, add parentheses around the
                                            // new parameter pair
                                            const shouldAddParentheses = node.type === 'ArrowFunctionExpression'
                                                && !isParenthesized(context, param!);
                                            return ([] as ReturnType<Fixer['remove']>[]).concat(
                                                shouldAddParentheses
                                                    ? fixer.insertTextBefore(param!, '(')
                                                    : [],
                                                fixer.insertTextAfter(
                                                    param!,
                                                    `, ref${shouldAddParentheses ? ')' : ''}`,
                                                ),
                                            );
                                        },
                                    },
                                ),
                                Object.assign(
                                    getMessageData('removeForwardRef', messages.removeForwardRef),
                                    {
                                        fix(fixer: Fixer) {
                                            return fixer.replaceText(
                                                node.parent,
                                                sourceCode.getText(node),
                                            );
                                        },
                                    },
                                ),
                            ],
                        });
                    }
                },
        };
    },
};

export default rule;
