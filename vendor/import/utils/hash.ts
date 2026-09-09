import type { Hash } from 'node:crypto';
import { createHash } from 'node:crypto';

/**
 * utilities for hashing config objects.
 * basically iteratively updates hash with a JSON-like format
 */

const { stringify } = JSON;

/**
 * Hashify.
 * @param value The value to inspect.
 * @param [initialHash] The initial hash value.
 * @returns The result of this check.
 */
function hashify(value: unknown, initialHash?: Hash) {
    let hash = initialHash;

    if (!hash) {
        hash = createHash('sha256');
    }

    if (Array.isArray(value)) {
        hashify.array(value, hash);
    } else if (typeof value === 'function') {
        hash.update(String(value));
    } else if (value instanceof Object) {
        hashify.object(value, hash);
    } else {
        hash.update(stringify(value) || 'undefined');
    }

    return hash;
}
export default hashify;

/**
 * Hash array.
 * @param array The array value.
 * @param [initialHash] The initial hash value.
 * @returns The result of this check.
 */
function hashArray(array: readonly unknown[], initialHash?: Hash) {
    let hash = initialHash;

    if (!hash) {
        hash = createHash('sha256');
    }

    hash.update('[');
    for (let i = 0; i < array.length; i += 1) {
        hashify(array[i], hash);
        hash.update(',');
    }
    hash.update(']');

    return hash;
}
hashify.array = hashArray;
export { hashArray };

/**
 * Hash object.
 * @param object The object value.
 * @param [optionalHash] The optional hash value.
 * @returns The result of this check.
 */
function hashObject(object: object, optionalHash?: Hash) {
    const hash = optionalHash || createHash('sha256');

    hash.update('{');
    Object.keys(object)
        .sort()
        .forEach((key) => {
            hash.update(stringify(key));
            hash.update(':');

            hashify((object as Record<string, unknown>)[key], hash);
            hash.update(',');
        });
    hash.update('}');

    return hash;
}
hashify.object = hashObject;
export { hashObject };
