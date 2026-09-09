import type { LegacyRule, Node } from '../../types';
import docsUrl from '../docsUrl';

const SINGLE_EXPORT_ERROR_MESSAGE = 'Prefer default export on a file with single export.';
const ANY_EXPORT_ERROR_MESSAGE = 'Prefer default export to be present on every file that has export.';

const rule: LegacyRule<[{ target?: 'single' | 'any' }?]> = {
    meta: {
        type: 'suggestion',
        docs: {
            category: 'Style guide',
            description: 'Prefer a default export if module exports a single name or multiple names.',
            url: docsUrl('prefer-default-export'),
        },
        schema: [
            {
                type: 'object',
                properties: {
                    target: {
                        type: 'string',
                        enum: ['single', 'any'],
                        default: 'single',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        let specifierExportCount = 0;
        let hasDefaultExport = false;
        let hasStarExport = false;
        let hasTypeExport = false;
        let namedExportNode: Node | null = null;
        // get options. by default we look into files with single export
        const { target = 'single' } = context.options[0] || {};

        /**
         * Capture declaration.
         * @param identifierOrPattern The identifier or pattern value.
         */
        function captureDeclaration(identifierOrPattern: Node | null | undefined) {
            if (identifierOrPattern && identifierOrPattern.type === 'ObjectPattern') {
                // recursively capture
                identifierOrPattern.properties.forEach((property) => {
                    captureDeclaration(property.value);
                });
            } else if (identifierOrPattern && identifierOrPattern.type === 'ArrayPattern') {
                identifierOrPattern.elements.forEach(captureDeclaration);
            } else {
                // assume it's a single standard identifier
                specifierExportCount += 1;
            }
        }

        return {
            ExportDefaultSpecifier() {
                hasDefaultExport = true;
            },

            ExportSpecifier(node: Node<'ExportSpecifier'>) {
                if ((node.exported.name || node.exported.value) === 'default') {
                    hasDefaultExport = true;
                } else {
                    specifierExportCount += 1;
                    namedExportNode = node;
                }
            },

            ExportNamedDeclaration(node: Node<'ExportNamedDeclaration'>) {
                // if there are specifiers, node.declaration should be null
                if (!node.declaration) {
                    return;
                }

                const { type } = node.declaration;

                if (
                    type === 'TSTypeAliasDeclaration'
                    || type === 'TypeAlias'
                    || type === 'TSInterfaceDeclaration'
                    || type === 'InterfaceDeclaration'
                ) {
                    specifierExportCount += 1;
                    hasTypeExport = true;
                    return;
                }

                if (node.declaration.declarations) {
                    node.declaration.declarations.forEach((declaration) => {
                        captureDeclaration(declaration.id);
                    });
                } else {
                    // captures 'export function foo() {}' syntax
                    specifierExportCount += 1;
                }

                namedExportNode = node;
            },

            ExportDefaultDeclaration() {
                hasDefaultExport = true;
            },

            ExportAllDeclaration() {
                hasStarExport = true;
            },

            'Program:exit': function onProgramExit() {
                if (hasDefaultExport || hasStarExport || hasTypeExport) {
                    return;
                }
                if (target === 'single' && specifierExportCount === 1) {
                    context.report(namedExportNode!, SINGLE_EXPORT_ERROR_MESSAGE);
                } else if (target === 'any' && specifierExportCount > 0) {
                    context.report(namedExportNode!, ANY_EXPORT_ERROR_MESSAGE);
                }
            },
        };
    },
};
export default rule;
