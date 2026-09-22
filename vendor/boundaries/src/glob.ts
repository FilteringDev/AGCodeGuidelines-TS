/** @file Glob matching for boundary element patterns. */
import minimatch from 'minimatch';

/**
 * Test a path against a glob pattern.
 * @param path The file path.
 * @param pattern The glob pattern.
 * @returns Whether the path matches.
 */
export function isMatch(path: string, pattern: string | string[]): boolean {
    if (Array.isArray(pattern)) {
        return pattern.some((entry) => minimatch(path, entry, { dot: true }));
    }
    return minimatch(path, pattern, { dot: true });
}

/**
 * Escape a literal character for RegExp.
 * @param value The character.
 * @returns The escaped character.
 */
function escapeRegExpChar(value: string): string {
    return value.replace(/[.+^${}()|[\]\\]/u, '\\$&');
}

/**
 * Compile a single path segment to a RegExp source.
 * @param segment The glob segment without slashes.
 * @returns The equivalent expression.
 */
function compileSegment(segment: string): string {
    let source = '';
    for (let index = 0; index < segment.length; index += 1) {
        const char = segment[index]!;
        if (char === '*') {
            source += '([^/]*)';
        } else if (char === '?') {
            source += '([^/])';
        } else if (char === '[') {
            const closing = segment.indexOf(']', index + 1);
            if (closing === -1) {
                source += '\\[';
            } else {
                source += `(${segment.slice(index, closing + 1)})`;
                index = closing;
            }
        } else {
            source += escapeRegExpChar(char);
        }
    }
    return source;
}

/**
 * Compile a glob pattern to an anchored RegExp source with captures.
 * Minimatch's makeRe cannot emulate micromatch.capture: its compiled
 * expression for patterns like `test/**` + `/*` requires two or more path
 * levels, while segment-wise matching accepts a single file. A dedicated
 * compiler keeps capture consistent with isMatch.
 * @param pattern The glob pattern.
 * @returns The anchored equivalent expression.
 */
function compilePattern(pattern: string): string {
    const segments = pattern.split('/');
    let source = '^';
    let needSlash = false;
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index]!;
        const isFirst = index === 0;
        const isLast = index === segments.length - 1;
        if (segment === '**') {
            if (isLast) {
                source += isFirst ? '(.*)' : '(?:/(.*))?';
                needSlash = false;
            } else {
                if (needSlash) {
                    source += '/';
                    needSlash = false;
                }
                source += '(?:.*/)?';
            }
        } else {
            if (needSlash) {
                source += '/';
            }
            source += compileSegment(segment);
            needSlash = true;
        }
    }
    return `${source}$`;
}

/**
 * Capture glob groups from a path, emulating micromatch.capture.
 * @param pattern The glob pattern with captures.
 * @param path The file path.
 * @returns The captured groups or null.
 */
export function capture(pattern: string, path: string): string[] | null {
    if (!isMatch(path, pattern)) {
        return null;
    }
    const match = new RegExp(compilePattern(pattern)).exec(path);
    if (!match) {
        return [];
    }
    return match.slice(1);
}

/**
 * Build a RegExp from a glob pattern.
 * @param pattern The glob pattern.
 * @returns The equivalent regular expression.
 */
export function makeRe(pattern: string): RegExp {
    return new RegExp(compilePattern(pattern));
}
