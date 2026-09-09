/**
 * @file Utilities to operate on strings.
 * @author Stephen Wade
 */
import * as graphemer from 'graphemer';
import type Graphemer from 'graphemer';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

// Node exposes the CommonJS export object; bundlers can unwrap its default class.
const imported: unknown = graphemer.default;
const GraphemerConstructor = (
    typeof imported === 'function'
        ? imported
        : (imported as { default: typeof Graphemer }).default
) as typeof Graphemer;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const ASCII_REGEX = /^\p{ASCII}*$/u;

let splitter: Graphemer | undefined;

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Converts the first letter of a string to uppercase.
 * @param string The string to operate on
 * @returns The converted string
 */
function upperCaseFirst(string: string) {
    if (string.length <= 1) {
        return string.toUpperCase();
    }
    return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Counts graphemes in a given string.
 * @param value A string to count graphemes.
 * @returns The number of graphemes in `value`.
 */
function getGraphemeCount(value: string) {
    if (ASCII_REGEX.test(value)) {
        return value.length;
    }

    if (!splitter) {
        splitter = new GraphemerConstructor();
    }

    return splitter.countGraphemes(value);
}

export default {
    upperCaseFirst,
    getGraphemeCount,
};
