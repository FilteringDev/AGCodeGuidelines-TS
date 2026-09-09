import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file Limit to one expression per line in JSX
 * @author Mark Ivan Allen <Vydia.com>
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/eslint';
import dependency2 from '../util/jsx';
import dependency3 from '../util/report';

const docsUrl = dependency0;
const eslintUtil = dependency1;
const jsxUtil = dependency2;
const report = dependency3;

const { getSourceCode } = eslintUtil;
const { getText } = eslintUtil;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const optionDefaults = {
    allow: 'none',
};

const messages = {
    moveToNewLine: '`{{descriptor}}` must be placed on a new line',
};

const rule: LegacyRule<[{ allow?: 'none' | 'literal' | 'single-child' | 'non-jsx' }?]> = {
    meta: {
        docs: {
            description: 'Require one JSX element per line',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-one-expression-per-line'),
        },
        fixable: 'whitespace',

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    allow: {
                        enum: ['none', 'literal', 'single-child', 'non-jsx'],
                    },
                },
                default: optionDefaults,
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const options = { ...optionDefaults, ...context.options[0] };

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function nodeKey(node: Node) {
            return `${node.loc.start.line},${node.loc.start.column}`;
        }

        /**
         * @param n The value to inspect.
         * @returns The result of this check.
         */
        function nodeDescriptor(n: Node) {
            return n.openingElement
                ? n.openingElement.name.name
                : getText(context, n).replace(/\n/g, '');
        }

        /**
         * @param node The node to inspect.
         */
        function handleJSX(node: Node<'JSXElement' | 'JSXFragment'>) {
            const { children } = node;

            if (!children || !children.length) {
                return;
            }

            if (
                options.allow === 'non-jsx'
                && !children.find((child) => child.type === 'JSXFragment' || child.type === 'JSXElement')
            ) {
                return;
            }

            const openingElement = (node.openingElement || node.openingFragment)!;
            const closingElement = node.closingElement || node.closingFragment;
            const openingElementStartLine = openingElement.loc.start.line;
            const openingElementEndLine = openingElement.loc.end.line;
            const closingElementStartLine = closingElement!.loc.start.line;
            const closingElementEndLine = closingElement!.loc.end.line;

            if (children.length === 1) {
                const child = children[0];
                if (
                    openingElementStartLine === openingElementEndLine
                    && openingElementEndLine === closingElementStartLine
                    && closingElementStartLine === closingElementEndLine
                    && closingElementEndLine === child!.loc.start.line
                    && child!.loc.start.line === child!.loc.end.line
                ) {
                    if (
                        options.allow === 'single-child'
                        || (options.allow === 'literal'
                            && (child!.type === 'Literal' || child!.type === 'JSXText'))
                    ) {
                        return;
                    }
                }
            }

            const childrenGroupedByLine: Record<number, Node[]> = {};
            const fixDetailsByNode: Record<
                string,
                {
                    node: Node;
                    source: string;
                    descriptor: ReturnType<typeof nodeDescriptor>;
                    leadingSpace?: boolean;
                    leadingNewLine?: boolean;
                    trailingSpace?: boolean;
                    trailingNewLine?: boolean;
                }
            > = {};

            children.forEach((child) => {
                let countNewLinesBeforeContent = 0;
                let countNewLinesAfterContent = 0;

                if (child.type === 'Literal' || child.type === 'JSXText') {
                    if (jsxUtil.isWhiteSpaces(child.raw!)) {
                        return;
                    }

                    countNewLinesBeforeContent = (child.raw!.match(/^\s*\n/g) || []).length;
                    countNewLinesAfterContent = (child.raw!.match(/\n\s*$/g) || []).length;
                }

                const startLine = child.loc.start.line + countNewLinesBeforeContent;
                const endLine = child.loc.end.line - countNewLinesAfterContent;

                if (startLine === endLine) {
                    if (!childrenGroupedByLine[startLine]) {
                        childrenGroupedByLine[startLine] = [];
                    }
                    childrenGroupedByLine[startLine].push(child);
                } else {
                    if (!childrenGroupedByLine[startLine]) {
                        childrenGroupedByLine[startLine] = [];
                    }
                    childrenGroupedByLine[startLine].push(child);
                    if (!childrenGroupedByLine[endLine]) {
                        childrenGroupedByLine[endLine] = [];
                    }
                    childrenGroupedByLine[endLine].push(child);
                }
            });

            Object.keys(childrenGroupedByLine).forEach((_line) => {
                const line = parseInt(_line, 10);
                const firstIndex = 0;
                const lastIndex = childrenGroupedByLine[line]!.length - 1;

                childrenGroupedByLine[line]!.forEach((child, i) => {
                    let prevChild: Node | undefined;
                    let nextChild: Node | undefined;

                    if (i === firstIndex) {
                        if (line === openingElementEndLine) {
                            prevChild = openingElement;
                        }
                    } else {
                        prevChild = childrenGroupedByLine[line]![i - 1];
                    }

                    if (i === lastIndex) {
                        if (line === closingElementStartLine) {
                            nextChild = closingElement;
                        }
                    } else {
                        // We don't need to append a trailing because the next child will prepend a leading.
                        // nextChild = childrenGroupedByLine[line][i + 1];
                    }

                    /**
                     * @returns The result of this check.
                     */
                    function spaceBetweenPrev() {
                        return (
                            ((prevChild!.type === 'Literal' || prevChild!.type === 'JSXText')
                                && / $/.test(prevChild!.raw!))
                            || ((child.type === 'Literal' || child.type === 'JSXText')
                                && /^ /.test(child.raw!))
                            || getSourceCode(context).isSpaceBetweenTokens(prevChild!, child)
                        );
                    }

                    /**
                     * @returns The result of this check.
                     */
                    function spaceBetweenNext() {
                        return (
                            ((nextChild!.type === 'Literal' || nextChild!.type === 'JSXText')
                                && /^ /.test(nextChild!.raw!))
                            || ((child.type === 'Literal' || child.type === 'JSXText')
                                && / $/.test(child.raw!))
                            || getSourceCode(context).isSpaceBetweenTokens(child, nextChild!)
                        );
                    }

                    if (!prevChild && !nextChild) {
                        return;
                    }

                    const source = getText(context, child);
                    const leadingSpace = !!(prevChild && spaceBetweenPrev());
                    const trailingSpace = !!(nextChild && spaceBetweenNext());
                    const leadingNewLine = !!prevChild;
                    const trailingNewLine = !!nextChild;

                    const key = nodeKey(child);

                    if (!fixDetailsByNode[key]) {
                        fixDetailsByNode[key] = {
                            node: child,
                            source,
                            descriptor: nodeDescriptor(child),
                        };
                    }

                    if (leadingSpace) {
                        fixDetailsByNode[key].leadingSpace = true;
                    }
                    if (leadingNewLine) {
                        fixDetailsByNode[key].leadingNewLine = true;
                    }
                    if (trailingNewLine) {
                        fixDetailsByNode[key].trailingNewLine = true;
                    }
                    if (trailingSpace) {
                        fixDetailsByNode[key].trailingSpace = true;
                    }
                });
            });

            Object.keys(fixDetailsByNode).forEach((key) => {
                const details = fixDetailsByNode[key];

                const nodeToReport = details!.node;
                const { descriptor } = details!;
                const source = details!.source.replace(/(^ +| +(?=\n)*$)/g, '');

                const leadingSpaceString = details!.leadingSpace ? "\n{' '}" : '';
                const trailingSpaceString = details!.trailingSpace ? "{' '}\n" : '';
                const leadingNewLineString = details!.leadingNewLine ? '\n' : '';
                const trailingNewLineString = details!.trailingNewLine ? '\n' : '';

                const replaceText = `${leadingSpaceString}${leadingNewLineString}${source}${trailingNewLineString}${trailingSpaceString}`;

                report(context, messages.moveToNewLine, 'moveToNewLine', {
                    node: nodeToReport,
                    data: {
                        descriptor,
                    },
                    fix(fixer: Fixer) {
                        return fixer.replaceText(nodeToReport, replaceText);
                    },
                });
            });
        }

        return {
            JSXElement: handleJSX,
            JSXFragment: handleJSX,
        };
    },
};

export default rule;
