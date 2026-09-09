/** @file Read leading documentation from parsed dependency files without a lint engine. */
interface Ranged {
    range: readonly [number, number];
}

interface ParsedFile {
    comments: Ranged[];
    tokens?: Ranged[];
}

/** The import rules only need leading comments when inspecting another module. */
export class RemoteSourceCode {
    private readonly text: string;

    private readonly ast: ParsedFile;

    constructor(options: { text: string; ast: ParsedFile }) {
        this.ast = options.ast;
        this.text = options.text;
    }

    /**
     * Return adjacent leading comments, stopping at the preceding code token.
     * @param node - Declaration whose leading comments are requested.
     * @returns Adjacent comments in source order.
     */
    getCommentsBefore(node: Ranged): Ranged[] {
        const comments: Ranged[] = [];
        let start = node.range[0];
        for (const comment of this.ast.comments.toReversed()) {
            if (comment.range[1] > start) {
                continue;
            }
            if (this.text.slice(comment.range[1], start).trim()) {
                break;
            }
            comments.unshift(comment);
            [start] = comment.range;
        }
        return comments;
    }
}
