/**
 * @file Read leading documentation from parsed dependency files without a lint engine.
 */
interface Ranged {
    range: readonly [number, number];
}

interface ParsedFile<LeadingComment extends Ranged> {
    comments: LeadingComment[];
    tokens?: Ranged[];
}

/**
 * The import rules only need leading comments when inspecting another module.
 */
export default class RemoteSourceCode<LeadingComment extends Ranged = Ranged> {
    private readonly text: string;

    private readonly ast: ParsedFile<LeadingComment>;

    constructor(options: { text: string; ast: ParsedFile<LeadingComment> }) {
        this.ast = options.ast;
        this.text = options.text;
    }

    /**
     * Return adjacent leading comments, stopping at the preceding code token.
     * @param node - Declaration whose leading comments are requested.
     * @returns Adjacent comments in source order.
     */
    getCommentsBefore(node: Ranged): LeadingComment[] {
        const comments: LeadingComment[] = [];
        let start = node.range[0];

        const entryIterator0 = this.ast.comments.toReversed()[Symbol.iterator]();
        for (
            let entryStep1 = entryIterator0.next();
            !entryStep1.done;
            entryStep1 = entryIterator0.next()
        ) {
            const comment = entryStep1.value;
            if (!(comment.range[1] > start)) {
                if (this.text.slice(comment.range[1], start).trim()) {
                    break;
                }
                comments.unshift(comment);
                [start] = comment.range;
            }
        }

        return comments;
    }
}
