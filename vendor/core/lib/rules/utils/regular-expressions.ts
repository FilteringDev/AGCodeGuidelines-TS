/**
 * @file Common utils for regular expressions.
 * @author Josh Goldberg
 * @author Toru Nagashima
 */
import * as dependency0 from '@eslint-community/regexpp';

const { RegExpValidator } = dependency0;

const REGEXPP_LATEST_ECMA_VERSION = 2024;

/**
 * Checks if the given regular expression pattern would be valid with the `u` flag.
 * @param ecmaVersion ECMAScript version to parse in.
 * @param pattern The regular expression pattern to verify.
 * @returns `true` if the pattern would be valid with the `u` flag.
 * `false` if the pattern would be invalid with the `u` flag or the configured
 * ecmaVersion doesn't support the `u` flag.
 */
function isValidWithUnicodeFlag(ecmaVersion: number, pattern: string) {
    if (ecmaVersion <= 5) {
        // ecmaVersion <= 5 doesn't support the 'u' flag
        return false;
    }

    const validator = new RegExpValidator({
        // The parser supplies a valid ECMAScript edition; cap it to the supported range.
        ecmaVersion: Math.min(ecmaVersion, REGEXPP_LATEST_ECMA_VERSION) as NonNullable<
            ConstructorParameters<typeof RegExpValidator>[0]
        >['ecmaVersion'],
    });

    try {
        validator.validatePattern(pattern, undefined, undefined, {
            unicode: /* uFlag = */ true,
        });
    } catch {
        return false;
    }

    return true;
}

export default {
    isValidWithUnicodeFlag,
    REGEXPP_LATEST_ECMA_VERSION,
};
