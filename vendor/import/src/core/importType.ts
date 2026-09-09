import { isAbsolute as nodeIsAbsolute, relative, resolve as nodeResolve } from 'node:path';
import isCoreModule from 'is-core-module';
import type { ImportSettings, RuleContext } from '../../types';
import resolve from '../../utils/resolve';
import { getContextPackagePath } from './packagePath';

const scopedRegExp = /^@[^/]+\/?[^/]+/;

/**
 * Is scoped.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
export function isScoped(name: string) {
    return name && scopedRegExp.test(name);
}

/**
 * Base module.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function baseModule(name: string) {
    if (isScoped(name)) {
        const [scope, pkg] = name.split('/');
        return `${scope}/${pkg}`;
    }
    const [pkg] = name.split('/');
    return pkg!;
}

/**
 * Is internal regex match.
 * @param name The name to inspect.
 * @param settings The settings value.
 * @returns The result of this check.
 */
function isInternalRegexMatch(name: string, settings: ImportSettings) {
    const internalScope = settings && settings['import/internal-regex'];
    return internalScope && new RegExp(internalScope).test(name);
}

/**
 * Is absolute.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
export function isAbsolute(name: string) {
    return typeof name === 'string' && nodeIsAbsolute(name);
}

// path is defined only when a resolver resolves to a non-standard path

/**
 * Is built in.
 * @param name The name to inspect.
 * @param [settings] The settings value.
 * @param [path] The path value.
 * @returns The result of this check.
 */
export function isBuiltIn(name: string, settings?: ImportSettings, path?: string | null) {
    if (path || !name) {
        return false;
    }
    const base = baseModule(name);
    const extras = (settings && settings['import/core-modules']) || [];
    return isCoreModule(base) || extras.indexOf(base) > -1;
}

const moduleRegExp = /^\w/;

/**
 * Is module.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function isModule(name: string) {
    return name && moduleRegExp.test(name);
}

const moduleMainRegExp = /^[\w]((?!\/).)*$/;

/**
 * Is module main.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function isModuleMain(name: string) {
    return name && moduleMainRegExp.test(name);
}

/**
 * Is relative to parent.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function isRelativeToParent(name: string) {
    return /^\.\.$|^\.\.[\\/]/.test(name);
}
const indexFiles = ['.', './', './index', './index.js'];

/**
 * Is index.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function isIndex(name: string) {
    return indexFiles.indexOf(name) !== -1;
}

/**
 * Is relative to sibling.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function isRelativeToSibling(name: string) {
    return /^\.[\\/]/.test(name);
}

/**
 * Is external path.
 * @param path The path value.
 * @param context The rule context.
 * @returns The result of this check.
 */
function isExternalPath(path: string | null | undefined, context: RuleContext) {
    if (!path) {
        return false;
    }

    const { settings } = context;
    const packagePath = getContextPackagePath(context);

    if (relative(packagePath, path).startsWith('..')) {
        return true;
    }

    const folders = (settings && settings['import/external-module-folders']) || ['node_modules'];
    return folders.some((folder) => {
        const folderPath = nodeResolve(packagePath, folder);
        const relativePath = relative(folderPath, path);
        return !relativePath.startsWith('..');
    });
}

/**
 * Is internal path.
 * @param path The path value.
 * @param context The rule context.
 * @returns The result of this check.
 */
function isInternalPath(path: string | null | undefined, context: RuleContext) {
    if (!path) {
        return false;
    }
    const packagePath = getContextPackagePath(context);
    return !relative(packagePath, path).startsWith('../');
}

/**
 * Is external looking name.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function isExternalLookingName(name: string) {
    return isModule(name) || isScoped(name);
}

/**
 * Type test.
 * @param name The name to inspect.
 * @param context The rule context.
 * @param path The path value.
 * @returns The result of this check.
 */
function typeTest(name: string, context: RuleContext, path: string | null | undefined) {
    const { settings } = context;
    if (isInternalRegexMatch(name, settings)) {
        return 'internal';
    }
    if (isAbsolute(name)) {
        return 'absolute';
    }
    if (isBuiltIn(name, settings, path)) {
        return 'builtin';
    }
    if (isRelativeToParent(name)) {
        return 'parent';
    }
    if (isIndex(name)) {
        return 'index';
    }
    if (isRelativeToSibling(name)) {
        return 'sibling';
    }
    if (isExternalPath(path, context)) {
        return 'external';
    }
    if (isInternalPath(path, context)) {
        return 'internal';
    }
    if (isExternalLookingName(name)) {
        return 'external';
    }
    return 'unknown';
}

/**
 * Is external module.
 * @param name The name to inspect.
 * @param path The path value.
 * @param context The rule context.
 * @returns The result of this check.
 */
export function isExternalModule(name: string, path: string | null | undefined, context: RuleContext) {
    if (arguments.length < 3) {
        throw new TypeError('isExternalModule: name, path, and context are all required');
    }
    return (isModule(name) || isScoped(name)) && typeTest(name, context, path) === 'external';
}

/**
 * Is external module main.
 * @param name The name to inspect.
 * @param path The path value.
 * @param context The rule context.
 * @returns The result of this check.
 */
export function isExternalModuleMain(
    name: string,
    path: string | null | undefined,
    context: RuleContext,
) {
    if (arguments.length < 3) {
        throw new TypeError('isExternalModule: name, path, and context are all required');
    }
    return isModuleMain(name) && typeTest(name, context, path) === 'external';
}

const scopedMainRegExp = /^@[^/]+\/?[^/]+$/;

/**
 * Is scoped main.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
export function isScopedMain(name: string) {
    return name && scopedMainRegExp.test(name);
}

/**
 * Resolve import type.
 * @param name The name to inspect.
 * @param context The rule context.
 * @returns The result of this check.
 */
export default function resolveImportType(name: string, context: RuleContext) {
    return typeTest(name, context, resolve(name, context));
}
