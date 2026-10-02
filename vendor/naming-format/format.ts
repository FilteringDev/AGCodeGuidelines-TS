/**
 * Reject leading, trailing, and adjacent underscores as the upstream format checker does.
 * @param name - Identifier text.
 * @returns Whether underscore positions are valid.
 */
function validateUnderscores(name: string): boolean {
    if (name.startsWith('_')) {
        return false;
    }
    let wasUnderscore = false;
    for (let index = 1; index < name.length; index += 1) {
        if (name[index] === '_') {
            if (wasUnderscore) {
                return false;
            }
            wasUnderscore = true;
        } else {
            wasUnderscore = false;
        }
    }
    return !wasUnderscore;
}

/**
 * Check the upstream PascalCase format, including Unicode letters.
 * @param name - Identifier text.
 * @returns Whether the format matches.
 */
export function isPascalCase(name: string): boolean {
    return name.length === 0 || (name[0] === name[0]!.toUpperCase() && !name.includes('_'));
}

/**
 * Check the upstream camelCase format, including Unicode letters.
 * @param name - Identifier text.
 * @returns Whether the format matches.
 */
export function isCamelCase(name: string): boolean {
    return name.length === 0 || (name[0] === name[0]!.toLowerCase() && !name.includes('_'));
}

/**
 * Check the upstream UPPER_CASE format and underscore positions.
 * @param name - Identifier text.
 * @returns Whether the format matches.
 */
export function isUpperCase(name: string): boolean {
    return name.length === 0 || (name === name.toUpperCase() && validateUnderscores(name));
}
