/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 */

/**
 * Check whether a given character is an emoji modifier.
 * @param code The character code to check.
 * @returns `true` if the character is an emoji modifier.
 */
export default function isEmojiModifier(code: number) {
    return code >= 0x1f3fb && code <= 0x1f3ff;
}
