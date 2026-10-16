/** @file Adapt legacy rule context methods to Oxlint's source-code API. */
import type { CreateRule, ESTree, Rule } from '@oxlint/plugins';
import getJSDocComment from '../../../vendor/core/compat/get-jsdoc-comment';
import type { SourceCode as LegacySourceCode } from '../../../vendor/types';
import { legacySource } from './legacy-source';

type RuleContext = Parameters<CreateRule['create']>[0];
type Source = ReturnType<typeof legacySource>;

interface FileAdapter {
    root: object;
    shared: object;
    source: Source;
    sourceType: string | undefined;
    version: number;
    parserOptions: Record<string, unknown>;
    /** Merged language options per provider override object. */
    languageOverrides: WeakMap<object, object>;
    /** Node of the most recent visitor call; every adapted visitor sets it before running. */
    state: { current: ESTree.Node };
}

const SOURCE_METHODS = [
    'getText',
    'getLines',
    'getAllComments',
    'getCommentsBefore',
    'getCommentsAfter',
    'getCommentsInside',
    'getFirstToken',
    'getFirstTokens',
    'getLastToken',
    'getLastTokens',
    'getTokenBefore',
    'getTokensBefore',
    'getTokenAfter',
    'getTokensAfter',
    'getTokens',
    'getTokensBetween',
    'getTokenByRangeStart',
    'getFirstTokenBetween',
    'getLastTokenBetween',
    'getFirstTokensBetween',
    'getLastTokensBetween',
    'getNodeByRangeIndex',
    'isSpaceBetween',
    'isSpaceBetweenTokens',
];

// Each linted file has a fresh AST, unlike Oxlint's reused sourceCode singleton.
const adapters = new WeakMap<object, FileAdapter>();

/**
 * Split a rule context into Oxlint's frozen file context and the rule's own layers.
 * @param context - Oxlint context, optionally extended by a provider.
 * @returns The frozen file context and rule-specific descriptors, nearest layer first.
 */
function ruleLayers(context: RuleContext): { root: object; own: PropertyDescriptorMap } | undefined {
    const own: PropertyDescriptorMap = {};
    for (let layer: object = context; ;) {
        const prototype = Object.getPrototypeOf(layer) as object | null;
        if (prototype === null) {
            return undefined;
        }
        for (const key of Reflect.ownKeys(layer)) {
            if (!Object.hasOwn(own, key)) {
                own[key as string] = Reflect.getOwnPropertyDescriptor(layer, key)!;
            }
        }
        if (Object.isFrozen(prototype)) {
            return { root: prototype, own };
        }
        layer = prototype;
    }
}

/**
 * Build the per-file compatibility layer shared by every adapted rule of a file.
 * @param context - Oxlint context of the first adapted rule for the file.
 * @param root - Frozen file context shared by all rules.
 * @returns File-wide source facade, language options, and scope helpers.
 */
function fileAdapter(context: RuleContext, root: object): FileAdapter {
    const ast = context.sourceCode.ast as ESTree.Node;
    const cached = adapters.get(ast);
    if (cached?.root === root) {
        return cached;
    }
    let languageContext = context;
    let sourceType: string | undefined;
    if (context.settings.agSourceType) {
        sourceType = /\.c(?:js|ts)$/u.test(context.filename) ? 'commonjs' : context.settings.agSourceType as string;
        languageContext = Object.create(context, {
            languageOptions: { value: { ...context.languageOptions, sourceType } },
        }) as RuleContext;
    }
    const rawVersion = context.settings.agEcmaVersion ?? 2026;
    let version = typeof rawVersion === 'number' ? rawVersion : 2026;
    if (version > 5 && version < 2015) {
        version += 2009;
    }
    const parserOptions = {
        ...context.languageOptions.parserOptions,
        ...(context.settings.agParserOptions as object),
        ecmaVersion: version,
    };
    let source = legacySource(languageContext, version, parserOptions);
    source = Object.create(source, {
        getJSDocComment: { value: getJSDocComment.bind(source as unknown as LegacySourceCode) },
    }) as Source;
    const state = { current: ast };
    const properties: PropertyDescriptorMap = {
        sourceCode: { value: source },
        getSourceCode: { value: () => source },
        getScope: { value: () => source.getScope(state.current) },
        getAncestors: { value: () => source.getAncestors(state.current) },
        getDeclaredVariables: { value: (node: ESTree.Node) => source.getDeclaredVariables(node) },
        markVariableAsUsed: { value: (name: string) => source.markVariableAsUsed(name, state.current) },
        parserOptions: { value: parserOptions },
        languageOptions: {
            value: { ...languageContext.languageOptions, ecmaVersion: version, parserOptions },
        },
        parserServices: { value: {} },
    };
    for (const name of SOURCE_METHODS) {
        const method = (source as unknown as Record<string, unknown>)[name];
        if (typeof method === 'function') {
            properties[name] = { value: method.bind(source) };
        }
    }
    const adapter: FileAdapter = {
        root,
        shared: Object.create(root, properties) as object,
        source,
        sourceType,
        version,
        parserOptions,
        languageOverrides: new WeakMap(),
        state,
    };
    adapters.set(ast, adapter);
    return adapter;
}

/**
 * Report through the rule's context, clamping legacy columns past the line end.
 * @param context - Rule context receiving the report.
 * @param source - Source facade providing line text.
 * @returns A report function accepting legacy positional forms.
 */
function legacyReport(context: RuleContext, source: Source): (...args: unknown[]) => void {
    return (...args: unknown[]) => {
        const [node, locationOrMessage, messageOrData, data] = args;
        if (args.length === 1) {
            const descriptor = node as Parameters<typeof context.report>[0];
            const { loc } = descriptor;
            if (loc && 'start' in loc) {
                const clamp = (position: { line: number; column: number }) => ({
                    ...position,
                    column: Math.min(
                        position.column,
                        source.lines[position.line - 1]?.length ?? position.column,
                    ),
                });
                return context.report({
                    ...descriptor,
                    loc: { start: clamp(loc.start), ...(loc.end ? { end: clamp(loc.end) } : {}) },
                });
            }
            return context.report(descriptor);
        }
        return context.report({
            node,
            ...(typeof locationOrMessage === 'string'
                ? { message: locationOrMessage, data: messageOrData }
                : { loc: locationOrMessage, message: messageOrData, data }),
        } as Parameters<typeof context.report>[0]);
    };
}

/**
 * Execute an isolated upstream rule using the current Oxlint context.
 * @param original - Pinned rule implementation.
 * @param nativeContext - Oxlint context for this file and rule.
 * @returns Visitors bound to the compatibility context.
 */
export function legacyContext(original: Rule, nativeContext: RuleContext): ReturnType<CreateRule['create']> {
    const layers = ruleLayers(nativeContext);
    if (!layers) {
        throw new TypeError('Unsupported Oxlint rule context.');
    }
    const file = fileAdapter(nativeContext, layers.root);
    const { own } = layers;
    own.report = { value: legacyReport(nativeContext, file.source) };
    if (Object.hasOwn(own, 'languageOptions')) {
        const override = nativeContext.languageOptions as object;
        let merged = file.languageOverrides.get(override);
        if (!merged) {
            merged = {
                ...override,
                ...(file.sourceType ? { sourceType: file.sourceType } : {}),
                ecmaVersion: file.version,
                parserOptions: file.parserOptions,
            };
            file.languageOverrides.set(override, merged);
        }
        own.languageOptions = { value: merged };
    }
    const adapted = Object.create(file.shared, own) as RuleContext;
    const visitors = (original as CreateRule).create(adapted);
    const seen = new Set<object>();
    const originals = new WeakMap<object, object>();
    const segments = new WeakMap<object, object>();
    const adaptSegment = (segment: object): object => {
        const cached = segments.get(segment);
        if (cached) {
            return cached;
        }
        const projected = new Proxy(segment, {
            get(target, key, receiver) {
                const value: unknown = Reflect.get(target, key, receiver);
                const edges = ['prevSegments', 'allPrevSegments', 'nextSegments', 'allNextSegments'];
                if (edges.includes(String(key)) && Array.isArray(value)) {
                    return value.filter((item) => !item.reachable || seen.has(item)).map(adaptSegment);
                }
                if (typeof value === 'function') {
                    return (...args: unknown[]) => Reflect.apply(
                        value,
                        target,
                        args.map((item) => (item && typeof item === 'object' ? (originals.get(item) ?? item) : item)),
                    );
                }
                return value;
            },
        });
        segments.set(segment, projected);
        originals.set(projected, segment);
        return projected;
    };
    const wrapped: Record<string, unknown> = {};
    for (const selector of Object.keys(visitors)) {
        const visit = visitors[selector] as (...items: unknown[]) => unknown;
        if (!/^on(?:Unreachable)?CodePath|^onCodePathSegmentLoop$/u.test(selector)) {
            wrapped[selector] = (...args: unknown[]) => {
                const node = args.find(
                    (value) => value && typeof value === 'object' && 'type' in value && 'loc' in value,
                );
                if (node) {
                    file.state.current = node as ESTree.Node;
                }
                return visit(...args);
            };
            continue;
        }
        wrapped[selector] = (...args: unknown[]) => {
            const node = args.find(
                (value) => value && typeof value === 'object' && 'type' in value && 'loc' in value,
            );
            if (node) {
                file.state.current = node as ESTree.Node;
            }
            let values = args;
            let startingSegment: object | undefined;
            if (/^on(Unreachable)?CodePathSegment/u.test(selector) || selector === 'onCodePathSegmentLoop') {
                if (selector.endsWith('Start')) {
                    startingSegment = args[0] as object;
                }
                values = args.map((item) => (item && typeof item === 'object' && 'prevSegments' in item ? adaptSegment(item) : item));
            }
            const result = visit(...values);
            if (startingSegment) {
                // A loop can point back to its own segment. Expose that edge after
                // the rule initializes its state.
                seen.add(startingSegment);
            }
            return result;
        };
    }
    return wrapped as ReturnType<CreateRule['create']>;
}
