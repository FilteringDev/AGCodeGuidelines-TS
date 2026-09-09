import { createRequire } from 'node:module';
import minimatch from 'minimatch';
import path from 'node:path';
import type {
    Node, LegacyRule, RuleContext, Scope,
} from '../../types';
import { getPhysicalFilename, getSourceCode } from '../../utils/contextCompat';
import pkgUp from '../../utils/pkgUp';

const requireExternal = createRequire(import.meta.url);

/**
 * Get entry point.
 * @param context The rule context.
 * @returns The result of this check.
 */
function getEntryPoint(context: RuleContext) {
    const pkgPath = pkgUp({ cwd: getPhysicalFilename(context) });
    try {
        return requireExternal.resolve(path.dirname(pkgPath!));
    } catch (error) {
        // Assume the package has no entrypoint (e.g. CLI packages)
        // in which case require.resolve would throw.
        return null;
    }
}

/**
 * Find scope.
 * @param context The rule context.
 * @param identifier The identifier value.
 * @returns The result of this check.
 */
function findScope(context: RuleContext, identifier: string | undefined) {
    const { scopeManager } = getSourceCode(context);
    const usesIdentifier = (variable: Scope['variables'][number]) => (
        variable.identifiers.some((node) => node.name === identifier)
    );

    return (
        scopeManager
        && scopeManager.scopes
            .slice()
            .reverse()
            .find((scope) => scope.variables.some(usesIdentifier))
    );
}

/**
 * Find definition.
 * @param objectScope The object scope value.
 * @param identifier The identifier value.
 * @returns The result of this check.
 */
function findDefinition(objectScope: Scope, identifier: string | undefined) {
    const variable = objectScope.variables.find((selectedVariable) => selectedVariable.name === identifier);
    return variable!.defs.find((def) => def.name.name === identifier);
}

const rule: LegacyRule<[{ exceptions?: unknown[] }?]> = {
    meta: {
        type: 'problem',
        docs: {
            category: 'Module systems',
            description: 'Forbid import statements with CommonJS module.exports.',
            recommended: true,
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    exceptions: { type: 'array' },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const importDeclarations: Node<'ImportDeclaration'>[] = [];
        const entryPoint = getEntryPoint(context);
        const options = context.options[0] || {};
        let alreadyReported = false;

        /**
         * Report.
         * @param node The node to inspect.
         */
        function report(node: Node<'MemberExpression'>) {
            const fileName = getPhysicalFilename(context);
            const isEntryPoint = entryPoint === fileName;
            const isIdentifier = node.object.type === 'Identifier';
            const hasKeywords = /^(module|exports)$/.test(node.object.name as string);
            const objectScope = hasKeywords && findScope(context, node.object.name);
            const variableDefinition = objectScope && findDefinition(objectScope, node.object.name);
            const isImportBinding = variableDefinition && variableDefinition.type === 'ImportBinding';
            const hasCJSExportReference = hasKeywords && (!objectScope || objectScope.type === 'module');
            const isException = !!options.exceptions
                && options.exceptions.some((glob) => minimatch(fileName, glob as string));

            if (
                isIdentifier
                && hasCJSExportReference
                && !isEntryPoint
                && !isException
                && !isImportBinding
            ) {
                importDeclarations.forEach((importDeclaration) => {
                    context.report({
                        node: importDeclaration,
                        message:
                            "Cannot use import declarations in modules that export using CommonJS (module.exports = 'foo' or exports.bar = 'hi')",
                    });
                });
                alreadyReported = true;
            }
        }

        return {
            ImportDeclaration(node: Node<'ImportDeclaration'>) {
                importDeclarations.push(node);
            },
            MemberExpression(node: Node<'MemberExpression'>) {
                if (!alreadyReported) {
                    report(node);
                }
            },
        };
    },
};
export default rule;
