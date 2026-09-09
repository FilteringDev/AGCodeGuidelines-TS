/** @file Supply legacy scope metadata using a standalone analyzer, without a lint engine. */
import { analyze, Variable } from 'eslint-scope';
import globals from 'globals';

import type { Scope } from 'eslint-scope';
import type { CreateRule, ESTree } from '@oxlint/plugins';

type Context = Parameters<CreateRule['create']>[0];
type Source = Context['sourceCode'];
type LegacyVariable = Variable & {
    writeable?: boolean;
    eslintUsed?: boolean;
    eslintExported?: boolean;
    eslintImplicitGlobalSetting?: string;
    eslintExplicitGlobal?: boolean;
    eslintExplicitGlobalComments?: ESTree.Comment[];
};
const VariableConstructor = Variable as unknown as new (variableName: string, owner: Scope) => LegacyVariable;
const cache = new WeakMap<Source, Map<string, Source>>();

/**
 * Preserve TypeScript scope information while applying explicit global directives.
 * @param source - Native TypeScript source and scope graph.
 * @returns A source facade preserving explicit global declarations.
 */
function nativeCommentGlobals(source: Source): Source {
    const declarations = new Map<string, string>();
    for (const comment of source.getAllComments()) {
        if (comment.type !== 'Block') {
            continue;
        }
        const directive = /^\s*globals?\s+([^]*?)(?:\s--\s|$)/u.exec(comment.value);
        if (!directive) {
            continue;
        }
        for (const match of directive[1]!.matchAll(
            /([^\s,:]+)(?:\s*:\s*(true|false|writable|writeable|readonly|readable|off))?/gu,
        )) {
            declarations.set(match[1]!, match[2] ?? 'readonly');
        }
    }
    if (!declarations.size) {
        return source;
    }
    type NativeScope = ReturnType<Source['getScope']>;
    const scopes = new WeakMap<NativeScope, NativeScope>();
    const adapt = (scope: NativeScope): NativeScope => {
        const cached = scopes.get(scope);
        if (cached) {
            return cached;
        }
        const set = new Map(scope.set);
        if (scope.type === 'global') {
            for (const [name, value] of declarations) {
                if (value === 'off') {
                    if (!set.get(name)?.defs.length) {
                        set.delete(name);
                    }
                } else if (!set.has(name)) {
                    const variable = new VariableConstructor(name, scope as unknown as Scope);
                    variable.writeable = ['true', 'writable', 'writeable'].includes(value);
                    variable.eslintExplicitGlobal = true;
                    set.set(name, variable as unknown as NativeScope['variables'][number]);
                }
            }
        }
        const projected = Object.create(scope, {
            set: { value: set },
            variables: { value: [...set.values()] },
            upper: { get: () => (scope.upper ? adapt(scope.upper) : null) },
            childScopes: { get: () => scope.childScopes.map(adapt) },
        }) as NativeScope;
        scopes.set(scope, projected);
        return projected;
    };
    return Object.create(source, {
        getScope: { value: (node: ESTree.Node) => adapt(source.getScope(node)) },
        scopeManager: {
            value: Object.create(source.scopeManager, {
                scopes: { get: () => source.scopeManager.scopes.map(adapt) },
                globalScope: {
                    get: () => (source.scopeManager.globalScope ? adapt(source.scopeManager.globalScope) : null),
                },
            }),
        },
    }) as Source;
}

/**
 * Adapt scope metadata once per source and language configuration.
 * @param context - Native Oxlint rule context.
 * @param version - ECMAScript year or legacy language version.
 * @param parserOptions - Effective parser feature flags.
 * @returns A source facade with compatible scope metadata.
 */
export function legacySource(context: Context, version: number, parserOptions: Record<string, unknown>): Source {
    const source = context.sourceCode;
    if (/\.[cm]?tsx?$/u.test(context.filename)) {
        return nativeCommentGlobals(source);
    }
    const key = JSON.stringify([
        version,
        parserOptions,
        context.languageOptions.globals,
        context.languageOptions.env,
        context.languageOptions.sourceType,
        Object.hasOwn(context.settings, 'agEcmaVersion'),
    ]);
    const cached = cache.get(source)?.get(key);
    if (cached) {
        return cached;
    }
    const features = parserOptions.ecmaFeatures as Record<string, boolean> | undefined;
    const manager = analyze(source.ast, {
        ecmaVersion: version,
        sourceType: context.languageOptions.sourceType === 'module' ? 'module' : 'script',
        nodejsScope: features?.globalReturn || context.languageOptions.sourceType === 'commonjs',
        impliedStrict: features?.impliedStrict,
        ignoreEval: true,
        fallback: (node) => (source.visitorKeys[(node as ESTree.Node).type] as string[]) ?? [],
        childVisitorKeys: source.visitorKeys,
    } as Parameters<typeof analyze>[1]);
    const global = manager.globalScope;
    const globalSets = globals as Record<string, Record<string, boolean>>;
    const configured: Record<string, boolean | string> = { ...globalSets.es5 };
    for (const year of [2015, 2017, 2020, 2021]) {
        if (version >= year) {
            Object.assign(configured, globalSets[`es${year}`]);
        }
    }
    for (const [name, enabled] of Object.entries(context.languageOptions.env)) {
        if (enabled && name !== 'builtin') {
            Object.assign(configured, globalSets[name === 'es6' ? 'es2015' : name]);
        }
    }
    if (context.languageOptions.sourceType === 'commonjs') {
        Object.assign(configured, globalSets.commonjs);
    }
    // Production globals follow Oxlint's current environment. Historical test fixtures
    // explicitly select an ECMAScript version and retain its frozen builtin set.
    if (!Object.hasOwn(context.settings, 'agEcmaVersion')) {
        for (const variable of source.scopeManager.globalScope?.variables ?? []) {
            if (!variable.defs.length) {
                configured[variable.name] = Boolean((variable as unknown as LegacyVariable).writeable);
            }
        }
    }
    Object.assign(configured, context.languageOptions.globals);
    const implicit = { ...configured };
    const explicit = new Map<string, ESTree.Comment[]>();
    const exported = new Set<string>();
    for (const comment of source.getAllComments()) {
        if (comment.type !== 'Block') {
            continue;
        }
        const directive = /^\s*(globals?|exported)\s+([^]*?)(?:\s--\s|$)/u.exec(comment.value);
        if (!directive) {
            continue;
        }
        for (const match of directive[2]!.matchAll(
            /([^\s,:]+)(?:\s*:\s*(true|false|writable|writeable|readonly|readable|off))?/gu,
        )) {
            const name = match[1]!;
            if (directive[1] === 'exported') {
                exported.add(name);
            } else {
                configured[name] = match[2] ?? false;
                explicit.set(name, [...(explicit.get(name) ?? []), comment]);
            }
        }
    }
    for (const [name, setting] of Object.entries(configured)) {
        if (setting === 'off') {
            continue;
        }
        let variable = global.set.get(name) as LegacyVariable | undefined;
        if (!variable) {
            variable = new VariableConstructor(name, global);
            global.set.set(name, variable);
            global.variables.push(variable);
        }
        variable.writeable = setting === true || ['true', 'writable', 'writeable'].includes(String(setting));
        const settingBeforeDirectives = implicit[name];
        if (settingBeforeDirectives === undefined || settingBeforeDirectives === 'off') {
            variable.eslintImplicitGlobalSetting = settingBeforeDirectives;
        } else {
            const writable = settingBeforeDirectives === true
                || ['true', 'writable', 'writeable'].includes(String(settingBeforeDirectives));
            variable.eslintImplicitGlobalSetting = writable ? 'writable' : 'readonly';
        }
        variable.eslintExplicitGlobal = explicit.has(name);
        variable.eslintExplicitGlobalComments = explicit.get(name);
    }
    for (const name of exported) {
        const variable = global.set.get(name) as LegacyVariable | undefined;
        if (variable) {
            variable.eslintUsed = true;
            variable.eslintExported = true;
        }
    }
    global.through = global.through.filter((reference) => {
        const variable = global.set.get(reference.identifier.name);
        if (!variable) {
            return true;
        }
        Object.assign(reference, { resolved: variable });
        variable.references.push(reference);
        return false;
    });
    const getScope = (current: ESTree.Node): Scope => {
        for (let node: ESTree.Node | null = current; node; node = node.parent) {
            const scope = manager.acquire(node, current.type !== 'Program');
            if (scope) {
                return scope.type === 'function-expression-name' ? scope.childScopes[0]! : scope;
            }
        }
        return global;
    };
    const adapted = Object.create(source, {
        scopeManager: { value: manager },
        getScope: { value: getScope },
        getDeclaredVariables: { value: (node: ESTree.Node) => manager.getDeclaredVariables(node) },
        markVariableAsUsed: {
            value: (name: string, node = source.ast) => {
                let scope: Scope | null = getScope(node);
                if (scope === global && scope.childScopes[0]?.block === source.ast) {
                    [scope] = scope.childScopes;
                }
                for (; scope; scope = scope.upper) {
                    const variable = scope.set.get(name) as LegacyVariable | undefined;
                    if (variable) {
                        variable.eslintUsed = true;
                        return true;
                    }
                }
                return false;
            },
        },
    }) as Source;
    let entries = cache.get(source);
    if (!entries) {
        entries = new Map();
        cache.set(source, entries);
    }
    entries.set(key, adapted);
    return adapted;
}
