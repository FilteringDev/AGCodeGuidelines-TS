import type {
    Node, LegacyRule, Fixer, Report,
} from '../../types';
import { getDeclaredVariables, getSourceCode } from '../../utils/contextCompat';
import docsUrl from '../docsUrl';

/**
 * Get import value.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function getImportValue(node: Node<'ImportDeclaration' | 'TSImportEqualsDeclaration'>) {
    return node.type === 'ImportDeclaration'
        ? node.source.value
        : (node.moduleReference.expression!.value as string);
}

const rule: LegacyRule<[('absolute-first' | 'disable-absolute-first')?]> = {
    meta: {
        type: 'suggestion',
        docs: {
            category: 'Style guide',
            description: 'Ensure all imports appear before other statements.',
            url: docsUrl('first'),
        },
        fixable: 'code',
        schema: [
            {
                type: 'string',
                enum: ['absolute-first', 'disable-absolute-first'],
            },
        ],
    },

    create(context) {
        /**
         * Is possible directive.
         * @param node The node to inspect.
         * @returns The result of this check.
         */
        function isPossibleDirective(node: Node) {
            return (
                node.type === 'ExpressionStatement'
                && node.expression.type === 'Literal'
                && typeof node.expression.value === 'string'
            );
        }

        return {
            Program(n) {
                const { body } = n;
                if (!body) {
                    return;
                }
                const absoluteFirst = context.options[0] === 'absolute-first';
                const message = 'Import in body of module; reorder to top.';
                const sourceCode = getSourceCode(context);
                const originSourceCode = sourceCode.getText();
                let nonImportCount = 0;
                let anyExpressions = false;
                let anyRelative = false;
                let lastLegalImp: Node<'ImportDeclaration' | 'TSImportEqualsDeclaration'> | null = null;
                const errorInfos: { node: Node; range: [number, number] }[] = [];
                let shouldSort = true;
                let lastSortNodesIndex = 0;
                body.forEach((node, index) => {
                    if (!anyExpressions && isPossibleDirective(node)) {
                        return;
                    }

                    anyExpressions = true;

                    if (node.type === 'ImportDeclaration' || node.type === 'TSImportEqualsDeclaration') {
                        if (absoluteFirst) {
                            if (/^\./.test(getImportValue(node))) {
                                anyRelative = true;
                            } else if (anyRelative) {
                                context.report({
                                    node:
                                        node.type === 'ImportDeclaration'
                                            ? node.source
                                            : node.moduleReference,
                                    message: 'Absolute imports should come before relative imports.',
                                });
                            }
                        }
                        if (nonImportCount > 0) {
                            const entryIterator0 = getDeclaredVariables(context, node)[
                                Symbol.iterator
                            ]();
                            for (
                                let entryStep1 = entryIterator0.next();
                                !entryStep1.done;
                                entryStep1 = entryIterator0.next()
                            ) {
                                const variable = entryStep1.value;
                                if (!shouldSort) {
                                    break;
                                }
                                const { references } = variable;
                                if (references.length) {
                                    const entryIterator1 = references[Symbol.iterator]();
                                    for (
                                        let entryStep2 = entryIterator1.next();
                                        !entryStep2.done;
                                        entryStep2 = entryIterator1.next()
                                    ) {
                                        const reference = entryStep2.value;
                                        if (reference.identifier.range[0] < node.range[1]) {
                                            shouldSort = false;
                                            break;
                                        }
                                    }
                                }
                            }

                            if (shouldSort) {
                                lastSortNodesIndex = errorInfos.length;
                            }
                            errorInfos.push({
                                node,
                                range: [body[index - 1]!.range[1], node.range[1]],
                            });
                        } else {
                            lastLegalImp = node;
                        }
                    } else {
                        nonImportCount += 1;
                    }
                });
                if (!errorInfos.length) {
                    return;
                }
                errorInfos.forEach((errorInfo, index) => {
                    const { node } = errorInfo;
                    const infos: Report = {
                        node,
                        message,
                    };
                    if (index < lastSortNodesIndex) {
                        infos.fix = function inspect(fixer: Fixer) {
                            return fixer.insertTextAfter(node, '');
                        };
                    } else if (index === lastSortNodesIndex) {
                        const sortNodes = errorInfos.slice(0, lastSortNodesIndex + 1);
                        infos.fix = function inspect(fixer: Fixer) {
                            const removeFixers = sortNodes.map((_errorInfo) => fixer.removeRange(_errorInfo.range));
                            const range: [number, number] = [
                                0,
                                removeFixers[removeFixers.length - 1]!.range[1],
                            ];
                            let insertSourceCode = sortNodes
                                .map((_errorInfo) => {
                                    const nodeSourceCode = String.prototype.slice.apply(
                                        originSourceCode,
                                        _errorInfo.range,
                                    );
                                    if (/\S/.test(nodeSourceCode[0]!)) {
                                        return `\n${nodeSourceCode}`;
                                    }
                                    return nodeSourceCode;
                                })
                                .join('');
                            let insertFixer = null;
                            let replaceSourceCode = '';
                            if (!lastLegalImp) {
                                insertSourceCode = insertSourceCode.trim() + insertSourceCode.match(/^(\s+)/)![0]!;
                            }
                            insertFixer = lastLegalImp
                                ? fixer.insertTextAfter(lastLegalImp, insertSourceCode)
                                : fixer.insertTextBefore(body[0]!, insertSourceCode);

                            const fixers = [insertFixer].concat(removeFixers);
                            fixers.forEach((computedFixer, i) => {
                                replaceSourceCode
                                    += originSourceCode.slice(
                                        fixers[i - 1] ? fixers[i - 1]!.range[1] : 0,
                                        computedFixer.range[0],
                                    ) + computedFixer.text;
                            });

                            return fixer.replaceTextRange(range, replaceSourceCode);
                        };
                    }
                    context.report(infos);
                });
            },
        };
    },
};
export default rule;
