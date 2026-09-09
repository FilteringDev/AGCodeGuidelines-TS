import type Namespace from './namespace';
import type ExportMap from './index';
import type { Node } from '../../types';

/**
 * Process specifier.
 * @param specifier The specifier value.
 * @param astNode The ast node value.
 * @param exportMap The export map value.
 * @param namespace The namespace value.
 */
export default function processSpecifier(
    specifier: Node,
    astNode: Node,
    exportMap: ExportMap,
    namespace: Namespace,
) {
    const nsource = (astNode.source && astNode.source.value) as string;
    const exportMeta = {};
    let local;

    switch (specifier.type) {
        case 'ExportDefaultSpecifier':
            if (!nsource) {
                return;
            }
            local = 'default';
            break;
        case 'ExportNamespaceSpecifier':
            exportMap.namespace.set(
                specifier.exported!.name!,
                Object.defineProperty(exportMeta, 'namespace', {
                    get() {
                        return namespace.resolveImport(nsource);
                    },
                }),
            );
            return;
        case 'ExportAllDeclaration':
            exportMap.namespace.set(
                (specifier.exported!.name || specifier.exported!.value) as string,
                namespace.add(exportMeta, specifier.source.value),
            );
            return;
        case 'ExportSpecifier':
            if (!astNode.source) {
                exportMap.namespace.set(
                    (specifier.exported!.name || specifier.exported!.value) as string,
                    namespace.add(exportMeta, specifier.local),
                );
                return;
            }
        // else falls through
        default:
            local = specifier.local!.name!;
            break;
    }

    // todo: JSDoc
    exportMap.reexports.set(specifier.exported!.name!, {
        local,
        getImport: () => namespace.resolveImport(nsource),
    });
}
