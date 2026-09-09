/**
 * @file Read the pinned iterator helpers through their published CommonJS exports.
 */
import { createRequire } from 'node:module';

const requireExternal = createRequire(import.meta.url);
const from = requireExternal(
    'es-iterator-helpers/Iterator.from',
) as typeof import('es-iterator-helpers/Iterator.from');
const map = requireExternal(
    'es-iterator-helpers/Iterator.prototype.map',
) as typeof import('es-iterator-helpers/Iterator.prototype.map');
const flatMap = requireExternal(
    'es-iterator-helpers/Iterator.prototype.flatMap',
) as typeof import('es-iterator-helpers/Iterator.prototype.flatMap');
const filter = requireExternal(
    'es-iterator-helpers/Iterator.prototype.filter',
) as typeof import('es-iterator-helpers/Iterator.prototype.filter');
const find = requireExternal(
    'es-iterator-helpers/Iterator.prototype.find',
) as typeof import('es-iterator-helpers/Iterator.prototype.find');
const forEach = requireExternal(
    'es-iterator-helpers/Iterator.prototype.forEach',
) as typeof import('es-iterator-helpers/Iterator.prototype.forEach');
const some = requireExternal(
    'es-iterator-helpers/Iterator.prototype.some',
) as typeof import('es-iterator-helpers/Iterator.prototype.some');

export {
    from, map, flatMap, filter, find, forEach, some,
};
