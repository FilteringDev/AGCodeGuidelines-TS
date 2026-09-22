/** @file Element and dependency info resolution. */
import { isBuiltin } from 'node:module';
import { getPhysicalFilename } from '../../../import/utils/contextCompat';
import resolveImport from '../../../import/utils/resolve';
import type { RuleContext } from '../../../import/types';
import {
    IGNORE,
    INCLUDE,
    VALID_MODES,
} from '../constants/settings';
import { getElements, getRootPath } from '../helpers/settings';
import { isArray } from '../helpers/utils';
import { capture, isMatch, makeRe } from '../glob';
import type { ElementInfo } from '../helpers/rules';

export interface FileInfo extends ElementInfo {
    path: string | null;
    isIgnored: boolean;
    parents: { type: string | null; elementPath: string | null }[];
}

export interface DependencyInfo extends FileInfo {
    source: string;
    isLocal: boolean;
    isBuiltIn: boolean;
    isExternal: boolean;
    baseModule: string | null;
    importKind: string;
    relationship: string | null;
    isInternal: boolean;
}

interface CacheEntry {
    [key: string]: FileInfo | DependencyInfo;
}

const fileCaches = new WeakMap<object, CacheEntry>();
const importCaches = new WeakMap<object, CacheEntry>();

/**
 * Load a cached entry for the given settings.
 * @param cache The cache map.
 * @param key The cache key.
 * @param settings The ESLint settings.
 * @returns The cached entry or null.
 */
function loadCache(
    cache: WeakMap<object, CacheEntry>,
    key: string,
    settings: object,
): FileInfo | DependencyInfo | null {
    const entries = cache.get(settings);
    return entries?.[key] ?? null;
}

/**
 * Save a cache entry for the given settings.
 * @param cache The cache map.
 * @param key The cache key.
 * @param value The entry value.
 * @param settings The ESLint settings.
 */
function saveCache(
    cache: WeakMap<object, CacheEntry>,
    key: string,
    value: FileInfo | DependencyInfo,
    settings: object,
): void {
    let entries = cache.get(settings);
    if (!entries) {
        entries = {};
        cache.set(settings, entries);
    }
    entries[key] = value;
}

/**
 * Check for a Node.js builtin module.
 * @param moduleName The module specifier.
 * @returns Whether the module is builtin.
 */
function isCoreModule(moduleName: string): boolean {
    const withoutPrefix = moduleName.startsWith('node:')
        ? moduleName.slice(5)
        : moduleName;
    return (isBuiltin as (name: string) => boolean)(withoutPrefix);
}
const scopedRegExp = /^@[^/]*\/?[^/]+/;

/**
 * Check for a scoped package name.
 * @param name The module specifier.
 * @returns Whether the name is scoped.
 */
function isScoped(name: string): boolean {
    return Boolean(name && scopedRegExp.test(name));
}
/**
 * Get the base package name.
 * @param name The module specifier.
 * @returns The base package name.
 */
function baseModule(name: string): string {
    if (isScoped(name)) {
        const [scope, packageName] = name.split('/');
        return `${scope}/${packageName}`;
    }
    const [pkg] = name.split('/');
    return pkg ?? '';
}

const externalModuleRegExp = /^\w/;

/**
 * Check for an external module.
 * @param name The module specifier.
 * @param path The resolved path.
 * @returns Whether the module is external.
 */
function isExternal(name: string, path: string | null): boolean {
    return (
        (!path || (!!path && path.includes('node_modules')))
        && (externalModuleRegExp.test(name) || isScoped(name))
    );
}

/**
 * Check the ignore/include settings.
 * @param path The project-relative path.
 * @param settings The ESLint settings.
 * @returns Whether the path matches ignore.
 */
function matchesIgnoreSetting(path: string, settings: Record<string, unknown>): boolean {
    return isMatch(path, (settings[IGNORE] as string | string[]) || []);
}

/**
 * Check whether a path is ignored.
 * @param path The project-relative path.
 * @param settings The ESLint settings.
 * @returns Whether the path is ignored.
 */
function isIgnored(path: string | null, settings: Record<string, unknown>): boolean {
    if (!path) {
        return true;
    }
    if (settings[INCLUDE]) {
        if (isMatch(path, settings[INCLUDE] as string | string[])) {
            return matchesIgnoreSetting(path, settings);
        }
        return true;
    }
    return matchesIgnoreSetting(path, settings);
}

/**
 * Check for a builtin import.
 * @param name The module specifier.
 * @param path The resolved path.
 * @returns Whether the import is builtin.
 */
function isBuiltIn(name: string, path: string | null): boolean {
    if (path || !name) {
        return false;
    }
    const base = baseModule(name);
    return isCoreModule(base);
}

/**
 * Map capture groups to named values.
 * @param captureGroups The captured groups.
 * @param captureSettings The capture names.
 * @returns The named values.
 */
function elementCaptureValues(
    captureGroups: string[],
    captureSettings: string[] | undefined,
): Record<string, string> | null {
    if (!captureSettings) {
        return null;
    }
    const values: Record<string, string> = {};
    for (let captureIndex = 0; captureIndex < captureGroups.length; captureIndex += 1) {
        const setting = captureSettings[captureIndex];
        if (setting) {
            values[setting] = captureGroups[captureIndex]!;
        }
    }
    return values;
}

/**
 * Resolve the element path from a matching pattern.
 * @param pattern The element pattern.
 * @param pathSegmentsMatching The matching segments.
 * @param fullPath The full reversed segments.
 * @returns The element path.
 */
function getElementPath(pattern: string, pathSegmentsMatching: string[], fullPath: string[]): string {
    // Get full left side of the path matching pattern (full element path except internal files)
    const elementPathRegexp = makeRe(pattern);
    const testedSegments: string[] = [];
    let result = '';
    for (let segmentIndex = 0; segmentIndex < pathSegmentsMatching.length; segmentIndex += 1) {
        if (!result) {
            testedSegments.push(pathSegmentsMatching[segmentIndex]!);
            const joinedSegments = testedSegments.join('/');
            if (elementPathRegexp.test(joinedSegments)) {
                result = joinedSegments;
            }
        }
    }
    return `${[...fullPath].reverse().join('/').split(result)[0]}${result}`;
}

interface ElementAccumulator {
    type: string | null;
    elementPath: string | null;
    capture: string[] | null;
    capturedValues: Record<string, string> | null;
    internalPath: string | null;
    parents: { type: string | null; elementPath: string | null }[];
}

/**
 * Match a project path against configured elements.
 * @param path The project-relative path.
 * @param settings The ESLint settings.
 * @returns The element result with parents.
 */
function elementTypeAndParents(path: string, settings: Record<string, unknown>): ElementAccumulator {
    const parents: ElementAccumulator['parents'] = [];
    const elementResult: ElementAccumulator = {
        type: null,
        elementPath: null,
        capture: null,
        capturedValues: null,
        internalPath: null,
        parents,
    };

    if (isIgnored(path, settings)) {
        return elementResult;
    }

    const segments = path.split('/').reverse();
    let accumulator: string[] = [];
    let lastSegmentMatching = 0;
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
        const elementPathSegment = segments[segmentIndex]!;
        accumulator.unshift(elementPathSegment);
        let elementFound = false;
        for (let elementIndex = 0; elementIndex < getElements(settings).length; elementIndex += 1) {
            const element = getElements(settings)[elementIndex]!;
            const typeOfMatch = VALID_MODES.includes(element.mode ?? '') ? element.mode : VALID_MODES[0];
            const elementPatterns = isArray(element.pattern)
                ? element.pattern as string[]
                : [element.pattern];
            for (let patternIndex = 0; patternIndex < elementPatterns.length; patternIndex += 1) {
                const elementPattern = elementPatterns[patternIndex]!;
                if (!elementFound) {
                    const useFullPathMatch = typeOfMatch === VALID_MODES[2] && !elementResult.type;
                    const pattern = typeOfMatch === VALID_MODES[0] && !elementResult.type
                        ? `${elementPattern}/**/*`
                        : elementPattern;
                    let basePatternCapture: string[] | null = [];
                    let hasBasePattern = true;

                    if (element.basePattern) {
                        basePatternCapture = capture(
                            [element.basePattern, '**', pattern].join('/'),
                            path.split('/').slice(0, path.split('/').length - lastSegmentMatching).join('/'),
                        );
                        hasBasePattern = basePatternCapture !== null;
                    }
                    const captured = capture(pattern, useFullPathMatch ? path : accumulator.join('/'));

                    if (captured && hasBasePattern) {
                        elementFound = true;
                        lastSegmentMatching = segmentIndex + 1;
                        let capturedValues = elementCaptureValues(captured, element.capture);
                        if (element.basePattern) {
                            capturedValues = {
                                ...elementCaptureValues(basePatternCapture ?? [], element.baseCapture),
                                ...capturedValues,
                            };
                        }
                        const elementPath = useFullPathMatch
                            ? path
                            : getElementPath(elementPattern, accumulator, segments);
                        accumulator = [];
                        if (!elementResult.type) {
                            elementResult.type = element.type;
                            elementResult.elementPath = elementPath;
                            elementResult.capture = captured;
                            elementResult.capturedValues = capturedValues;
                            elementResult.internalPath = typeOfMatch === VALID_MODES[0]
                                ? path.replace(`${elementPath}/`, '')
                                : elementPath.split('/').pop() ?? null;
                        } else {
                            parents.push({
                                type: element.type,
                                elementPath,
                            });
                        }
                    }
                }
            }
        }
    }

    return elementResult;
}

/**
 * Normalize absolute paths to slashes.
 * @param absolutePath The absolute path.
 * @returns The normalized path.
 */
function replacePathSlashes(absolutePath: string): string {
    return absolutePath.replace(/\\/g, '/');
}

/**
 * Resolve a project-relative path.
 * @param absolutePath The absolute path.
 * @param rootPath The root path.
 * @returns The project-relative path.
 */
function projectPath(absolutePath: string | null, rootPath: string): string | null {
    if (absolutePath) {
        return replacePathSlashes(absolutePath).replace(`${replacePathSlashes(rootPath)}/`, '');
    }
    return null;
}

/**
 * Strip the base module from an external source.
 * @param source The import source.
 * @param baseModuleValue The base module name.
 * @returns The module-internal path.
 */
function externalModulePath(source: string, baseModuleValue: string): string {
    return source.replace(baseModuleValue, '');
}

/**
 * Resolve dependency element info for an import source.
 * @param source The import source.
 * @param context The rule context.
 * @returns The dependency info.
 */
export function importInfo(source: string, context: RuleContext): DependencyInfo {
    const settings = (context.settings ?? {}) as Record<string, unknown>;
    const path = projectPath(resolveImport(source, context) ?? null, getRootPath(settings));
    const isExternalModule = isExternal(source, path);
    const resultCache = loadCache(importCaches, isExternalModule ? source : path ?? '', settings);
    if (resultCache) {
        return resultCache as DependencyInfo;
    }
    const baseModuleValue = isExternalModule ? baseModule(source) : null;
    const isBuiltInModule = isBuiltIn(source, path);
    const pathToUse = isExternalModule && baseModuleValue
        ? externalModulePath(source, baseModuleValue)
        : path;
    const elementResult = elementTypeAndParents(pathToUse ?? '', settings);

    const result: DependencyInfo = {
        source,
        path: pathToUse,
        isIgnored: !isExternalModule && isIgnored(pathToUse, settings),
        isLocal: !isExternalModule && !isBuiltInModule,
        isBuiltIn: isBuiltInModule,
        isExternal: isExternalModule,
        baseModule: baseModuleValue,
        ...elementResult,
        importKind: 'value',
        relationship: null,
        isInternal: false,
        parents: elementResult.parents,
    };

    saveCache(importCaches, path ?? '', result, settings);
    return result;
}

/**
 * Resolve file element info for the current file.
 * @param context The rule context.
 * @returns The file info.
 */
export function fileInfo(context: RuleContext): FileInfo {
    const settings = (context.settings ?? {}) as Record<string, unknown>;
    const path = projectPath(getPhysicalFilename(context), getRootPath(settings));
    const resultCache = loadCache(fileCaches, path ?? '', settings);
    if (resultCache) {
        return resultCache as FileInfo;
    }
    const elementResult = elementTypeAndParents(path ?? '', settings);
    const result: FileInfo = {
        path,
        isIgnored: isIgnored(path, settings),
        ...elementResult,
        parents: elementResult.parents,
    };
    saveCache(fileCaches, path ?? '', result, settings);
    return result;
}

/**
 * Get the parent element path.
 * @param elementInfo The element info.
 * @returns The parent path.
 */
function getParent(elementInfo: FileInfo): string | null | undefined {
    return elementInfo.parents?.[0]?.elementPath;
}

/**
 * Find the common ancestor element path.
 * @param elementInfoA The first element info.
 * @param elementInfoB The second element info.
 * @returns The common ancestor path.
 */
function getCommonAncestor(elementInfoA: FileInfo, elementInfoB: FileInfo): string | null | undefined {
    const commonAncestor = elementInfoA.parents.find((parentA) => Boolean(elementInfoB.parents.find(
        (parentB) => parentA.elementPath === parentB.elementPath,
    )));
    return commonAncestor?.elementPath;
}

/**
 * Check for an uncle relationship.
 * @param elementA The first element.
 * @param elementB The second element.
 * @returns Whether A is an uncle of B.
 */
function isUncle(elementA: FileInfo, elementB: FileInfo): boolean {
    const commonAncestor = getCommonAncestor(elementA, elementB);
    return Boolean(commonAncestor && commonAncestor === getParent(elementA));
}

/**
 * Check for a brother relationship.
 * @param elementA The first element.
 * @param elementB The second element.
 * @returns Whether the elements are brothers.
 */
function isBrother(elementA: FileInfo, elementB: FileInfo): boolean {
    const parentA = getParent(elementA);
    const parentB = getParent(elementB);
    return Boolean(parentA && parentB && parentA === parentB);
}

/**
 * Check for a descendant relationship.
 * @param elementA The first element.
 * @param elementB The second element.
 * @returns Whether A descends from B.
 */
function isDescendant(elementA: FileInfo, elementB: FileInfo): boolean {
    return Boolean(elementA.parents.find((parent) => parent.elementPath === elementB.elementPath));
}

/**
 * Check for a child relationship.
 * @param elementA The first element.
 * @param elementB The second element.
 * @returns Whether A is a child of B.
 */
function isChild(elementA: FileInfo, elementB: FileInfo): boolean {
    return getParent(elementA) === elementB.elementPath;
}

/**
 * Check for an internal relationship.
 * @param elementA The first element.
 * @param elementB The second element.
 * @returns Whether both are internal to the same element.
 */
function isInternal(elementA: FileInfo, elementB: FileInfo): boolean {
    return elementA.elementPath === elementB.elementPath;
}

/**
 * Describe the dependency relationship.
 * @param dependency The dependency info.
 * @param element The file element.
 * @returns The relationship name.
 */
function dependencyRelationship(dependency: DependencyInfo, element: FileInfo): string | null {
    if (!dependency.isLocal || dependency.isIgnored || !element.type || !dependency.type) {
        return null;
    }
    if (isInternal(dependency, element)) {
        return 'internal';
    }
    if (isChild(dependency, element)) {
        return 'child';
    }
    if (isDescendant(dependency, element)) {
        return 'descendant';
    }
    if (isBrother(dependency, element)) {
        return 'brother';
    }
    if (isChild(element, dependency)) {
        return 'parent';
    }
    if (isUncle(dependency, element)) {
        return 'uncle';
    }
    if (isDescendant(element, dependency)) {
        return 'ancestor';
    }
    return null;
}

/**
 * Resolve dependency info with relationship data.
 * @param source The import source.
 * @param importKind The dependency import kind.
 * @param context The rule context.
 * @returns The dependency info.
 */
export function dependencyInfo(source: string, importKind: string, context: RuleContext): DependencyInfo {
    const elementInfo = fileInfo(context);
    const dependency = importInfo(source, context);

    return {
        ...dependency,
        importKind: importKind || 'value',
        relationship: dependencyRelationship(dependency, elementInfo),
        isInternal: isInternal(dependency, elementInfo),
    };
}
