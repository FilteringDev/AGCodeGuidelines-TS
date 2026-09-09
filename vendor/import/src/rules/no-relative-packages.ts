import path from 'node:path';
import type {
    Node, Fixer, LegacyRule, RuleContext,
} from '../../types';
import readPkgUp from '../../utils/readPkgUp';
import { getPhysicalFilename } from '../../utils/contextCompat';
import resolve from '../../utils/resolve';
import moduleVisitor, { makeOptionsSchema } from '../../utils/moduleVisitor';
import importType from '../core/importType';
import docsUrl from '../docsUrl';

/**
 * @param filePath The file path value.
 * @returns The result of this check.
 */
function toPosixPath(filePath: string) {
    return filePath.replace(/\\/g, '/');
}

/**
 * Find named package.
 * @param filePath The file path value.
 * @returns The result of this check.
 */
function findNamedPackage(filePath: string): ReturnType<typeof readPkgUp> {
    const found = readPkgUp({ cwd: filePath });
    if (found.pkg && !found.pkg.name) {
        return findNamedPackage(path.join(found.path, '../..'));
    }
    return found;
}

/**
 * Check import for relative package.
 * @param context The rule context.
 * @param importPath The import path value.
 * @param node The node to inspect.
 */
function checkImportForRelativePackage(context: RuleContext, importPath: string, node: Node) {
    const potentialViolationTypes = ['parent', 'index', 'sibling'];
    if (potentialViolationTypes.indexOf(importType(importPath, context)) === -1) {
        return;
    }

    const resolvedImport = resolve(importPath, context);
    const resolvedContext = getPhysicalFilename(context);

    if (!resolvedImport || !resolvedContext) {
        return;
    }

    const importPkg = findNamedPackage(resolvedImport);
    const contextPkg = findNamedPackage(resolvedContext);

    if (importPkg.pkg && contextPkg.pkg && importPkg.pkg.name !== contextPkg.pkg.name) {
        const importBaseName = path.basename(importPath);
        const importRoot = path.dirname(importPkg.path);
        const properPath = path.relative(importRoot, resolvedImport);
        const properImport = path.join(
            importPkg.pkg.name!,
            path.dirname(properPath),
            importBaseName === path.basename(importRoot) ? '' : importBaseName,
        );
        context.report({
            node,
            message: `Relative import from another package is not allowed. Use \`${properImport}\` instead of \`${importPath}\``,
            fix: (fixer: Fixer) => fixer.replaceText(node, JSON.stringify(toPosixPath(properImport))),
        });
    }
}

const rule: LegacyRule<[{ commonjs?: boolean; amd?: boolean; esmodule?: boolean; ignore?: string[] }?]> = {
    meta: {
        type: 'suggestion',
        docs: {
            category: 'Static analysis',
            description: 'Forbid importing packages through relative paths.',
            url: docsUrl('no-relative-packages'),
        },
        fixable: 'code',
        schema: [makeOptionsSchema()],
    },

    create(context) {
        return moduleVisitor(
            (source) => checkImportForRelativePackage(context, source.value, source),
            context.options[0],
        );
    },
};
export default rule;
