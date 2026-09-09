import type { ExportMetadata } from '../../export-types';
import type ExportMapFactory from './builder';
import type { ParserContext } from '../../types';
import childContext from './childContext';
import RemotePath from './remotePath';

export default class Namespace {
    remotePathResolver: RemotePath;

    context: ParserContext;

    ExportMapBuilder: typeof ExportMapFactory;

    namespaces: Map<string, string>;

    constructor(path: string, context: ParserContext, ExportMapBuilder: typeof ExportMapFactory) {
        this.remotePathResolver = new RemotePath(path, context);
        this.context = context;
        this.ExportMapBuilder = ExportMapBuilder;
        this.namespaces = new Map();
    }

    resolveImport(value: string) {
        const rp = this.remotePathResolver.resolve(value);
        if (rp == null) {
            return null;
        }
        return this.ExportMapBuilder.for(childContext(rp, this.context));
    }

    getNamespace(identifier: { name?: string } | string) {
        const { name } = identifier as { name: string };
        if (!this.namespaces.has(name)) {
            return undefined;
        }
        return () => this.resolveImport(this.namespaces.get(name)!);
    }

    add(object: ExportMetadata, identifier: { name?: string } | string) {
        const nsfn = this.getNamespace(identifier);
        if (nsfn) {
            Object.defineProperty(object, 'namespace', { get: nsfn });
        }

        return object;
    }

    rawSet(name: string, value: string) {
        this.namespaces.set(name, value);
    }
}
