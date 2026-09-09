/**
 * @file Enumerate inherited configuration keys while respecting property shadowing.
 */
/**
 * Collect enumerable string keys in prototype order, as configuration for-in loops do.
 * @param value The configuration object.
 * @returns Enumerable keys with each property name included once.
 */
export default function enumerableKeys(value: object | null | undefined): string[] {
    const keys: string[] = [];
    const seen = new Set<string>();
    let current = value;
    while (current != null) {
        const owner = current;
        Object.getOwnPropertyNames(owner).forEach((key) => {
            if (!seen.has(key)) {
                seen.add(key);
                if (Object.prototype.propertyIsEnumerable.call(owner, key)) {
                    keys.push(key);
                }
            }
        });
        current = Object.getPrototypeOf(owner) as object | null;
    }
    return keys;
}
