import includes from 'array-includes';
import type { ExportThunk } from '../../export-types';
import type ExportMapFactory from './builder';
import type ExportMap from './index';
import type { ParsedProgram, ParserContext, Node } from '../../types';
import SourceCode from '../../compat/remote-source';
import { availableDocStyleParsers, captureDoc, type DocParser } from './doc';
import Namespace from './namespace';
import processSpecifier from './specifier';
import { captureDependency, captureDependencyWithSpecifiers } from './captureDependency';
import recursivePatternCapture from './patternCapture';
import RemotePath from './remotePath';

/**
 * sometimes legacy support isn't _that_ hard... right?
 * @param text The text value.
 * @param ast The ast value.
 * @returns The result of this check.
 */
function makeSourceCode(text: string, ast: ParsedProgram) {
    return new SourceCode({ text, ast });
}

export default class ImportExportVisitorBuilder {
    context: ParserContext;

    namespace: Namespace;

    remotePathResolver: RemotePath;

    source: ReturnType<typeof makeSourceCode>;

    exportMap: ExportMap;

    ast: ParsedProgram;

    isEsModuleInteropTrue: boolean | null | undefined;

    thunkFor: ExportThunk;

    docStyleParsers: Record<string, DocParser>;

    constructor(
        path: string,
        context: ParserContext,
        exportMap: ExportMap,
        ExportMapBuilder: typeof ExportMapFactory,
        content: string,
        ast: ParsedProgram,
        isEsModuleInteropTrue: boolean | null | undefined,
        thunkFor: ExportThunk,
    ) {
        this.context = context;
        this.namespace = new Namespace(path, context, ExportMapBuilder);
        this.remotePathResolver = new RemotePath(path, context);
        this.source = makeSourceCode(content, ast);
        this.exportMap = exportMap;
        this.ast = ast;
        this.isEsModuleInteropTrue = isEsModuleInteropTrue;
        this.thunkFor = thunkFor;
        const docstyle = (this.context.settings && this.context.settings['import/docstyle']) || [
            'jsdoc',
        ];
        this.docStyleParsers = {};
        docstyle.forEach((style) => {
            this.docStyleParsers[style] = availableDocStyleParsers[style]!;
        });
    }

    build(astNode: Node): Record<string, (this: ImportExportVisitorBuilder) => void> {
        return {
            ExportDefaultDeclaration() {
                const declarationNode = astNode as Node<'ExportDefaultDeclaration'>;
                const exportMeta = captureDoc(this.source, this.docStyleParsers, declarationNode);
                if (declarationNode.declaration.type === 'Identifier') {
                    this.namespace.add(exportMeta, declarationNode.declaration);
                }
                this.exportMap.namespace.set('default', exportMeta);
            },
            ExportAllDeclaration() {
                const declarationNode = astNode as Node<'ExportAllDeclaration'>;
                const getter = captureDependency(
                    declarationNode,
                    declarationNode.exportKind === 'type',
                    this.remotePathResolver,
                    this.exportMap,
                    this.context,
                    this.thunkFor,
                );
                if (getter) {
                    this.exportMap.dependencies.add(getter);
                }
                if (declarationNode.exported) {
                    processSpecifier(
                        declarationNode,
                        declarationNode.exported,
                        this.exportMap,
                        this.namespace,
                    );
                }
            },
            /**
             * capture namespaces in case of later export
             */
            ImportDeclaration() {
                const declarationNode = astNode as Node<'ImportDeclaration'>;
                captureDependencyWithSpecifiers(
                    declarationNode,
                    this.remotePathResolver,
                    this.exportMap,
                    this.context,
                    this.thunkFor,
                );
                const ns = declarationNode.specifiers.find((s) => s.type === 'ImportNamespaceSpecifier');
                if (ns) {
                    this.namespace.rawSet(ns.local.name, declarationNode.source.value);
                }
            },
            ExportNamedDeclaration() {
                const declarationNode = astNode as Node<'ExportNamedDeclaration'>;
                captureDependencyWithSpecifiers(
                    declarationNode,
                    this.remotePathResolver,
                    this.exportMap,
                    this.context,
                    this.thunkFor,
                );
                // capture declaration
                if (declarationNode.declaration != null) {
                    switch ((declarationNode.declaration as { type: string }).type) {
                        case 'FunctionDeclaration':
                        case 'ClassDeclaration':
                        case 'TypeAlias': /*  flowtype with babel-eslint parser */
                        case 'InterfaceDeclaration':
                        case 'DeclareFunction':
                        case 'TSDeclareFunction':
                        case 'TSEnumDeclaration':
                        case 'TSTypeAliasDeclaration':
                        case 'TSInterfaceDeclaration':
                        case 'TSAbstractClassDeclaration':
                        case 'TSModuleDeclaration':
                            this.exportMap.namespace.set(
                                declarationNode.declaration.id!.name!,
                                captureDoc(this.source, this.docStyleParsers, declarationNode),
                            );
                            break;
                        case 'VariableDeclaration':
                            declarationNode.declaration.declarations!.forEach((d) => {
                                recursivePatternCapture(d.id, (id) => {
                                    const metadata = captureDoc(this.source, this.docStyleParsers, d, declarationNode);
                                    return this.exportMap.namespace.set(id.name, metadata);
                                });
                            });
                            break;
                        default:
                    }
                }
                declarationNode.specifiers.forEach((specifier) => {
                    const declaration = declarationNode;
                    processSpecifier(specifier, declaration, this.exportMap, this.namespace);
                });
            },
            TSExportAssignment: () => this.typeScriptExport(astNode),
            ...(this.isEsModuleInteropTrue && {
                TSNamespaceExportDeclaration: () => this.typeScriptExport(astNode),
            }),
        };
    }

    // This doesn't declare anything, but changes what's being exported.
    typeScriptExport(astNode: Node) {
        // Older TypeScript parsers expose the namespace identifier as `name`.
        const namespace = astNode as unknown as { id?: Node<'Identifier'>; name?: Node<'Identifier'> };
        const expression = astNode.expression as Node | undefined;
        const exportedName = astNode.type === 'TSNamespaceExportDeclaration'
            ? (namespace.id || namespace.name)!.name
            : (expression && expression.name) || (expression!.id && expression!.id.name) || null;
        const declTypes = [
            'VariableDeclaration',
            'ClassDeclaration',
            'TSDeclareFunction',
            'TSEnumDeclaration',
            'TSTypeAliasDeclaration',
            'TSInterfaceDeclaration',
            'TSAbstractClassDeclaration',
            'TSModuleDeclaration',
        ];
        const exportedDecls = this.ast.body.filter(
            ({ type, id, declarations }) => includes(declTypes, type)
                && ((id && id.name === exportedName)
                    || (declarations && declarations.find((d) => d.id.name === exportedName))),
        );
        if (exportedDecls.length === 0) {
            // Export is not referencing any local declaration, must be re-exporting
            this.exportMap.namespace.set(
                'default',
                captureDoc(this.source, this.docStyleParsers, astNode),
            );
            return;
        }
        if (
            this.isEsModuleInteropTrue // esModuleInterop is on in tsconfig
            && !this.exportMap.namespace.has('default') // and default isn't added already
        ) {
            this.exportMap.namespace.set('default', {}); // add default export
        }
        exportedDecls.forEach((decl) => {
            if (decl.type === 'TSModuleDeclaration') {
                if (decl.body && decl.body.type === 'TSModuleDeclaration') {
                    this.exportMap.namespace.set(
                        decl.body.id.name!,
                        captureDoc(this.source, this.docStyleParsers, decl.body),
                    );
                } else if (decl.body && decl.body.body) {
                    decl.body.body.forEach((moduleBlockNode) => {
                        // Export-assignment exports all members in the namespace,
                        // explicitly exported or not.
                        const namespaceDecl = moduleBlockNode.type === 'ExportNamedDeclaration'
                            ? moduleBlockNode.declaration
                            : moduleBlockNode;

                        if (!namespaceDecl) {
                            // TypeScript can check this for us; we needn't
                        } else if (namespaceDecl.type === 'VariableDeclaration') {
                            namespaceDecl.declarations.forEach((declaration) => {
                                recursivePatternCapture(declaration.id, (id) => {
                                    const metadata = captureDoc(
                                        this.source,
                                        this.docStyleParsers,
                                        decl,
                                        namespaceDecl,
                                        moduleBlockNode,
                                    );
                                    return this.exportMap.namespace.set(id.name, metadata);
                                });
                            });
                        } else {
                            this.exportMap.namespace.set(
                                namespaceDecl.id!.name!,
                                captureDoc(this.source, this.docStyleParsers, moduleBlockNode),
                            );
                        }
                    });
                }
            } else {
                // Export as default
                this.exportMap.namespace.set(
                    'default',
                    captureDoc(this.source, this.docStyleParsers, decl),
                );
            }
        });
    }
}
