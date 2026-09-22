/** @file Check the top of files for a notice header and fix them too. */
import type { LegacyRule, Node, RuleContext } from '../../types';
import {
    createFixer,
    resolveOptions,
    similarityRatio,
    type NoticeOptions,
} from './utils';

const rule: LegacyRule<[NoticeOptions?]> = {
    meta: {
        docs: {
            description: 'An eslint rule that checks the top of files and --fix them too!',
            category: 'Stylistic Issues',
        },
        fixable: 'code',
        schema: false,
    },
    create(context: RuleContext<[NoticeOptions?]>) {
        const {
            resolvedTemplate,
            mustMatch,
            chars,
            onNonMatchingHeader,
            nonMatchingTolerance,
            messages,
        } = resolveOptions(context.options[0], context.filename);

        const { sourceCode } = context;
        const text = sourceCode.getText().substring(0, chars);
        const firstComment = sourceCode.getAllComments()[0];
        return {
            Program(node: Node<'Program'>) {
                let topNode: Node;
                let hasHeaderComment = false;
                if (!firstComment) {
                    topNode = node;
                } else if (firstComment.loc!.start.line <= node.loc!.start.line) {
                    hasHeaderComment = true;
                    topNode = firstComment as unknown as Node;
                } else {
                    topNode = node;
                }
                let headerMatches = false;
                if (!headerMatches && mustMatch && text) {
                    headerMatches = Boolean(String(text).replace(/\r\n/g, '\n').match(mustMatch));
                    // If the header matches, return early
                    if (headerMatches) {
                        return;
                    }
                }
                // If chars doesn't match, a header comment/template exists and nonMatchingTolerance is set,
                // try calculating string distance
                if (!headerMatches && hasHeaderComment && resolvedTemplate && typeof nonMatchingTolerance === 'number') {
                    const similarity = similarityRatio(resolvedTemplate, firstComment!.value as string);
                    // Return early, mark as true for future work if needed
                    if (nonMatchingTolerance <= similarity) {
                        headerMatches = true;
                        return;
                    }
                    const fix = createFixer({
                        resolvedTemplate,
                        hasHeaderComment,
                        topNode,
                        onNonMatchingHeader,
                    });
                    context.report({
                        node,
                        message: messages.whenOutsideTolerance,
                        fix,
                        data: { similarity: Math.round(similarity * 1000) / 1000 },
                    } as never);
                    return;
                }
                // report and skip
                if (hasHeaderComment && onNonMatchingHeader === 'report' && !headerMatches) {
                    context.report({
                        node,
                        message: messages.reportAndSkip,
                    });
                    return;
                }
                // Select fixer based off onNonMatchingHeader
                const fix = createFixer({
                    resolvedTemplate,
                    hasHeaderComment,
                    topNode,
                    onNonMatchingHeader,
                });
                if (!headerMatches) {
                    context.report({ node, message: messages.whenFailedToMatch, fix } as never);
                }
            },
        };
    },
};

export default rule;
