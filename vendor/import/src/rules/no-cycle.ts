import type { LegacyRule, Node, ModuleSource } from '../../types';
import { getPhysicalFilename } from '../../utils/contextCompat';
import moduleVisitor, { makeOptionsSchema } from '../../utils/moduleVisitor';
import resolve from '../../utils/resolve';
import ExportMapBuilder from '../exportMap/builder';
import StronglyConnectedComponentsBuilder from '../scc';
import { isExternalModule } from '../core/importType';
import docsUrl from '../docsUrl';
import type { ImportDeclarationMetadata, ExportGetter } from '../../export-types';

/**
 * @file Ensures that no imported module imports the linted module.
 */

interface CycleStep {
    mget: ExportGetter;
    route: ImportDeclarationMetadata['source'][];
}
const traversed = new Set<string>();

/**
 * Route string.
 * @param route The route value.
 * @returns The result of this check.
 */
function routeString(route: ImportDeclarationMetadata['source'][]) {
    return route.map((s) => `${s.value}:${s.loc.start.line}`).join('=>');
}

const rule: LegacyRule<
    [
        {
            commonjs?: boolean;
            amd?: boolean;
            esmodule?: boolean;
            ignore?: string[];
            maxDepth?: number | '∞';
            ignoreExternal?: boolean;
            allowUnsafeDynamicCyclicDependency?: boolean;
            disableScc?: boolean;
        }?,
    ]
> = {
    meta: {
        type: 'suggestion',
        docs: {
            category: 'Static analysis',
            description:
                'Forbid a module from importing a module with a dependency path back to itself.',
            url: docsUrl('no-cycle'),
        },
        schema: [
            makeOptionsSchema({
                maxDepth: {
                    anyOf: [
                        {
                            description: 'maximum dependency depth to traverse',
                            type: 'integer',
                            minimum: 1,
                        },
                        {
                            enum: ['∞'],
                            type: 'string',
                        },
                    ],
                },
                ignoreExternal: {
                    description: 'ignore external modules',
                    type: 'boolean',
                    default: false,
                },
                allowUnsafeDynamicCyclicDependency: {
                    description:
                        'Allow cyclic dependency if there is at least one dynamic import in the chain',
                    type: 'boolean',
                    default: false,
                },
                disableScc: {
                    description:
                        "When true, don't calculate a strongly-connected-components graph. SCC is used to reduce the time-complexity of cycle detection, but adds overhead.",
                    type: 'boolean',
                    default: false,
                },
            }),
        ],
    },

    create(context) {
        const myPath = getPhysicalFilename(context);
        if (myPath === '<text>') {
            return {};
        } // can't cycle-check a non-file

        const options = context.options[0] || {};
        const maxDepth = typeof options.maxDepth === 'number' ? options.maxDepth : Infinity;
        const ignoreModule = (name: string) => options.ignoreExternal
            && isExternalModule(name, resolve(name, context), context);

        const scc = options.disableScc ? {} : StronglyConnectedComponentsBuilder.get(myPath, context);

        /**
         * Check source value.
         * @param sourceNode The source node value.
         * @param importer The importer value.
         */
        function checkSourceValue(sourceNode: ModuleSource, importer: Node) {
            if (ignoreModule(sourceNode.value)) {
                return; // ignore external modules
            }
            if (
                options.allowUnsafeDynamicCyclicDependency
                // Ignore `import()`
                && (importer.type === 'ImportExpression'
                    // `require()` calls are always checked (if possible)
                    || (importer.type === 'CallExpression' && importer.callee.name !== 'require'))
            ) {
                return; // cycle via dynamic import allowed by config
            }

            if (
                importer.type === 'ImportDeclaration'
                // import type { Foo } (TS and Flow)
                && (importer.importKind === 'type'
                    // import { type Foo } (Flow)
                    || importer.specifiers.every(({ importKind }) => importKind === 'type'))
            ) {
                return; // ignore type imports
            }

            const imported = ExportMapBuilder.get(sourceNode.value, context);

            if (imported == null) {
                return; // no-unresolved territory
            }

            if (imported.path === myPath) {
                return; // no-self-import territory
            }

            /**
             * If we're in the same Strongly Connected Component,
             * Then there exists a path from each node in the SCC to every other node in the SCC,
             * Then there exists at least one path from them to us and from us to them,
             * Then we have a cycle between us.
             */
            const hasDependencyCycle = options.disableScc || scc![myPath] === scc![imported.path];
            if (!hasDependencyCycle) {
                return;
            }

            const untraversed: CycleStep[] = [{ mget: () => imported, route: [] }];

            /**
             * Detect cycle.
             * @param root0 The next dependency and route.
             * @param root0.mget The lazy dependency getter.
             * @param root0.route The route to the dependency.
             * @returns The result of this check.
             */
            function detectCycle({ mget, route }: CycleStep) {
                const m = mget();
                if (m == null) {
                    return undefined;
                }
                if (traversed.has(m.path)) {
                    return undefined;
                }
                traversed.add(m.path);

                const entryIterator0 = m.imports[Symbol.iterator]();
                for (
                    let entryStep1 = entryIterator0.next();
                    !entryStep1.done;
                    entryStep1 = entryIterator0.next()
                ) {
                    const [path, { getter, declarations }] = entryStep1.value;
                    // If we're in different SCCs, we can't have a circular dependency
                    if (!(!options.disableScc && scc![myPath] !== scc![path])) {
                        if (!traversed.has(path)) {
                            const toTraverse = [...declarations].filter(
                                ({ source, isOnlyImportingTypes }) => !ignoreModule(source.value)
                                        // Ignore only type imports
                                        && !isOnlyImportingTypes,
                            );

                            /**
                             * If cyclic dependency is allowed via dynamic import, skip checking if any module is
                             * imported dynamically
                             */
                            if (
                                options.allowUnsafeDynamicCyclicDependency
                                    && toTraverse.some((d) => d.dynamic)
                            ) {
                                return undefined;
                            }

                            /**
                             * Only report as a cycle if there are any import declarations that are considered by
                             * the rule. For example:
                             *
                             * a.ts:
                             * import { foo } from './b' // should not be reported as a cycle
                             *
                             * b.ts:
                             * import type { Bar } from './a'
                             */
                            if (path === myPath && toTraverse.length > 0) {
                                return true;
                            }
                            if (route.length + 1 < maxDepth) {
                                toTraverse.forEach(({ source }) => {
                                    untraversed.push({ mget: getter, route: route.concat(source) });
                                });
                            }
                        }
                    }
                }

                return undefined;
            }

            while (untraversed.length > 0) {
                const next = untraversed.shift()!; // bfs!
                if (detectCycle(next)) {
                    const message = next.route.length > 0
                        ? `Dependency cycle via ${routeString(next.route)}`
                        : 'Dependency cycle detected.';
                    context.report(importer, message);
                    return;
                }
            }
        }

        return Object.assign(moduleVisitor(checkSourceValue, context.options[0]), {
            'Program:exit': function onProgramExit() {
                traversed.clear();
            },
        });
    },
};
export default rule;
