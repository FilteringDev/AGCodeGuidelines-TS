/**
 * @file Contracts for the pinned CommonJS polyfills used by React rules.
 */
declare module 'array-includes' {
    /**
     * Search an array-like value using the upstream includes semantics.
     * @param values The values to search.
     * @param search The value to find.
     * @param [fromIndex] The first index to inspect.
     * @returns Whether the value is present.
     */
    function includes(values: ArrayLike<unknown>, search: unknown, fromIndex?: number): boolean;
    export = includes;
}
declare module 'array.prototype.findlast' {
    function findLast<T>(
        values: readonly T[],
        predicate: (value: T, index: number, values: readonly T[]) => unknown,
    ): T | undefined;
    export = findLast;
}
declare module 'array.prototype.flatmap' {
    function flatMap<T, U>(
        values: readonly T[],
        callback: (value: T, index: number, values: readonly T[]) => U | readonly U[],
    ): U[];
    export = flatMap;
}
declare module 'array.prototype.tosorted' {
    function toSorted<T>(values: readonly T[], compare?: (left: T, right: T) => number): T[];
    export = toSorted;
}
declare module 'object.entries' {
    function entries<T>(object: Record<string, T>): [string, T][];
    export = entries;
}
declare module 'object.values' {
    function values<T>(object: Record<string, T>): T[];
    export = values;
}
declare module 'object.fromentries' {
    function fromEntries<T>(entries: Iterable<readonly [PropertyKey, T]>): Record<string, T>;
    export = fromEntries;
}
declare module 'object.fromentries/polyfill.js' {
    function getPolyfill(): typeof import('object.fromentries');
    export = getPolyfill;
}
declare module 'string.prototype.repeat' {
    function repeat(value: string, count: number): string;
    export = repeat;
}
declare module 'string.prototype.matchall' {
    function matchAll(value: string, expression: RegExp): IterableIterator<RegExpExecArray>;
    export = matchAll;
}
declare module 'es-iterator-helpers/Iterator.from' {
    function from<T>(input: Iterator<T> | Iterable<T>): IterableIterator<T>;
    export = from;
}
declare module 'es-iterator-helpers/Iterator.prototype.map' {
    function map<T, U>(
        input: Iterator<T>,
        callback: (value: T, index: number) => U,
    ): IterableIterator<U>;
    export = map;
}
declare module 'es-iterator-helpers/Iterator.prototype.flatMap' {
    function flatMap<T, U>(
        input: Iterator<T>,
        callback: (value: T, index: number) => Iterator<U> | Iterable<U>,
    ): IterableIterator<U>;
    export = flatMap;
}
declare module 'es-iterator-helpers/Iterator.prototype.filter' {
    function filter<T>(
        input: Iterator<T>,
        callback: (value: T, index: number) => unknown,
    ): IterableIterator<T>;
    export = filter;
}
declare module 'es-iterator-helpers/Iterator.prototype.find' {
    function find<T>(input: Iterator<T>, callback: (value: T, index: number) => unknown): T | undefined;
    export = find;
}
declare module 'es-iterator-helpers/Iterator.prototype.forEach' {
    function forEach<T>(input: Iterator<T>, callback: (value: T, index: number) => void): void;
    export = forEach;
}
declare module 'es-iterator-helpers/Iterator.prototype.some' {
    function some<T>(input: Iterator<T>, callback: (value: T, index: number) => unknown): boolean;
    export = some;
}
declare module 'jsx-ast-utils' {
    type Node = import('./types').Node;
    interface PropOptions {
        spreadStrict?: boolean;
        ignoreCase?: boolean;
    }
    function elementType(node: Node): string;
    function propName(node: Node): string;
    function getProp(
        attributes: readonly Node[],
        name: string,
        options?: PropOptions,
    ): import('./types').Node<'JSXAttribute'> | undefined;
    function hasProp(attributes: readonly Node[], name: string, options?: PropOptions): boolean;
    function hasAnyProp(
        attributes: readonly Node[],
        names: string | string[],
        options?: PropOptions,
    ): boolean;
    function hasEveryProp(
        attributes: readonly Node[],
        names: string | string[],
        options?: PropOptions,
    ): boolean;
    function getPropValue(attribute: Node | undefined): unknown;
    function getLiteralPropValue(attribute: Node | undefined): unknown;
    const eventHandlers: readonly string[];
}
declare module 'jsx-ast-utils/elementType.js' {
    const elementType: typeof import('jsx-ast-utils').elementType;
    export = elementType;
}
declare module 'jsx-ast-utils/propName.js' {
    const propName: typeof import('jsx-ast-utils').propName;
    export = propName;
}
declare module 'jsx-ast-utils/getProp.js' {
    const getProp: typeof import('jsx-ast-utils').getProp;
    export = getProp;
}
declare module 'jsx-ast-utils/hasProp.js' {
    const hasProp: typeof import('jsx-ast-utils').hasProp;
    export = hasProp;
}
declare module 'jsx-ast-utils/getLiteralPropValue.js' {
    const getLiteralPropValue: typeof import('jsx-ast-utils').getLiteralPropValue;
    export = getLiteralPropValue;
}
