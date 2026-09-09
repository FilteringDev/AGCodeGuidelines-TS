import type { ParserContext } from '../../types';
import { hashObject } from '../../utils/hash';

let optionsHash = '';
let prevOptions: string | undefined = '';
let settingsHash = '';
let prevSettings: string | undefined = '';

// Replacer function helps us with serializing the parser nested within `languageOptions`.

/**
 * Stringify replacer fn.
 * @param _ The _ value.
 * @param value The value to inspect.
 * @returns The result of this check.
 */
function stringifyReplacerFn(_: string, value: unknown) {
    if (typeof value === 'function') {
        return String(value);
    }
    return value;
}

/**
 * don't hold full context object in memory, just grab what we need.
 * also calculate a cacheKey, where parts of the cacheKey hash are memoized
 * @param path The path value.
 * @param context The rule context.
 * @returns The result of this check.
 */
export default function childContext(path: string, context: ParserContext) {
    const {
        settings, parserOptions, parserPath, languageOptions,
    } = context;

    if (JSON.stringify(settings) !== prevSettings) {
        settingsHash = hashObject({ settings }).digest('hex');
        prevSettings = JSON.stringify(settings);
    }

    // We'll use either a combination of `parserOptions` and `parserPath` or `languageOptions`
    // to construct the cache key, depending on whether this is using a flat config or not.
    let optionsToken;
    if (!parserPath && languageOptions) {
        if (JSON.stringify(languageOptions, stringifyReplacerFn) !== prevOptions) {
            optionsHash = hashObject({ languageOptions }).digest('hex');
            prevOptions = JSON.stringify(languageOptions, stringifyReplacerFn);
        }
        // For languageOptions, we're just using the hashed options as the options token
        optionsToken = optionsHash;
    } else {
        if (JSON.stringify(parserOptions) !== prevOptions) {
            optionsHash = hashObject({ parserOptions }).digest('hex');
            prevOptions = JSON.stringify(parserOptions);
        }
        // When not using flat config, we use a combination of the hashed parserOptions
        // and parserPath as the token
        optionsToken = String(parserPath) + optionsHash;
    }

    return {
        cacheKey: optionsToken + settingsHash + String(path),
        settings,
        parserOptions,
        parserPath,
        path,
        languageOptions,
    };
}
