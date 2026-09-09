/** @file Store desired indentation offsets by source index. */
import type { Token } from '../../../../types';

export type IndentMode = number | 'first' | 'off';
export interface OffsetDescriptor {
    offset?: IndentMode;
    from: Token | null;
    force?: boolean;
}

class IndexMap {
    declare private values: Array<OffsetDescriptor | undefined>;

    /**
     * Creates an empty map
     * @param maxKey The maximum key
     */
    constructor(maxKey: number) {
        // Initializing the array with the maximum expected size avoids dynamic reallocations that could degrade
        // performance.
        this.values = Array(maxKey + 1);
    }

    /**
     * Inserts an entry into the map.
     * @param key The entry's key
     * @param value The entry's value
     */
    insert(key: number, value: OffsetDescriptor | undefined) {
        this.values[key] = value;
    }

    /**
     * Finds the value of the entry with the largest key less than or equal to the provided key
     * @param key The provided key
     * @returns The value of the found entry, or undefined if no such entry exists.
     */
    findLastNotAfter(key: number): OffsetDescriptor | undefined {
        const { values } = this;

        for (let index = key; index >= 0; index -= 1) {
            const value = values[index];

            if (value) {
                return value;
            }
        }
        return undefined;
    }

    /**
     * Deletes all of the keys in the interval [start, end)
     * @param start The start of the range
     * @param end The end of the range
     */
    deleteRange(start: number, end: number) {
        this.values.fill(undefined, start, end);
    }
}

export default IndexMap;
