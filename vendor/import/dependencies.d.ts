/**
 * @file Contracts for the pinned CommonJS helpers without published declarations.
 */
declare module 'is-core-module' {
    function isCoreModule(name: string, nodeVersion?: string | null): boolean;
    export = isCoreModule;
}
declare module 'object.groupby' {
    function groupBy<Value, Key extends PropertyKey>(
        values: Iterable<Value>,
        key: (value: Value, index: number) => Key,
    ): Partial<Record<Key, Value[]>>;
    export = groupBy;
}
declare module 'string.prototype.trimend' {
    function trimEnd(value: string): string;
    export = trimEnd;
}
declare module 'eslint-import-resolver-node' {
    export const interfaceVersion: 2;
    export function resolve(
        modulePath: string,
        sourceFile: string,
        config: unknown,
    ): import('./types').ResolvedResult;
}
