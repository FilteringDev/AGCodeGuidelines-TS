import type { Annotation } from 'doctrine';
import type { Node, ParserContext } from './types';
import type ExportMap from './src/exportMap/index';
/**
 * @file Metadata retained while following imports and re-exports across files.
 */

export interface Documentation {
    description?: string;
    tags: { title: string; description?: string | null }[];
}
export interface ExportMetadata {
    doc?: Annotation | Documentation;
    namespace?: ExportMap | null;
}
export type ExportGetter = () => ExportMap | null;
export type ExportThunk = (path: string, context: ParserContext) => ExportGetter;
export interface ImportDeclarationMetadata {
    source: { value: string; loc: Node['loc'] };
    isOnlyImportingTypes?: boolean;
    importedSpecifiers: Set<string>;
    dynamic?: boolean;
}
export interface ImportMetadata {
    getter: ExportGetter;
    declarations: Set<ImportDeclarationMetadata>;
}
export interface ReexportMetadata {
    local: string;
    getImport: ExportGetter;
}
export interface ParseError {
    message?: string;
    lineNumber?: number;
    column?: number;
}
