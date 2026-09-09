import type {
    ImportMetadata,
    ReexportMetadata,
    ParseError,
    ExportGetter,
    ExportMetadata,
} from '../../export-types';
import type { VisitorKeys, RuleContext, Node } from '../../types';

export default class ExportMap {
    path: string;

    namespace: Map<string, ExportMetadata>;

    reexports: Map<string, ReexportMetadata>;

    dependencies: Set<ExportGetter>;

    imports: Map<string, ImportMetadata>;

    errors: ParseError[];

    parseGoal: 'ambiguous' | 'Module' | 'Script';

    mtime?: Date;

    visitorKeys?: VisitorKeys | null;

    doc?: ExportMetadata['doc'];

    constructor(path: string) {
        this.path = path;
        this.namespace = new Map();
        // todo: restructure to key on path, value is resolver + map of names
        this.reexports = new Map();
        /**
         * star-exports
         */
        this.dependencies = new Set();
        /**
         * dependencies of this module that are not explicitly re-exported
         */
        this.imports = new Map();
        this.errors = [];
        /**
         * type {'ambiguous' | 'Module' | 'Script'}
         */
        this.parseGoal = 'ambiguous';
    }

    hasDefault() {
        return this.get('default') != null;
    } // stronger than this.has

    getSize(): number {
        let size = this.namespace.size + this.reexports.size;
        this.dependencies.forEach((dep) => {
            const d = dep();
            // CJS / ignored dependencies won't exist (#717)
            if (d == null) {
                return;
            }
            size += d.getSize();
        });
        return size;
    }

    /**
     * Note that this does not check explicitly re-exported names for existence
     * in the base namespace, but it will expand all `export * from '...'` exports
     * if not found in the explicit namespace.
     * @param  name The  value.
     * @returns true if `name` is exported by this module.
     */
    has(name: string): boolean {
        if (this.namespace.has(name)) {
            return true;
        }
        if (this.reexports.has(name)) {
            return true;
        }

        // default exports must be explicitly re-exported (#328)
        if (name !== 'default') {
            const entryIterator0 = this.dependencies[Symbol.iterator]();
            for (
                let entryStep1 = entryIterator0.next();
                !entryStep1.done;
                entryStep1 = entryIterator0.next()
            ) {
                const dep = entryStep1.value;
                const innerMap = dep();

                // todo: report as unresolved?
                if (innerMap) {
                    if (innerMap.has(name)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * ensure that imported name fully resolves.
     * @param  name The  value.
     * @returns The result of this check.
     */
    hasDeep(name: string): { found: boolean; path: ExportMap[] } {
        if (this.namespace.has(name)) {
            return { found: true, path: [this] };
        }

        if (this.reexports.has(name)) {
            const reexports = this.reexports.get(name)!;
            const imported = reexports.getImport();

            // if import is ignored, return explicit 'null'
            if (imported == null) {
                return { found: true, path: [this] };
            }

            // safeguard against cycles, only if name matches
            if (imported.path === this.path && reexports.local === name) {
                return { found: false, path: [this] };
            }

            const deep = imported.hasDeep(reexports.local);
            deep.path.unshift(this);

            return deep;
        }

        // default exports must be explicitly re-exported (#328)
        if (name !== 'default') {
            const entryIterator1 = this.dependencies[Symbol.iterator]();
            for (
                let entryStep2 = entryIterator1.next();
                !entryStep2.done;
                entryStep2 = entryIterator1.next()
            ) {
                const dep = entryStep2.value;
                const innerMap = dep();
                if (innerMap == null) {
                    return { found: true, path: [this] };
                }
                // todo: report as unresolved?
                if (innerMap) {
                    // safeguard against cycles
                    if (!(innerMap.path === this.path)) {
                        const innerValue = innerMap.hasDeep(name);
                        if (innerValue.found) {
                            innerValue.path.unshift(this);
                            return innerValue;
                        }
                    }
                }
            }
        }

        return { found: false, path: [this] };
    }

    get(name: string): ExportMetadata | null | undefined {
        if (this.namespace.has(name)) {
            return this.namespace.get(name);
        }

        if (this.reexports.has(name)) {
            const reexports = this.reexports.get(name)!;
            const imported = reexports.getImport();

            // if import is ignored, return explicit 'null'
            if (imported == null) {
                return null;
            }

            // safeguard against cycles, only if name matches
            if (imported.path === this.path && reexports.local === name) {
                return undefined;
            }

            return imported.get(reexports.local);
        }

        // default exports must be explicitly re-exported (#328)
        if (name !== 'default') {
            const entryIterator2 = this.dependencies[Symbol.iterator]();
            for (
                let entryStep3 = entryIterator2.next();
                !entryStep3.done;
                entryStep3 = entryIterator2.next()
            ) {
                const dep = entryStep3.value;
                const innerMap = dep();
                // todo: report as unresolved?
                if (innerMap) {
                    // safeguard against cycles
                    if (!(innerMap.path === this.path)) {
                        const innerValue = innerMap.get(name);
                        if (innerValue !== undefined) {
                            return innerValue;
                        }
                    }
                }
            }
        }

        return undefined;
    }

    forEach(
        callback: (value: ExportMetadata | null | undefined, name: string, map: ExportMap) => void,
        thisArg?: unknown,
    ) {
        this.namespace.forEach((v, n) => {
            callback.call(thisArg, v, n, this);
        });

        this.reexports.forEach((reexports, name) => {
            const reexported = reexports.getImport();
            // can't look up meta for ignored re-exports (#348)
            callback.call(thisArg, reexported && reexported.get(reexports.local), name, this);
        });

        this.dependencies.forEach((dep) => {
            const d = dep();
            // CJS / ignored dependencies won't exist (#717)
            if (d == null) {
                return;
            }

            d.forEach((v, n) => {
                if (n !== 'default') {
                    callback.call(thisArg, v, n, this);
                }
            });
        });
    }

    // todo: keys, values, entries?

    reportErrors(context: RuleContext, declaration: Node) {
        const msg = this.errors.map((e) => `${e.message} (${e.lineNumber}:${e.column})`).join(', ');
        context.report({
            node: declaration.source!,
            message: `Parse errors in imported module '${declaration.source!.value}': ${msg}`,
        });
    }
}
