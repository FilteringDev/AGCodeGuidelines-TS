/** @file Adapt legacy rule context methods to Oxlint's source-code API. */
import type { CreateRule, ESTree, Rule } from '@oxlint/plugins';
import getJSDocComment from '../../../vendor/core/compat/get-jsdoc-comment';
import type { SourceCode as LegacySourceCode } from '../../../vendor/types';
import { legacySource } from './legacy-source';

type RuleContext = Parameters<CreateRule['create']>[0];

/**
 * Execute an isolated upstream rule using the current Oxlint context.
 * @param original - Pinned rule implementation.
 * @param nativeContext - Oxlint context for this file and rule.
 * @returns Visitors bound to the compatibility context.
 */
export function legacyContext(original: Rule, nativeContext: RuleContext): ReturnType<CreateRule['create']> {
    let context = nativeContext;
    if (context.settings.agSourceType) {
        const sourceType = /\.c(?:js|ts)$/u.test(context.filename) ? 'commonjs' : context.settings.agSourceType;
        context = Object.create(context, {
            languageOptions: { value: { ...context.languageOptions, sourceType } },
        }) as typeof context;
    }
    let current: ESTree.Node = context.sourceCode.ast;
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
    let source = legacySource(context, version, parserOptions);
    source = Object.create(source, {
        getJSDocComment: { value: getJSDocComment.bind(source as unknown as LegacySourceCode) },
    }) as typeof source;
    const properties: PropertyDescriptorMap = {
        sourceCode: { value: source },
        report: {
            value: (...args: unknown[]) => {
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
            },
        },
        getSourceCode: { value: () => source },
        getScope: { value: () => source.getScope(current) },
        getAncestors: { value: () => source.getAncestors(current) },
        getDeclaredVariables: { value: (node: ESTree.Node) => source.getDeclaredVariables(node) },
        markVariableAsUsed: { value: (name: string) => source.markVariableAsUsed(name, current) },
        parserOptions: { value: parserOptions },
        languageOptions: { value: { ...context.languageOptions, ecmaVersion: version, parserOptions } },
        parserServices: { value: {} },
    };
    for (const name of [
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
    ]) {
        const method = (source as unknown as Record<string, unknown>)[name];
        if (typeof method === 'function') {
            properties[name] = { value: method.bind(source) };
        }
    }
    const adapted = Object.create(context, properties) as RuleContext;
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
    return Object.fromEntries(
        Object.entries(visitors).map(([selector, visit]) => [
            selector,
            (...args: unknown[]) => {
                const node = args.find(
                    (value) => value && typeof value === 'object' && 'type' in value && 'loc' in value,
                );
                if (node) {
                    current = node as ESTree.Node;
                }
                let values = args;
                let startingSegment: object | undefined;
                if (/^on(Unreachable)?CodePathSegment/u.test(selector) || selector === 'onCodePathSegmentLoop') {
                    if (selector.endsWith('Start')) {
                        startingSegment = args[0] as object;
                    }
                    values = args.map((item) => (item && typeof item === 'object' && 'prevSegments' in item ? adaptSegment(item) : item));
                }
                const result = (visit as (...items: unknown[]) => unknown)(...values);
                if (startingSegment) {
                    // A loop can point back to its own segment. Expose that edge after
                    // the rule initializes its state.
                    seen.add(startingSegment);
                }
                return result;
            },
        ]),
    ) as ReturnType<CreateRule['create']>;
}
