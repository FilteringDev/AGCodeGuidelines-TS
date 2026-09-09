import path from 'node:path';
import type { LegacyRule, Fixer, ModuleSource } from '../../types';
import { getPhysicalFilename } from '../../utils/contextCompat';
import { getFileExtensions } from '../../utils/ignore';
import moduleVisitor from '../../utils/moduleVisitor';
import resolve from '../../utils/resolve';
import docsUrl from '../docsUrl';

/**
 * @file Ensures that there are no useless path segments
 */

/**
 * convert a potentially relative path from node utils into a true
 * relative path.
 *
 * ../ -> ..
 * ./ -> .
 * .foo/bar -> ./.foo/bar
 * ..foo/bar -> ./..foo/bar
 * foo/bar -> ./foo/bar
 * @param relativePath {string} relative posix path potentially missing leading './'
 * @returns relative posix path that always starts with a ./
 */
function toRelativePath(relativePath: string) {
    const stripped = relativePath.replace(/\/$/g, ''); // Remove trailing /

    return /^((\.\.)|(\.))($|\/)/.test(stripped) ? stripped : `./${stripped}`;
}

/**
 * Normalize.
 * @param fn The fn value.
 * @returns The result of this check.
 */
function normalize(fn: string) {
    return toRelativePath(path.posix.normalize(fn));
}

/**
 * Count relative parents.
 * @param pathSegments The path segments value.
 * @returns The result of this check.
 */
function countRelativeParents(pathSegments: string[]) {
    return pathSegments.filter((x) => x === '..').length;
}

const rule: LegacyRule<[{ commonjs?: boolean; noUselessIndex?: boolean }?]> = {
    meta: {
        type: 'suggestion',
        docs: {
            category: 'Static analysis',
            description: 'Forbid unnecessary path segments in import and require statements.',
            url: docsUrl('no-useless-path-segments'),
        },

        fixable: 'code',

        schema: [
            {
                type: 'object',
                properties: {
                    commonjs: { type: 'boolean' },
                    noUselessIndex: { type: 'boolean' },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const currentDir = path.dirname(getPhysicalFilename(context));
        const options = context.options[0];

        /**
         * Check source value.
         * @param source The source text.
         * @returns The result of this check.
         */
        function checkSourceValue(source: ModuleSource) {
            const { value: importPath } = source;

            /**
             * Report with proposed path.
             * @param proposedPath The proposed path value.
             */
            function reportWithProposedPath(proposedPath: string) {
                context.report({
                    node: source,
                    // Note: Using messageIds is not possible due to the support for ESLint 2 and 3
                    message: `Useless path segments for "${importPath}", should be "${proposedPath}"`,
                    fix: (fixer: Fixer) => (proposedPath
                        ? fixer.replaceText(source, JSON.stringify(proposedPath))
                        : null),
                });
            }

            // Only relative imports are relevant for this rule --> Skip checking
            if (!importPath.startsWith('.')) {
                return undefined;
            }

            // Report rule violation if path is not the shortest possible
            const resolvedPath = resolve(importPath, context);
            const normedPath = normalize(importPath);
            const resolvedNormedPath = resolve(normedPath, context);
            if (normedPath !== importPath && resolvedPath === resolvedNormedPath) {
                return reportWithProposedPath(normedPath);
            }

            const fileExtensions = getFileExtensions(context.settings);
            const regexUnnecessaryIndex = new RegExp(
                `.*\\/index(\\${Array.from(fileExtensions).join('|\\')})?$`,
            );

            // Check if path contains unnecessary index (including a configured extension)
            if (options && options.noUselessIndex && regexUnnecessaryIndex.test(importPath)) {
                const parentDirectory = path.dirname(importPath);

                // Try to find ambiguous imports
                if (parentDirectory !== '.' && parentDirectory !== '..') {
                    const entryIterator0 = fileExtensions[Symbol.iterator]();
                    for (
                        let entryStep1 = entryIterator0.next();
                        !entryStep1.done;
                        entryStep1 = entryIterator0.next()
                    ) {
                        const fileExtension = entryStep1.value;
                        if (resolve(`${parentDirectory}${fileExtension}`, context)) {
                            return reportWithProposedPath(`${parentDirectory}/`);
                        }
                    }
                }

                return reportWithProposedPath(parentDirectory);
            }

            // Path is shortest possible + starts from the current directory --> Return directly
            if (importPath.startsWith('./')) {
                return undefined;
            }

            // Path is not existing --> Return directly (following code requires path to be defined)
            if (resolvedPath === undefined) {
                return undefined;
            }

            const expected = path.relative(currentDir, resolvedPath!); // Expected import path
            const expectedSplit = expected.split(path.sep); // Split by / or \ (depending on OS)
            const importPathSplit = importPath.replace(/^\.\//, '').split('/');
            const countImportPathRelativeParents = countRelativeParents(importPathSplit);
            const countExpectedRelativeParents = countRelativeParents(expectedSplit);
            const diff = countImportPathRelativeParents - countExpectedRelativeParents;

            // Same number of relative parents --> Paths are the same --> Return directly
            if (diff <= 0) {
                return undefined;
            }

            // Report and propose minimal number of required relative parents
            return reportWithProposedPath(
                toRelativePath(
                    importPathSplit
                        .slice(0, countExpectedRelativeParents)
                        .concat(importPathSplit.slice(countImportPathRelativeParents + diff))
                        .join('/'),
                ),
            );
        }

        return moduleVisitor(checkSourceValue, options);
    },
};
export default rule;
