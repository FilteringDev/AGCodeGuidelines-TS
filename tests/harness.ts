/**
 * @file Oxlint test helpers for attributed conformance assertions in Vitest.
 */

import assert from 'node:assert/strict';
import type { Rule, CreateRule, ESTree } from '@oxlint/plugins';
import type { RuleTester } from 'oxlint/plugins-dev';
import { legacyContext } from '../packages/oxlint-plugin/src/legacy-context';
import compat from '../packages/oxlint-plugin/src/compat';
import jsdoc from '../packages/oxlint-plugin/src/jsdoc';
import react from '../packages/oxlint-plugin/src/react';
import stylistic from '../packages/oxlint-plugin/src/stylistic';
import a11y from '../packages/oxlint-plugin/src/jsx-a11y';
import imports from '../packages/oxlint-plugin/src/import';

export interface Fixture {
    id: string;
    sourceRule: string;
    target: string;
    group: 'native' | 'style';
    origin: string;
    code: string;
    options: unknown[];
    settings: Record<string, unknown>;
    globals: RuleTester.Globals;
    sourceType: 'module' | 'script' | 'commonjs';
    lang: 'jsx' | 'tsx' | 'ts';
    supplementalRules?: Record<string, unknown>;
    parserOptions?: Record<string, unknown>;
    ecmaVersion?: number | string;
    env?: Record<string, boolean>;
    filename?: string;
    errors: {
        suggestions?: null | number | Record<string, unknown>[];
        message?: string;
        messageId?: string;
        line?: number;
        column?: number;
        endLine?: number;
        endColumn?: number;
        data?: Record<string, string | number>;
        messageRegex?: { source: string; flags: string };
    }[];
    output?: string | null;
}

/**
 * Resolve the rule function used by Oxlint's JavaScript runtime.
 * @param fixture - Fixture identifying the source and configured provider.
 * @returns Compatible JavaScript rule function.
 */
function resolveRule(fixture: Pick<Fixture, 'sourceRule' | 'target'>): Rule {
    const name = fixture.sourceRule.split('/').at(-1) ?? '';
    const targetName = fixture.target.split('/').at(-1) ?? '';
    const provider = fixture.target.startsWith('ag-style/')
        ? stylistic
        : fixture.sourceRule.startsWith('jsdoc/')
            ? jsdoc
            : fixture.sourceRule.startsWith('react/')
                ? react
                : fixture.sourceRule.startsWith('jsx-a11y/')
                    ? a11y
                    : fixture.sourceRule.startsWith('import/')
                        ? imports
                        : compat;
    const available = provider.rules as Record<string, Rule>;
    const rule = available[targetName] ?? available[name];
    if (!rule) {
        throw new Error(`Missing JavaScript provider for ${fixture.sourceRule}`);
    }
    return rule as Rule;
}

/**
 * Translate suggestion assertions without discarding the upstream contract.
 * @param fixture - Attributed source scenario.
 * @param suggestions - Original suggestion assertions or count.
 * @returns Oxlint suggestion assertions.
 */
function normalizeSuggestions(fixture: Fixture, suggestions: Fixture['errors'][number]['suggestions']): object {
    if (suggestions === undefined || typeof suggestions === 'number') {
        return {};
    }
    if (suggestions === null) {
        return { suggestions: null };
    }
    const messages = resolveRule(fixture).meta?.messages ?? {};
    return {
        suggestions: suggestions.map(({
            desc, messageId, data, ...rest
        }) => {
            if (desc !== undefined && messageId !== undefined) {
                const text = messages[String(messageId)]?.replace(/\{\{\s*(.*?)\s*\}\}/gu, (_all, key: string) => String((data as Record<string, unknown> | undefined)?.[key]));
                assert.equal(text, desc, `${fixture.id}: upstream suggestion text must match its messageId`);
            }
            return messageId !== undefined ? { ...rest, messageId, ...(data ? { data } : {}) } : { ...rest, desc };
        }),
    };
}

/**
 * Preserve upstream diagnostics and options in Oxlint's test-case format.
 * @param fixture - Serialized upstream scenario.
 * @returns An Oxlint RuleTester case.
 */
export function testCase(fixture: Fixture): RuleTester.ValidTestCase | RuleTester.InvalidTestCase {
    const common = {
        name: `${fixture.sourceRule}: ${fixture.id}`,
        code: fixture.code,
        ...(fixture.options.length ? { options: fixture.options } : {}),
        settings: {
            ...fixture.settings,
            agEcmaVersion: fixture.ecmaVersion ?? 2022,
            agParserOptions: fixture.parserOptions ?? {},
            fixtureFilename: fixture.filename,
            fixtureErrors: fixture.errors,
            fixtureRules: fixture.supplementalRules ?? {},
        },
        languageOptions: {
            sourceType: fixture.sourceType,
            globals: fixture.globals,
            env: { builtin: true, ...fixture.env },
            parserOptions: { lang: fixture.lang, ignoreNonFatalErrors: true },
        },
    };
    if (fixture.errors.length === 0) {
        return common as RuleTester.ValidTestCase;
    }
    return {
        ...common,
        errors: fixture.errors.map(({ messageRegex, suggestions, ...error }) => ({
            ...error,
            ...normalizeSuggestions(fixture, suggestions),
            ...(error.endColumn === 0 && error.endLine
                ? {
                    endLine: error.endLine - 1,
                    endColumn: fixture.code.split(/\r\n|\r|\n/u)[error.endLine - 2]!.length + 1,
                }
                : {}),
            ...(error.message && typeof error.message === 'object'
                ? {
                    message: new RegExp(
                        (error.message as { regexSource: string }).regexSource,
                        (error.message as { regexFlags: string }).regexFlags,
                    ),
                }
                : {}),
            ...(messageRegex
                ? { message: new RegExp(messageRegex.source, messageRegex.flags) }
                : !error.message && !error.messageId
                    ? { message: /[\s\S]+/u }
                    : {}),
        })),
        ...(fixture.output !== undefined ? { output: fixture.output } : {}),
    } as RuleTester.InvalidTestCase;
}

/**
 * Execute auxiliary upstream rules and assertion features absent from Oxlint's RuleTester.
 * @param fixture - Attributed source scenario.
 * @returns A rule with the upstream suite helpers and assertion adapter.
 */
export function getRule(fixture: Pick<Fixture, 'sourceRule' | 'target'>): Rule {
    const original = resolveRule(fixture) as CreateRule;
    const helper: CreateRule = {
        create(context) {
            const useA = (node: ESTree.Node) => {
                context.sourceCode.markVariableAsUsed('a', node);
            };
            return { VariableDeclaration: useA, ReturnStatement: useA };
        },
    };
    const supplements = {
        'no-extra-semi': compat.rules!['no-extra-semi'],
        'no-undef': compat.rules!['no-undef'],
        'no-undef-init': compat.rules!['no-undef-init'],
        eqeqeq: compat.rules!.eqeqeq,
        curly: compat.rules!.curly,
        'react/jsx-uses-vars': react.rules!['jsx-uses-vars'],
        'react/jsx-uses-react': react.rules!['jsx-uses-react'],
        'custom/use-every-a': {
            create: (context: Parameters<CreateRule['create']>[0]) => legacyContext(helper, context),
        },
        'custom/use-x': {
            create(context) {
                return legacyContext(
                    {
                        create(adapted) {
                            return {
                                VariableDeclaration(node) {
                                    adapted.sourceCode.markVariableAsUsed('x', node);
                                },
                            };
                        },
                    },
                    context,
                );
            },
        },
        // The pinned comma-dangle suite checks conflicts with this auxiliary fix.
        'custom/add-named-import': {
            meta: { fixable: 'code' },
            create(context) {
                return {
                    ImportDeclaration(node) {
                        const source = context.sourceCode;
                        const closingBrace = source.getLastToken(node, (token) => token.value === '}')!;
                        const addComma = source.getTokenBefore(closingBrace)!.value !== ',';
                        context.report({
                            node,
                            message: 'Add I18nManager.',
                            fix: (fixer) => fixer.insertTextBefore(closingBrace, `${addComma ? ',' : ''}I18nManager`),
                        });
                    },
                };
            },
        },
    } as Record<string, CreateRule>;
    const messages = Object.assign(
        {},
        ...Object.entries(supplements).map(([name, rule]) => Object.fromEntries(
            Object.entries(rule.meta?.messages ?? {}).map(([id, message]) => [`${name}:${id}`, message]),
        )),
        original.meta?.messages,
    );
    return {
        ...original,
        meta: { ...original.meta, messages },
        create(context) {
            const filename = context.settings.fixtureFilename as string | undefined;
            const assertions = context.settings.fixtureErrors as Fixture['errors'];
            const configured = context.settings.fixtureRules as Record<string, unknown>;
            const adapted = Object.create(context, {
                ...(filename
                    ? {
                        filename: { value: filename },
                        physicalFilename: { value: filename },
                        getFilename: { value: () => filename },
                        getPhysicalFilename: { value: () => filename },
                    }
                    : {}),
                report: {
                    value: (descriptor: Parameters<typeof context.report>[0]) => {
                        const report = descriptor as unknown as Record<string, unknown>;
                        const countAssertion = assertions?.find(
                            (error) => typeof error.suggestions === 'number'
                                && (error.messageId
                                    ? error.messageId === report.messageId
                                    : error.message === report.message),
                        );
                        if (countAssertion) {
                            assert.equal(
                                (report.suggest as unknown[] | undefined)?.length ?? 0,
                                countAssertion.suggestions,
                            );
                        }
                        const location = report.loc as { start?: { line: number }; line?: number } | undefined;
                        const line = location?.start?.line ?? location?.line
                            ?? (report.node as ESTree.Node | undefined)?.loc.start.line;
                        if (line) {
                            const previous = context.sourceCode.lines[line - 2] ?? '';
                            if (
                                /eslint-disable-next-line/u.test(previous)
                                && (previous.includes(fixture.sourceRule)
                                    || /eslint-disable-next-line\s*$/u.test(previous))
                            ) {
                                return;
                            }
                        }
                        context.report(descriptor);
                    },
                },
            }) as typeof context;
            const visitors = [original.create(adapted)];
            for (const [name, setting] of Object.entries(configured ?? {})) {
                if (name === fixture.sourceRule || !supplements[name]) {
                    continue;
                }
                const options = Array.isArray(setting) ? setting.slice(1) : [];
                if ([0, 'off'].includes(Array.isArray(setting) ? setting[0] : setting)) {
                    continue;
                }
                visitors.unshift(
                    supplements[name]!.create(
                        Object.create(adapted, {
                            options: { value: options },
                            report: {
                                value: (descriptor: Parameters<typeof context.report>[0]) => adapted.report({
                                    ...descriptor,
                                    ...('messageId' in descriptor
                                        ? { messageId: `${name}:${descriptor.messageId}` }
                                        : {}),
                                }),
                            },
                        }),
                    ),
                );
            }
            const combined: Record<string, ((...args: unknown[]) => unknown)[]> = {};
            for (const visitor of visitors) {
                for (const [selector, callback] of Object.entries(visitor)) {
                    (combined[selector] ??= []).push(callback as (...args: unknown[]) => unknown);
                }
            }
            return Object.fromEntries(
                Object.entries(combined).map(([selector, callbacks]) => [
                    selector,
                    (...args: unknown[]) => callbacks.forEach((callback) => callback(...args)),
                ]),
            ) as ReturnType<CreateRule['create']>;
        },
    };
}
