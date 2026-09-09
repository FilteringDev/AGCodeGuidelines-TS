import doctrine from 'doctrine';
import enumerableKeys from '../../utils/enumerableKeys';
import type { Comment, Node } from '../../types';
import type RemoteSourceCode from '../../compat/remote-source';
import type { Documentation, ExportMetadata } from '../../export-types';

export type DocParser = (comments: Comment[]) => ExportMetadata['doc'];

/**
 * parse docs from the first node that has leading comments
 * @param source The source text.
 * @param docStyleParsers The doc style parsers value.
 * @param nodes The nodes to inspect.
 * @returns The result of this check.
 */
export function captureDoc(
    source: RemoteSourceCode<Comment>,
    docStyleParsers: Record<string, DocParser>,
    ...nodes: Node[]
) {
    const metadata: ExportMetadata = {};

    // 'some' short-circuits on first 'true'
    nodes.some((n) => {
        try {
            let leadingComments;

            // n.leadingComments is legacy `attachComments` behavior
            if ('leadingComments' in n) {
                leadingComments = n.leadingComments;
            } else if (n.range) {
                leadingComments = source.getCommentsBefore(n);
            }

            if (!leadingComments || leadingComments.length === 0) {
                return false;
            }

            enumerableKeys(docStyleParsers).forEach((name) => {
                const doc = docStyleParsers[name]!(leadingComments);
                if (doc) {
                    metadata.doc = doc;
                }
            });

            return true;
        } catch (err) {
            return false;
        }
    });

    return metadata;
}

/**
 * parse JSDoc from leading comments
 * @param comments The comments value.
 * @returns The result of this check.
 */
function captureJsDoc(comments: Comment[]) {
    let doc;

    // capture XSDoc
    comments.forEach((comment) => {
        // skip non-block comments
        if (comment.type !== 'Block') {
            return;
        }
        try {
            doc = doctrine.parse(comment.value, { unwrap: true });
        } catch (err) {
            /* don't care, for now? maybe add to `errors?` */
        }
    });

    return doc;
}

/**
 * parse TomDoc section from comments
 * @param comments The comments value.
 * @returns The result of this check.
 */
function captureTomDoc(comments: Comment[]): Documentation | undefined {
    // collect lines up to first paragraph break
    const lines = [];
    for (let i = 0; i < comments.length; i += 1) {
        const comment = comments[i]!;
        if (comment.value.match(/^\s*$/)) {
            break;
        }
        lines.push(comment.value.trim());
    }

    // return doctrine-like object
    const statusMatch = lines.join(' ').match(/^(Public|Internal|Deprecated):\s*(.+)/);
    if (statusMatch) {
        return {
            description: statusMatch[2],
            tags: [
                {
                    title: statusMatch[1]!.toLowerCase(),
                    description: statusMatch[2],
                },
            ],
        };
    }

    return undefined;
}

export const availableDocStyleParsers: Record<string, DocParser> = {
    jsdoc: captureJsDoc,
    tomdoc: captureTomDoc,
};
