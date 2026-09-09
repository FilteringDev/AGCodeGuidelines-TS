/**
 * @file Restrict usage of duplicate imports.
 * @author Simen Bekkhus
 */

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

import type {
    LegacyListener, LegacyRule, Node, RuleContext,
} from '../../../types';

type ImportNode = Node<'ImportDeclaration' | 'ExportNamedDeclaration' | 'ExportAllDeclaration'>;
type DeclarationEntry = { node: ImportNode; declarationType: string };

const NAMED_TYPES = ['ImportSpecifier', 'ExportSpecifier'];
const NAMESPACE_TYPES = ['ImportNamespaceSpecifier', 'ExportNamespaceSpecifier'];

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/**
 * Check if an import/export type belongs to (ImportSpecifier|ExportSpecifier) or
 * (ImportNamespaceSpecifier|ExportNamespaceSpecifier).
 * @param importExportType An import/export type to check.
 * @param type Can be "named" or "namespace"
 * @returns True if import/export type belongs to (ImportSpecifier|ExportSpecifier) or
 * (ImportNamespaceSpecifier|ExportNamespaceSpecifier) and false if it doesn't.
 */
function isImportExportSpecifier(importExportType: string, type: string) {
    const arrayToCheck = type === 'named' ? NAMED_TYPES : NAMESPACE_TYPES;

    return arrayToCheck.includes(importExportType);
}

/**
 * Return the type of (import|export).
 * @param node A node to get.
 * @returns The type of the (import|export).
 */
function getImportExportType(node: ImportNode) {
    if ('specifiers' in node && node.specifiers && node.specifiers.length > 0) {
        const nodeSpecifiers = node.specifiers;
        const index = nodeSpecifiers.findIndex(
            ({ type }) => isImportExportSpecifier(type, 'named')
                || isImportExportSpecifier(type, 'namespace'),
        );
        const i = index > -1 ? index : 0;

        return nodeSpecifiers[i]!.type;
    }
    if (node.type === 'ExportAllDeclaration') {
        if (node.exported) {
            return 'ExportNamespaceSpecifier';
        }
        return 'ExportAll';
    }
    return 'SideEffectImport';
}

/**
 * Returns a boolean indicates if two (import|export) can be merged
 * @param node1 A node to check.
 * @param node2 A node to check.
 * @returns True if two (import|export) can be merged, false if they can't.
 */
function isImportExportCanBeMerged(node1: ImportNode, node2: ImportNode) {
    const importExportType1 = getImportExportType(node1);
    const importExportType2 = getImportExportType(node2);

    if (
        (importExportType1 === 'ExportAll'
            && importExportType2 !== 'ExportAll'
            && importExportType2 !== 'SideEffectImport')
        || (importExportType1 !== 'ExportAll'
            && importExportType1 !== 'SideEffectImport'
            && importExportType2 === 'ExportAll')
    ) {
        return false;
    }
    if (
        (isImportExportSpecifier(importExportType1, 'namespace')
            && isImportExportSpecifier(importExportType2, 'named'))
        || (isImportExportSpecifier(importExportType2, 'namespace')
            && isImportExportSpecifier(importExportType1, 'named'))
    ) {
        return false;
    }
    return true;
}

/**
 * Returns a boolean if we should report (import|export).
 * @param node A node to be reported or not.
 * @param previousNodes An array contains previous nodes of the module imported or exported.
 * @returns True if the (import|export) should be reported.
 */
function shouldReportImportExport(node: ImportNode, previousNodes: ImportNode[]) {
    let i = 0;

    while (i < previousNodes.length) {
        if (isImportExportCanBeMerged(node, previousNodes[i]!)) {
            return true;
        }
        i += 1;
    }
    return false;
}

/**
 * Returns array contains only nodes with declarations types equal to type.
 * @param nodes An array contains objects, each object contains a node and a declaration type.
 * @param type Declaration type.
 * @returns An array contains only nodes with declarations types equal to type.
 */
function getNodesByDeclarationType(nodes: DeclarationEntry[], type: string) {
    return nodes
        .filter(({ declarationType }) => declarationType === type)
        .map(({ node }) => node);
}

/**
 * Returns the name of the module imported or re-exported.
 * @param node A node to get.
 * @returns The name of the module, or empty string if no name.
 */
function getModule(node: ImportNode) {
    if (node && node.source && node.source.value) {
        return node.source.value.trim();
    }
    return '';
}

/**
 * Checks if the (import|export) can be merged with at least one import or one export, and reports if so.
 * @param context The ESLint rule context object.
 * @param node A node to get.
 * @param modules A Map object contains as a key a module name and as value an array contains objects, each object
 * contains a node and a declaration type.
 * @param declarationType A declaration type can be an import or export.
 * @param includeExports Whether or not to check for exports in addition to imports.
 */
function checkAndReport(
    context: RuleContext,
    node: ImportNode,
    modules: Map<string, DeclarationEntry[]>,
    declarationType: string,
    includeExports: boolean,
) {
    const module = getModule(node);

    if (modules.has(module)) {
        const previousNodes = modules.get(module)!;
        const messagesIds: string[] = [];
        const importNodes = getNodesByDeclarationType(previousNodes!, 'import');
        let exportNodes;

        if (includeExports) {
            exportNodes = getNodesByDeclarationType(previousNodes!, 'export');
        }
        if (declarationType === 'import') {
            if (shouldReportImportExport(node, importNodes)) {
                messagesIds.push('import');
            }
            if (includeExports) {
                if (shouldReportImportExport(node, exportNodes!)) {
                    messagesIds.push('importAs');
                }
            }
        } else if (declarationType === 'export') {
            if (shouldReportImportExport(node, exportNodes!)) {
                messagesIds.push('export');
            }
            if (shouldReportImportExport(node, importNodes)) {
                messagesIds.push('exportAs');
            }
        }
        messagesIds.forEach((messageId) => context.report({
            node,
            messageId,
            data: {
                module,
            },
        }));
    }
}

/**
 * @param node A node to handle.
 */

/**
 * Returns a function handling the (imports|exports) of a given file
 * @param context The ESLint rule context object.
 * @param modules A Map object contains as a key a module name and as value an array contains objects, each object
 * contains a node and a declaration type.
 * @param declarationType A declaration type can be an import or export.
 * @param includeExports Whether or not to check for exports in addition to imports.
 * @returns A function passed to ESLint to handle the statement.
 */
function handleImportsExports(
    context: RuleContext,
    modules: Map<string, DeclarationEntry[]>,
    declarationType: string,
    includeExports: boolean,
) {
    return function visitValue(node: ImportNode) {
        const module = getModule(node);

        if (module) {
            checkAndReport(context, node, modules, declarationType, includeExports);
            const currentNode = { node, declarationType };
            let nodes = [currentNode];

            if (modules.has(module)) {
                const previousNodes = modules.get(module)!;

                nodes = [...previousNodes, currentNode];
            }
            modules.set(module, nodes);
        }
    };
}

const rule: LegacyRule<[{ includeExports?: boolean }?]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow duplicate module imports',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-duplicate-imports',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    includeExports: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            import: "'{{module}}' import is duplicated.",
            importAs: "'{{module}}' import is duplicated as export.",
            export: "'{{module}}' export is duplicated.",
            exportAs: "'{{module}}' export is duplicated as import.",
        },
    },

    create(context) {
        const { includeExports } = context.options[0] || {};
        const modules = new Map<string, DeclarationEntry[]>();
        const handlers: LegacyListener = {
            ImportDeclaration: handleImportsExports(
                context,
                modules,
                'import',
                includeExports!,
            ),
        };

        if (includeExports) {
            handlers.ExportNamedDeclaration = handleImportsExports(
                context,
                modules,
                'export',
                includeExports,
            );
            handlers.ExportAllDeclaration = handleImportsExports(
                context,
                modules,
                'export',
                includeExports,
            );
        }
        return handlers;
    },
};

export default rule;
