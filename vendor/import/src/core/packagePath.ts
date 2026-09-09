import { dirname } from 'node:path';
import type { RuleContext } from '../../types';
import { getPhysicalFilename } from '../../utils/contextCompat';
import pkgUp from '../../utils/pkgUp';
import readPkgUp from '../../utils/readPkgUp';

/**
 * Get file package path.
 * @param filePath The file path value.
 * @returns The result of this check.
 */
export function getFilePackagePath(filePath: string) {
    const fp = pkgUp({ cwd: filePath });
    return dirname(fp!);
}

/**
 * Get context package path.
 * @param context The rule context.
 * @returns The result of this check.
 */
export function getContextPackagePath(context: RuleContext) {
    return getFilePackagePath(getPhysicalFilename(context));
}

/**
 * Get file package name.
 * @param filePath The file path value.
 * @returns The result of this check.
 */
export function getFilePackageName(filePath: string): string | null {
    const { pkg, path } = readPkgUp({ cwd: filePath, normalize: false });
    if (pkg) {
        // recursion in case of intermediate esm package.json without name found
        return pkg.name || getFilePackageName(dirname(dirname(path)));
    }
    return null;
}
