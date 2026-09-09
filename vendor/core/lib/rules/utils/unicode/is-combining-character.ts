/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 */

/**
 * Check whether a given character is a combining mark or not.
 * @param codePoint The character code to check.
 * @returns `true` if the character belongs to the category, any of `Mc`, `Me`, and `Mn`.
 */
export default function isCombiningCharacter(codePoint: number) {
    return /^[\p{Mc}\p{Me}\p{Mn}]$/u.test(String.fromCodePoint(codePoint));
}
