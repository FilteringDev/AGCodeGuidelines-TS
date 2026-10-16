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

// Rule contexts are immutable per file; reuse each object's serialization across lookups.
const serializedSettings = new WeakMap<object, string>();
const serializedOptions = new WeakMap<object, string>();

/**
 * Serialize an object once.
 * @param cache Serializations keyed by object identity.
 * @param value The object to serialize.
 * @param replacer Optional JSON replacer.
 * @returns The JSON text.
 */
function serialize(
    cache: WeakMap<object, string>,
    value: object,
    replacer?: (key: string, value: unknown) => unknown,
): string {
    let text = cache.get(value);
    if (text === undefined) {
        text = JSON.stringify(value, replacer);
        cache.set(value, text);
    }
    return text;
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

    const settingsText = serialize(serializedSettings, settings);
    if (settingsText !== prevSettings) {
        settingsHash = hashObject({ settings }).digest('hex');
        prevSettings = settingsText;
    }

    // We'll use either a combination of `parserOptions` and `parserPath` or `languageOptions`
    // to construct the cache key, depending on whether this is using a flat config or not.
    let optionsToken;
    if (!parserPath && languageOptions) {
        const optionsText = serialize(serializedOptions, languageOptions, stringifyReplacerFn);
        if (optionsText !== prevOptions) {
            optionsHash = hashObject({ languageOptions }).digest('hex');
            prevOptions = optionsText;
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
