/** @file Parse dependency modules with Oxc for the isolated import rules. */
import { parseSync, visitorKeys } from 'oxc-parser';

/**
 * Parse a remote file and attach the ESTree positions consumed by import rules.
 * @param code - Dependency source text.
 * @param options - Source identity and module semantics.
 * @param options.filePath - Dependency filename used to select its syntax.
 * @param options.sourceType - Explicit module semantics, defaulting to module.
 * @returns ESTree program with comments and source locations.
 */
export function parseRemote(
    code: string,
    options: {
        filePath: string;
        sourceType?: 'module' | 'script' | 'commonjs';
    },
): object {
    const parsed = parseSync(options.filePath, code, {
        sourceType: options.sourceType ?? 'module',
        range: true,
        preserveParens: false,
    });
    const starts = [0];
    for (const match of code.matchAll(/\r\n|[\r\n\u2028\u2029]/gu)) {
        starts.push(match.index + match[0].length);
    }
    const location = (offset: number) => {
        let low = 0;
        let high = starts.length;
        while (low + 1 < high) {
            const middle = Math.floor((low + high) / 2);
            if (starts[middle]! <= offset) {
                low = middle;
            } else {
                high = middle;
            }
        }
        return { line: low + 1, column: offset - starts[low]! };
    };
    if (parsed.errors.length) {
        const error = parsed.errors[0]!;
        const position = location(error.labels[0]?.start ?? 0);
        throw Object.assign(new SyntaxError(error.message), { lineNumber: position.line, column: position.column });
    }
    const visit = (node: Record<string, unknown>) => {
        if (typeof node.start === 'number' && typeof node.end === 'number') {
            node.loc = { start: location(node.start), end: location(node.end) };
            node.range = [node.start, node.end];
        }
        for (const key of visitorKeys[String(node.type)] ?? []) {
            const value = node[key];
            for (const child of Array.isArray(value) ? value : [value]) {
                if (child && typeof child === 'object') {
                    visit(child);
                }
            }
        }
    };
    const ast = parsed.program as unknown as Record<string, unknown>;
    visit(ast);
    const comments = parsed.comments as unknown as Record<string, unknown>[];
    comments.forEach(visit);
    return Object.assign(ast, { comments, tokens: [] });
}

export const remoteParser = { parse: parseRemote, VisitorKeys: visitorKeys };
