/**
 * @file Exercise compatibility boundaries that differ from Oxlint's scope model.
 */
import { RuleTester } from 'oxlint/plugins-dev';
import { describe, expect, it } from 'vitest';

import type { CreateRule, ESTree } from '@oxlint/plugins';
import compat from '../packages/oxlint-plugin/src/compat';
import react from '../packages/oxlint-plugin/src/react';
import { legacyContext } from '../packages/oxlint-plugin/src/legacy-context';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
    languageOptions: { parserOptions: { lang: 'jsx' }, env: { builtin: true, es2026: true } },
});
tester.run('inline globals and lexical bindings', compat.rules['no-new-wrappers']!, {
    valid: [
        '/* global Boolean:off */ new Boolean(); new Boolean();',
        '/* globals Boolean: off, Number: off */ new Boolean(); new Number();',
        '/* global Boolean:off */ function example(Boolean) { new Boolean(); }',
        '/* global Boolean:off */ const Boolean = class {}; new Boolean();',
    ],
    invalid: [
        '// global Boolean:off\nnew Boolean();',
        '/** Description with Boolean:off. */ new Boolean();',
        '/* global Boolean:readonly */ new Boolean();',
        '/* global Boolean:off */ new Number();',
    ].map((code) => ({ code, errors: [{ messageId: 'noConstructor' }], output: null })),
});

// The pinned core 8 rule matches the constructor name syntactically, including shadowed names.
tester.run('pinned Promise executor semantics', compat.rules['no-async-promise-executor']!, {
    valid: ['new Promise(() => {});'],
    invalid: [
        '/* global Promise:off */ new Promise(async () => {});',
        '/* global Boolean:off */ function example(Promise) { new Promise(async () => {}); }',
        '/* global Boolean:off */ new Promise(async () => {});',
    ].map((code) => ({ code, errors: [{ messageId: 'async' }], output: null })),
});

tester.run('React optional type arguments', react.rules['jsx-props-no-multi-spaces']!, {
    valid: [
        { code: '<Component<string> first second />;', languageOptions: { parserOptions: { lang: 'tsx' } } },
        { code: '<Component first second />;', settings: { react: { version: '19.0' } } },
    ],
    invalid: [{ code: '<Component first  second />;', errors: 1, output: '<Component first second />;' }],
});

type Context = Parameters<CreateRule['create']>[0];
type LegacyContext = Context & {
    getSourceCode(): Context['sourceCode'];
    getScope(): ReturnType<Context['sourceCode']['getScope']>;
    getAncestors(): ESTree.Node[];
    getDeclaredVariables(node: ESTree.Node): { name: string }[];
    markVariableAsUsed(name: string): boolean;
};

tester.run(
    'legacy scope methods use the current visitor node',
    {
        create(context) {
            return legacyContext(
                {
                    create(original) {
                        const adapted = original as LegacyContext;
                        return {
                            VariableDeclaration(node) {
                                expect(adapted.getSourceCode().getText(node)).toBe('const value = 1;');
                                expect(adapted.getScope().type).toBe('function');
                                expect(adapted.getAncestors().map((parent) => parent.type)).toEqual([
                                    'Program',
                                    'FunctionDeclaration',
                                    'BlockStatement',
                                ]);
                                expect(adapted.getDeclaredVariables(node).map((variable) => variable.name)).toEqual([
                                    'value',
                                ]);
                                expect(adapted.markVariableAsUsed('value')).toBe(true);
                                expect(adapted.markVariableAsUsed('missing')).toBe(false);
                                const sourceType = context.filename.endsWith('.cjs') ? 'commonjs' : 'module';
                                expect(adapted.languageOptions.sourceType).toBe(sourceType);
                            },
                        };
                    },
                },
                context,
            );
        },
    },
    {
        valid: ['fixture.js', 'fixture.cjs'].map((filename) => ({
            filename,
            code: 'function example() { const value = 1; }',
            settings: { agSourceType: 'module' },
        })),
        invalid: [],
    },
);

tester.run('production globals use the current Oxlint environment', compat.rules['no-undef']!, {
    valid: ['Iterator.from([]);', 'Promise.withResolvers();', 'new WeakRef({});'],
    invalid: [
        {
            code: '/* global Iterator:off */ Iterator.from([]);',
            errors: [{ messageId: 'undef', data: { name: 'Iterator' } }],
        },
    ],
});
