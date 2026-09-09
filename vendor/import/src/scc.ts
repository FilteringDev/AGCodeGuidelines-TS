import calculateScc from '@rtsao/scc';
import type ExportMap from './exportMap/index';
import type { RuleContext, ChildContext } from '../types';
import { hashObject } from '../utils/hash';
import resolve from '../utils/resolve';
import ExportMapBuilder from './exportMap/builder';
import childContext from './exportMap/childContext';

let cache = new Map<string, Record<string, number>>();

export default class StronglyConnectedComponentsBuilder {
    static clearCache() {
        cache = new Map();
    }

    static get(source: string, context: RuleContext) {
        const path = resolve(source, context);
        if (path == null) {
            return null;
        }
        return StronglyConnectedComponentsBuilder.for(childContext(path, context));
    }

    static for(context: ChildContext) {
        const settingsHash = hashObject({
            settings: context.settings,
            parserOptions: context.parserOptions,
            parserPath: context.parserPath,
        }).digest('hex');
        const cacheKey = context.path + settingsHash;
        if (cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }
        const scc = StronglyConnectedComponentsBuilder.calculate(context);
        const visitedFiles = Object.keys(scc);
        visitedFiles.forEach((filePath) => cache.set(filePath + settingsHash, scc));
        return scc;
    }

    static calculate(context: ChildContext) {
        const exportMap = ExportMapBuilder.for(context);
        const adjacencyList = this.exportMapToAdjacencyList(exportMap);
        const calculatedScc = calculateScc(adjacencyList);
        return StronglyConnectedComponentsBuilder.calculatedSccToPlainObject(calculatedScc);
    }

    /**
     * @returns for each dep, what are its direct deps
     * @param initialExportMap The initial export map value.
     */
    static exportMapToAdjacencyList(initialExportMap: ExportMap | null) {
        const adjacencyList = new Map<string, Set<string>>();
        // BFS

        /**
         * Visit node.
         * @param exportMap The export map value.
         */
        function visitNode(exportMap: ExportMap | null) {
            if (!exportMap) {
                return;
            }
            exportMap.imports.forEach((v, importedPath) => {
                const from = exportMap.path;
                const to = importedPath;

                // Ignore type-only imports, because we care only about SCCs of value imports
                const toTraverse = [...v.declarations].filter(
                    ({ isOnlyImportingTypes }) => !isOnlyImportingTypes,
                );
                if (toTraverse.length === 0) {
                    return;
                }

                if (!adjacencyList.has(from)) {
                    adjacencyList.set(from, new Set());
                }

                if (adjacencyList.get(from)!.has(to)) {
                    return; // prevent endless loop
                }
                adjacencyList.get(from)!.add(to);
                visitNode(v.getter());
            });
        }
        visitNode(initialExportMap);
        // Fill gaps
        adjacencyList.forEach((values) => {
            values.forEach((value) => {
                if (!adjacencyList.has(value)) {
                    adjacencyList.set(value, new Set());
                }
            });
        });
        return adjacencyList;
    }

    /**
     * @returns for each key, its SCC's index
     * @param sccs The sccs value.
     */
    static calculatedSccToPlainObject(sccs: Set<string>[]) {
        const obj: Record<string, number> = {};
        sccs.forEach((scc, index) => {
            scc.forEach((node: string) => {
                obj[node] = index;
            });
        });
        return obj;
    }
}
