/**
 * Check if the first letter of a string is capitalized.
 * @param word String to check
 * @returns True if first letter is capitalized.
 */
export default function isFirstLetterCapitalized(word: string | null | undefined) {
    if (!word) {
        return false;
    }
    const firstLetter = word.replace(/^_+/, '').charAt(0);
    return firstLetter.toUpperCase() === firstLetter;
}
