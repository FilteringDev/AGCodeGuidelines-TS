/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 */

/**
 * Check whether a given character is a regional indicator symbol.
 * @param code The character code to check.
 * @returns `true` if the character is a regional indicator symbol.
 */
export default function isRegionalIndicatorSymbol(code: number) {
    return code >= 0x1f1e6 && code <= 0x1f1ff;
}
