import { extname } from 'node:path';
import debug from 'debug';
import enumerableKeys from './enumerableKeys';
import type { ImportSettings, ParserContext } from '../types';

const log = debug('eslint-plugin-import:utils:ignore');

// one-shot memoized
let cachedSet: Set<string> | undefined;
let lastSettings: ImportSettings | undefined;

/**
 * Make valid extension set.
 * @param settings The settings value.
 * @returns The result of this check.
 */
function makeValidExtensionSet(settings: ImportSettings) {
    // start with explicit JS-parsed extensions

    const exts = new Set(settings['import/extensions'] || ['.js', '.mjs', '.cjs']);

    // all alternate parser extensions are also valid
    if ('import/parsers' in settings) {
        enumerableKeys(settings['import/parsers']).forEach((parser) => {
            const parserSettings = settings['import/parsers']![parser];
            if (!Array.isArray(parserSettings)) {
                throw new TypeError(`"settings" for ${parser} must be an array`);
            }
            parserSettings.forEach((ext) => exts.add(ext));
        });
    }

    return exts;
}
export { makeValidExtensionSet as getFileExtensions };

/**
 * Valid extensions.
 * @param context The rule context.
 * @returns The result of this check.
 */
function validExtensions(context: ParserContext) {
    if (cachedSet && context.settings === lastSettings) {
        return cachedSet;
    }

    lastSettings = context.settings;
    cachedSet = makeValidExtensionSet(context.settings);
    return cachedSet;
}

/**
 * Has valid extension.
 * @param path The path value.
 * @param context The rule context.
 * @returns The result of this check.
 */
function hasValidExtension(path: string, context: ParserContext) {
    return validExtensions(context).has(extname(path));
}
export { hasValidExtension };

/**
 * Ignore.
 * @param path The path value.
 * @param context The rule context.
 * @returns The result of this check.
 */
export default function ignore(path: string, context: ParserContext) {
    // check extension whitelist first (cheap)
    if (!hasValidExtension(path, context)) {
        return true;
    }

    if (!('import/ignore' in context.settings)) {
        return false;
    }
    const ignoreStrings = context.settings['import/ignore']!;

    for (let i = 0; i < ignoreStrings.length; i += 1) {
        const regex = new RegExp(ignoreStrings[i]!);
        if (regex.test(path)) {
            log(`ignoring ${path}, matched pattern /${ignoreStrings[i]}/`);
            return true;
        }
    }

    return false;
}
