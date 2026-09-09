import type { LegacyRule, Node } from '../../types';
import ExportMapBuilder from '../exportMap/builder';
import importDeclaration from '../importDeclaration';
import docsUrl from '../docsUrl';

/**
 * @file Rule to warn about potentially confused use of name exports
 * See LICENSE in root directory for full license.
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',
        docs: {
            category: 'Helpful warnings',
            description: 'Forbid use of exported name as property of default export.',
            url: docsUrl('no-named-as-default-member'),
        },
        schema: [],
    },

    create(context) {
        const fileImports = new Map<
            string | undefined,
            { exportMap: import('../exportMap/index').default; sourcePath: string }
        >();
        const allPropertyLookups = new Map<
            string | undefined,
            { node: Node; propName: string | undefined }[]
        >();

        /**
         * Store property lookup.
         * @param objectName The object name value.
         * @param propName The prop name value.
         * @param node The node to inspect.
         */
        function storePropertyLookup(
            objectName: string | undefined,
            propName: string | undefined,
            node: Node,
        ) {
            const lookups = allPropertyLookups.get(objectName) || [];
            lookups.push({ node, propName });
            allPropertyLookups.set(objectName, lookups);
        }

        return {
            ImportDefaultSpecifier(node: Node<'ImportDefaultSpecifier'>) {
                const declaration = importDeclaration(context, node);
                const exportMap = ExportMapBuilder.get(declaration.source.value, context);
                if (exportMap == null) {
                    return;
                }

                if (exportMap.errors.length) {
                    exportMap.reportErrors(context, declaration);
                    return;
                }

                fileImports.set(node.local.name, {
                    exportMap,
                    sourcePath: declaration.source.value,
                });
            },

            MemberExpression(node: Node<'MemberExpression'>) {
                const objectName = node.object.name;
                const propName = node.property.name;
                storePropertyLookup(objectName, propName, node);
            },

            VariableDeclarator(node: Node<'VariableDeclarator'>) {
                const isDestructure = node.id.type === 'ObjectPattern'
                    && node.init != null
                    && node.init.type === 'Identifier';
                if (!isDestructure) {
                    return;
                }

                const objectName = node.init!.name;

                const entryIterator0 = node.id.properties![Symbol.iterator]();
                for (
                    let entryStep1 = entryIterator0.next();
                    !entryStep1.done;
                    entryStep1 = entryIterator0.next()
                ) {
                    const { key } = entryStep1.value;
                    if (!(key == null)) {
                        // true for rest properties
                        storePropertyLookup(objectName, key.name, key);
                    }
                }
            },

            'Program:exit': function onProgramExit() {
                allPropertyLookups.forEach((lookups, objectName) => {
                    const fileImport = fileImports.get(objectName);
                    if (fileImport == null) {
                        return;
                    }

                    const entryIterator1 = lookups[Symbol.iterator]();
                    for (
                        let entryStep2 = entryIterator1.next();
                        !entryStep2.done;
                        entryStep2 = entryIterator1.next()
                    ) {
                        const { propName, node } = entryStep2.value;
                        // the default import can have a "default" property
                        if (!(propName === 'default')) {
                            if (fileImport.exportMap.namespace.has(propName!)) {
                                context.report({
                                    node,
                                    message: `Caution: \`${objectName}\` also has a named export \`${propName}\`. Check if you meant to write \`import {${propName}} from '${fileImport.sourcePath}'\` instead.`,
                                });
                            }
                        }
                    }
                });
            },
        };
    },
};
export default rule;
