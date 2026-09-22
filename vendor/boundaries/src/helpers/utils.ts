/** @file Small type and template helpers. */

/**
 * Check for a string value.
 * @param value The value to inspect.
 * @returns Whether the value is a string.
 */
export function isString(value: unknown): value is string {
    return typeof value === 'string';
}

/**
 * Check for an array value.
 * @param value The value to inspect.
 * @returns Whether the value is an array.
 */
export function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

/**
 * Check for a plain object value.
 * @param value The value to inspect.
 * @returns Whether the value is a non-null, non-array object.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Return the value when it is an array.
 * @param value The value to inspect.
 * @returns The array or null.
 */
export function getArrayOrNull<T>(value: T | T[] | null | undefined): T[] | null {
    return Array.isArray(value) ? (value as T[]) : null;
}

/**
 * Replace a single namespaced template placeholder.
 * @param template The template text.
 * @param key The placeholder key.
 * @param value The replacement value.
 * @param namespace The placeholder namespace.
 * @returns The replaced text.
 */
function replaceObjectValueInTemplate(template: string, key: string, value: string, namespace?: string): string {
    const keyToReplace = namespace ? `${namespace}.${key}` : key;
    const regexp = new RegExp(`\\$\\{${keyToReplace}\\}`, 'g');
    return template.replace(regexp, value);
}

/**
 * Replace namespaced template placeholders in patterns.
 * @param strings The pattern or patterns.
 * @param object The values object.
 * @param namespace The placeholder namespace.
 * @returns The replaced patterns.
 */
export function replaceObjectValuesInTemplates(
    strings: string | string[],
    object: Record<string, string>,
    namespace?: string,
): string | string[] {
    return Object.keys(object).reduce<string | string[]>((result, objectKey) => {
        // If template is an array, replace key by value in all patterns
        if (Array.isArray(result)) {
            return result.map((resultEntry) => replaceObjectValueInTemplate(
                resultEntry,
                objectKey,
                object[objectKey]!,
                namespace,
            ));
        }
        return replaceObjectValueInTemplate(result, objectKey, object[objectKey]!, namespace);
    }, strings);
}
