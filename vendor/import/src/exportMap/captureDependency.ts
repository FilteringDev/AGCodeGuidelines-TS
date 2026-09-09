import type { ExportThunk } from '../../export-types';
import type ExportMap from './index';
import type RemotePath from './remotePath';
import type { ModuleSource, ParserContext, Node } from '../../types';

/**
 * Capture dependency.
 * @param declaration The importing declaration.
 * @param declaration.source The imported module.
 * @param isOnlyImportingTypes The is only importing types value.
 * @param remotePathResolver The remote path resolver value.
 * @param exportMap The export map value.
 * @param context The rule context.
 * @param thunkFor The thunk for value.
 * @param importedSpecifiers The imported specifiers value.
 * @returns The result of this check.
 */
export function captureDependency(
    { source }: { source?: ModuleSource | null },
    isOnlyImportingTypes: boolean,
    remotePathResolver: RemotePath,
    exportMap: ExportMap,
    context: ParserContext,
    thunkFor: ExportThunk,
    importedSpecifiers: Set<string> = new Set(),
) {
    if (source == null) {
        return null;
    }

    const p = remotePathResolver.resolve(source.value);
    if (p == null) {
        return null;
    }

    const declarationMetadata = {
        // capturing actual node reference holds full AST in memory!
        source: { value: source.value, loc: source.loc },
        isOnlyImportingTypes,
        importedSpecifiers,
    };

    const existing = exportMap.imports.get(p);
    if (existing != null) {
        existing.declarations.add(declarationMetadata);
        return existing.getter;
    }

    const getter = thunkFor(p, context);
    exportMap.imports.set(p, { getter, declarations: new Set([declarationMetadata]) });
    return getter;
}

const supportedImportTypes = new Set(['ImportDefaultSpecifier', 'ImportNamespaceSpecifier']);

/**
 * Capture dependency with specifiers.
 * @param n The n value.
 * @param remotePathResolver The remote path resolver value.
 * @param exportMap The export map value.
 * @param context The rule context.
 * @param thunkFor The thunk for value.
 */
export function captureDependencyWithSpecifiers(
    n: Node<'ImportDeclaration' | 'ExportNamedDeclaration'>,
    remotePathResolver: RemotePath,
    exportMap: ExportMap,
    context: ParserContext,
    thunkFor: ExportThunk,
) {
    // import type { Foo } (TS and Flow); import typeof { Foo } (Flow)
    const declarationIsType = n.importKind === 'type' || n.importKind === 'typeof';
    // import './foo' or import {} from './foo' (both 0 specifiers) is a side effect and
    // shouldn't be considered to be just importing types
    let specifiersOnlyImportingTypes = n.specifiers.length > 0;
    const importedSpecifiers = new Set<string>();
    n.specifiers.forEach((specifier: Node) => {
        if (specifier.type === 'ImportSpecifier') {
            importedSpecifiers.add((specifier.imported.name || specifier.imported.value) as string);
        } else if (supportedImportTypes.has(specifier.type)) {
            importedSpecifiers.add(specifier.type);
        }

        // import { type Foo } (Flow); import { typeof Foo } (Flow)
        specifiersOnlyImportingTypes = specifiersOnlyImportingTypes
            && (specifier.importKind === 'type' || specifier.importKind === 'typeof');
    });
    captureDependency(
        n,
        declarationIsType || specifiersOnlyImportingTypes,
        remotePathResolver,
        exportMap,
        context,
        thunkFor,
        importedSpecifiers,
    );
}
