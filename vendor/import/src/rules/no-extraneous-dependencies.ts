import path from 'node:path';
import fs from 'node:fs';
import minimatch from 'minimatch';
import type {
    Node, LegacyRule, RuleContext, PackageJson,
} from '../../types';
import { getPhysicalFilename } from '../../utils/contextCompat';
import pkgUp from '../../utils/pkgUp';
import resolve from '../../utils/resolve';
import moduleVisitor from '../../utils/moduleVisitor';
import importType from '../core/importType';
import { getFilePackageName } from '../core/packagePath';
import docsUrl from '../docsUrl';

interface DependencyFields {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    optionalDependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
    bundledDependencies: string[];
}
interface DeclarationStatus {
    isInDeps: boolean;
    isInDevDeps: boolean;
    isInOptDeps: boolean;
    isInPeerDeps: boolean;
    isInBundledDeps: boolean;
}
interface DependencyPolicy {
    verifyTypeImports: boolean;
    verifyInternalDeps: boolean;
    allowDevDeps: boolean;
    allowPeerDeps: boolean;
    allowOptDeps: boolean;
    allowBundledDeps: boolean;
}
export interface DependencyOptions {
    devDependencies?: boolean | string[];
    optionalDependencies?: boolean | string[];
    peerDependencies?: boolean | string[];
    bundledDependencies?: boolean | string[];
    packageDir?: string | string[];
    includeInternal?: boolean;
    includeTypes?: boolean;
}
const depFieldCache = new Map<string | null, DependencyFields>();

/**
 * Has keys.
 * @param obj The obj value.
 * @returns The result of this check.
 */
function hasKeys(obj: object = {}) {
    return Object.keys(obj).length > 0;
}

/**
 * Array or keys.
 * @param arrayOrObject The array or object value.
 * @returns The result of this check.
 */
function arrayOrKeys(arrayOrObject: string[] | Record<string, unknown>) {
    return Array.isArray(arrayOrObject) ? arrayOrObject : Object.keys(arrayOrObject);
}

/**
 * Read json.
 * @param jsonPath The json path value.
 * @param throwException The throw exception value.
 * @returns The result of this check.
 */
function readJSON(jsonPath: string | null, throwException: boolean) {
    try {
        return JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as PackageJson;
    } catch (err) {
        if (throwException) {
            throw err;
        }
    }

    return undefined;
}

/**
 * Extract dep fields.
 * @param pkg The pkg value.
 * @returns The result of this check.
 */
function extractDepFields(pkg: PackageJson): DependencyFields {
    return {
        dependencies: pkg.dependencies || {},
        devDependencies: pkg.devDependencies || {},
        optionalDependencies: pkg.optionalDependencies || {},
        peerDependencies: pkg.peerDependencies || {},
        // BundledDeps should be in the form of an array, but object notation is also supported by
        // `npm`, so we convert it to an array if it is an object
        bundledDependencies: arrayOrKeys(pkg.bundleDependencies || pkg.bundledDependencies || []),
    };
}

/**
 * Get package dep fields.
 * @param packageJsonPath The package json path value.
 * @param throwAtRead The throw at read value.
 * @returns The result of this check.
 */
function getPackageDepFields(packageJsonPath: string | null, throwAtRead: boolean) {
    if (!depFieldCache.has(packageJsonPath)) {
        const packageJson = readJSON(packageJsonPath, throwAtRead);
        if (packageJson) {
            const depFields = extractDepFields(packageJson);
            depFieldCache.set(packageJsonPath, depFields);
        }
    }

    return depFieldCache.get(packageJsonPath);
}

/**
 * Get dependencies.
 * @param context The rule context.
 * @param packageDir The package dir value.
 * @returns The result of this check.
 */
function getDependencies(context: RuleContext, packageDir: string | string[] | undefined) {
    let paths: string[] = [];
    try {
        const packageContent: DependencyFields = {
            dependencies: {},
            devDependencies: {},
            optionalDependencies: {},
            peerDependencies: {},
            bundledDependencies: [],
        };

        if (packageDir && packageDir.length > 0) {
            if (!Array.isArray(packageDir)) {
                paths = [path.resolve(packageDir)];
            } else {
                paths = packageDir.map((dir) => path.resolve(dir));
            }
        }

        if (paths.length > 0) {
            // use rule config to find package.json
            paths.forEach((dir) => {
                const packageJsonPath = path.join(dir, 'package.json');
                const selectedPackageContent = getPackageDepFields(packageJsonPath, paths.length === 1);
                if (selectedPackageContent) {
                    Object.keys(packageContent).forEach((depsKey) => {
                        Object.assign(
                            packageContent[depsKey as keyof DependencyFields],
                            selectedPackageContent[depsKey as keyof DependencyFields],
                        );
                    });
                }
            });
        } else {
            const packageJsonPath = pkgUp({
                cwd: getPhysicalFilename(context),
                normalize: false,
            });

            // use closest package.json
            Object.assign(packageContent, getPackageDepFields(packageJsonPath, false));
        }

        if (
            ![
                packageContent.dependencies,
                packageContent.devDependencies,
                packageContent.optionalDependencies,
                packageContent.peerDependencies,
                packageContent.bundledDependencies,
            ].some(hasKeys)
        ) {
            return null;
        }

        return packageContent;
    } catch (e) {
        const packageError = e as NodeJS.ErrnoException;
        if (paths.length > 0 && packageError.code === 'ENOENT') {
            context.report({
                message: 'The package.json file could not be found.',
                loc: { line: 0, column: 0 },
            });
        }
        if (packageError.name === 'JSONError' || e instanceof SyntaxError) {
            context.report({
                message: `The package.json file could not be parsed: ${packageError.message}`,
                loc: { line: 0, column: 0 },
            });
        }

        return null;
    }
}

/**
 * Missing error message.
 * @param packageName The package name value.
 * @returns The result of this check.
 */
function missingErrorMessage(packageName: string) {
    return `'${packageName}' should be listed in the project's dependencies. Run 'npm i -S ${packageName}' to add it`;
}

/**
 * Dev dep error message.
 * @param packageName The package name value.
 * @returns The result of this check.
 */
function devDepErrorMessage(packageName: string) {
    return `'${packageName}' should be listed in the project's dependencies, not devDependencies.`;
}

/**
 * Opt dep error message.
 * @param packageName The package name value.
 * @returns The result of this check.
 */
function optDepErrorMessage(packageName: string) {
    return `'${packageName}' should be listed in the project's dependencies, not optionalDependencies.`;
}

/**
 * Get module original name.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function getModuleOriginalName(name: string) {
    const [first, second] = name.split('/');
    return first!.startsWith('@') ? `${first}/${second}` : first!;
}

/**
 * Get module real name.
 * @param resolved The resolved value.
 * @returns The result of this check.
 */
function getModuleRealName(resolved: string) {
    return getFilePackageName(resolved);
}

/**
 * Check dependency declaration.
 * @param deps The deps value.
 * @param packageName The package name value.
 * @param [declarationStatus] The declaration status value.
 * @returns The result of this check.
 */
function checkDependencyDeclaration(
    deps: DependencyFields,
    packageName: string | null,
    declarationStatus?: DeclarationStatus,
) {
    const newDeclarationStatus = declarationStatus || {
        isInDeps: false,
        isInDevDeps: false,
        isInOptDeps: false,
        isInPeerDeps: false,
        isInBundledDeps: false,
    };

    // in case of sub package.json inside a module
    // check the dependencies on all hierarchy
    const packageHierarchy: string[] = [];
    const packageNameParts = packageName ? packageName.split('/') : [];
    packageNameParts.forEach((namePart, index) => {
        if (!namePart.startsWith('@')) {
            const ancestor = packageNameParts.slice(0, index + 1).join('/');
            packageHierarchy.push(ancestor);
        }
    });

    return packageHierarchy.reduce(
        (result, ancestorName) => ({
            isInDeps: result.isInDeps || deps.dependencies[ancestorName] !== undefined,
            isInDevDeps: result.isInDevDeps || deps.devDependencies[ancestorName] !== undefined,
            isInOptDeps: result.isInOptDeps || deps.optionalDependencies[ancestorName] !== undefined,
            isInPeerDeps: result.isInPeerDeps || deps.peerDependencies[ancestorName] !== undefined,
            isInBundledDeps:
                result.isInBundledDeps || deps.bundledDependencies.indexOf(ancestorName) !== -1,
        }),
        newDeclarationStatus,
    );
}

/**
 * Report if missing.
 * @param context The rule context.
 * @param deps The deps value.
 * @param depsOptions The deps options value.
 * @param node The node to inspect.
 * @param name The name to inspect.
 */
function reportIfMissing(
    context: RuleContext,
    deps: DependencyFields,
    depsOptions: DependencyPolicy,
    node: Node,
    name: string,
) {
    // Do not report when importing types unless option is enabled
    if (
        !depsOptions.verifyTypeImports
        && (node.importKind === 'type'
            || node.importKind === 'typeof'
            || node.exportKind === 'type'
            || (Array.isArray(node.specifiers)
                && node.specifiers.length
                && node.specifiers.every(
                    (specifier) => specifier.importKind === 'type' || specifier.importKind === 'typeof',
                )))
    ) {
        return;
    }

    const typeOfImport = importType(name, context);

    if (
        typeOfImport !== 'external'
        && (typeOfImport !== 'internal' || !depsOptions.verifyInternalDeps)
    ) {
        return;
    }

    const resolved = resolve(name, context);
    if (!resolved) {
        return;
    }

    const importPackageName = getModuleOriginalName(name);
    let declarationStatus = checkDependencyDeclaration(deps, importPackageName);

    if (
        declarationStatus.isInDeps
        || (depsOptions.allowDevDeps && declarationStatus.isInDevDeps)
        || (depsOptions.allowPeerDeps && declarationStatus.isInPeerDeps)
        || (depsOptions.allowOptDeps && declarationStatus.isInOptDeps)
        || (depsOptions.allowBundledDeps && declarationStatus.isInBundledDeps)
    ) {
        return;
    }

    // test the real name from the resolved package.json
    // if not aliased imports (alias/react for example), importPackageName can be misinterpreted
    const realPackageName = getModuleRealName(resolved);
    if (realPackageName && realPackageName !== importPackageName) {
        declarationStatus = checkDependencyDeclaration(deps, realPackageName, declarationStatus);

        if (
            declarationStatus.isInDeps
            || (depsOptions.allowDevDeps && declarationStatus.isInDevDeps)
            || (depsOptions.allowPeerDeps && declarationStatus.isInPeerDeps)
            || (depsOptions.allowOptDeps && declarationStatus.isInOptDeps)
            || (depsOptions.allowBundledDeps && declarationStatus.isInBundledDeps)
        ) {
            return;
        }
    }

    if (declarationStatus.isInDevDeps && !depsOptions.allowDevDeps) {
        context.report(node, devDepErrorMessage(realPackageName || importPackageName));
        return;
    }

    if (declarationStatus.isInOptDeps && !depsOptions.allowOptDeps) {
        context.report(node, optDepErrorMessage(realPackageName || importPackageName));
        return;
    }

    context.report(node, missingErrorMessage(realPackageName || importPackageName));
}

/**
 * Test config.
 * @param config The configured rule options.
 * @param filename The filename value.
 * @returns The result of this check.
 */
function testConfig(config: boolean | string[] | undefined, filename: string) {
    // Simplest configuration first, either a boolean or nothing.
    if (typeof config === 'boolean' || typeof config === 'undefined') {
        return config;
    }
    // Array of globs.
    return config.some(
        (c) => minimatch(filename, c) || minimatch(filename, path.join(process.cwd(), c)),
    );
}

const rule: LegacyRule<[DependencyOptions?]> & { 'Program:exit'(): void } = {
    meta: {
        type: 'problem',
        docs: {
            category: 'Helpful warnings',
            description: 'Forbid the use of extraneous packages.',
            url: docsUrl('no-extraneous-dependencies'),
        },

        schema: [
            {
                type: 'object',
                properties: {
                    devDependencies: { type: ['boolean', 'array'] },
                    optionalDependencies: { type: ['boolean', 'array'] },
                    peerDependencies: { type: ['boolean', 'array'] },
                    bundledDependencies: { type: ['boolean', 'array'] },
                    packageDir: { type: ['string', 'array'] },
                    includeInternal: { type: ['boolean'] },
                    includeTypes: { type: ['boolean'] },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const options = context.options[0] || {};
        const filename = getPhysicalFilename(context);
        const deps = getDependencies(context, options.packageDir) || extractDepFields({});

        const depsOptions = {
            allowDevDeps: testConfig(options.devDependencies, filename) !== false,
            allowOptDeps: testConfig(options.optionalDependencies, filename) !== false,
            allowPeerDeps: testConfig(options.peerDependencies, filename) !== false,
            allowBundledDeps: testConfig(options.bundledDependencies, filename) !== false,
            verifyInternalDeps: !!options.includeInternal,
            verifyTypeImports: !!options.includeTypes,
        };

        return moduleVisitor(
            (source, node: Node) => {
                reportIfMissing(context, deps, depsOptions, node, source.value);
            },
            { commonjs: true },
        );
    },

    'Program:exit': function onProgramExit() {
        depFieldCache.clear();
    },
};
export default rule;
