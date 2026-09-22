/** @file Verify runtime behavior at TypeScript source-port boundaries. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { RuleTester } from 'oxlint/plugins-dev';
import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import compat from '../packages/oxlint-plugin/src/compat';
import reactPlugin from '../packages/oxlint-plugin/src/react';
import registry from '../vendor/core/lib/rules/utils/lazy-loading-rule-map';
import strings from '../vendor/core/lib/shared/string-utils';
import type { LegacyRule } from '../vendor/types';
import jsdoc from '../vendor/jsdoc/index';
import react from '../vendor/react/index';
import importRules from '../vendor/import/index';
import newlinesRules from '../vendor/import-newlines/index';
import boundariesRules from '../vendor/boundaries/index';
import noticeRules from '../vendor/notice/index';
import loggerRules from '../vendor/logger-context/index';
import enumerableKeys from '../vendor/import/utils/enumerableKeys';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { env: { builtin: true, es2026: true } } });
tester.run('do-while segment initialization', compat.rules['no-useless-return']!, {
    valid: [
        'function run() { do { step(); } while (again); }',
        'function run() { do {} while (again); }',
    ],
    invalid: [{
        code: 'function run() { do { step(); } while (again); return; }',
        errors: [{ messageId: 'unnecessaryReturn' }],
        output: 'function run() { do { step(); } while (again);  }',
    }],
});

tester.run('type references have no execution order', compat.rules['no-use-before-define']!, {
    valid: [
        { filename: 'types.ts', code: 'type First = Second; type Second = { next: First };' },
        { filename: 'types.ts', code: 'class Example { parent: Example | null = null; }' },
    ],
    invalid: [{
        filename: 'types.ts',
        code: 'const result: Later = value; type Later = number; const value = 1;',
        errors: [{ messageId: 'usedBeforeDefined', data: { name: 'value' } }],
    }],
});

it('defers registry lookups until values are consumed and preserves iteration order and receiver', () => {
    const first: LegacyRule = { create: () => ({}) };
    const second: LegacyRule = { create: () => ({}) };
    const loadFirst = vi.fn(() => first);
    const loadSecond = vi.fn(() => second);
    const rules = new registry.LazyLoadingRuleMap([['first', loadFirst], ['second', loadSecond]]);
    expect(rules.size).toBe(2);
    expect(rules.has('first')).toBe(true);
    expect(Array.from(rules.keys())).toEqual(['first', 'second']);
    expect(loadFirst).not.toHaveBeenCalled();
    expect(loadSecond).not.toHaveBeenCalled();
    expect(rules.get('missing')).toBeUndefined();
    const values = rules.values();
    expect(values.next().value).toBe(first);
    expect(loadFirst).toHaveBeenCalledOnce();
    expect(loadSecond).not.toHaveBeenCalled();
    expect(values.next().value).toBe(second);
    expect(values.next().done).toBe(true);
    expect(Array.from(rules)).toEqual([['first', first], ['second', second]]);
    const receiver = { names: [] as string[] };
    rules.forEach(function record(this: typeof receiver, value, name, map) {
        expect(map).toBe(rules);
        expect(value).toBe(name === 'first' ? first : second);
        this.names.push(name);
    }, receiver);
    expect(receiver.names).toEqual(['first', 'second']);
});

it('counts combining sequences and emoji identically under the bundler and native Node', () => {
    const values = ['plain', 'e\u0301', '👩‍👩‍👧‍👦', '🇨🇦'];
    const expected = [5, 1, 1, 1];
    expect(values.map(strings.getGraphemeCount)).toEqual(expected);
    const script = [
        "import strings from './vendor/core/lib/shared/string-utils.ts';",
        `process.stdout.write(JSON.stringify(${JSON.stringify(values)}.map(strings.getGraphemeCount)));`,
    ].join('\n');
    const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
        encoding: 'utf8',
    });
    expect(JSON.parse(output)).toEqual(expected);
});

it('preserves the pinned JSDoc rule metadata and recommended configuration', () => {
    const metadata = Object.fromEntries(Object.entries(jsdoc.rules).map(([name, rule]) => [name, rule.meta]));
    const digest = createHash('sha256').update(JSON.stringify({ configs: jsdoc.configs, metadata })).digest('hex');
    // Captured from the isolated sources for eslint-plugin-jsdoc 64.3.6
    // (updated for require-description, require-description-complete-sentence,
    // require-hyphen-before-param-description, require-throws, sort-tags).
    expect(digest).toBe('e72deb2d9ff7e0ad9fed398c16037ca6cd35185c2e2f6e3e299aba6d8206a2d9');
});

it('preserves the pinned React rule metadata', () => {
    const metadata = Object.fromEntries(Object.entries(react.rules).map(([name, rule]) => [name, rule.meta]));
    const digest = createHash('sha256').update(JSON.stringify({ metadata })).digest('hex');
    // Captured from the unmodified isolated sources for eslint-plugin-react 7.37.5.
    expect(digest).toBe('8214a8bc3bbe58dd098c9cb8c8792982219310f5f53c2f600241eb0e55c8183d');
});

tester.run('React URL protocol control characters', reactPlugin.rules['jsx-no-script-url']!, {
    valid: [
        { filename: 'links.jsx', code: '<a href="https://example.com" />;' },
        { filename: 'links.jsx', code: '<a href="!javascript:alert(1)" />;' },
    ],
    invalid: [
        ['javascript', 'alert(1)'].join(':'),
        '\u0000\u0001\u001f JaVaScRiPt:alert(1)',
        'j\ta\nv\ra\ts\nc\rr\ti\np\rt:alert(1)',
    ].map((url) => ({
        filename: 'links.jsx',
        code: `<a href="${url}" />;`,
        errors: [{ messageId: 'noScriptURL' }],
    })),
});

it('preserves the pinned import rule metadata', () => {
    const metadata = Object.fromEntries(Object.entries(importRules.rules).map(([name, rule]) => [name, rule.meta]));
    const digest = createHash('sha256').update(JSON.stringify({ metadata })).digest('hex');
    // Captured from the isolated sources for eslint-plugin-import 2.32.0
    // (updated for no-unassigned-import).
    expect(digest).toBe('a88df00f5c3d652fce9700afcbd8933edeae591254376995ecadbbe2db636b5b');
});

it('preserves the pinned import-newlines rule metadata', () => {
    const metadata = Object.fromEntries(
        Object.entries(newlinesRules.rules).map(([name, rule]) => [name, rule.meta]),
    );
    const digest = createHash('sha256').update(JSON.stringify({ metadata })).digest('hex');
    // Captured from the isolated sources for eslint-plugin-import-newlines 1.4.0.
    expect(digest).toBe('ebe06486deff1fdfa2e6176840bfb9fe965fe9049eddc16b098eacd6933f5d3b');
});

it('preserves the pinned boundaries rule metadata', () => {
    const metadata = Object.fromEntries(
        Object.entries(boundariesRules.rules).map(([name, rule]) => [name, rule.meta]),
    );
    const digest = createHash('sha256').update(JSON.stringify({ metadata })).digest('hex');
    // Captured from the isolated sources for eslint-plugin-boundaries 5.0.1 (element-types only).
    expect(digest).toBe('88be61a6ca16444d15e92ab7fa6c32fcb83f0a7bb54b5180260c09791bcf1426');
});

it('preserves the pinned notice rule metadata', () => {
    const metadata = Object.fromEntries(
        Object.entries(noticeRules.rules).map(([name, rule]) => [name, rule.meta]),
    );
    const digest = createHash('sha256').update(JSON.stringify({ metadata })).digest('hex');
    // Captured from the isolated sources for eslint-plugin-notice 1.0.0.
    expect(digest).toBe('856e1ff711c8ee04e8cf569199d501250a9729698a492a41fb7f361c576448b8');
});

it('preserves the pinned logger-context rule metadata', () => {
    const metadata = Object.fromEntries(
        Object.entries(loggerRules.rules).map(([name, rule]) => [name, rule.meta]),
    );
    const digest = createHash('sha256').update(JSON.stringify({ metadata })).digest('hex');
    // Captured from the isolated sources for @adguard/logger-context port 1.0.1.
    expect(digest).toBe('9aa8f4480a6b2498f483761404f36b0900ee58f57ed45163329cd82bd85dc7b7');
});

it('retains inherited configuration keys and non-enumerable shadowing', () => {
    const inherited = { inherited: true, shadowed: true, repeated: true };
    const settings = Object.create(inherited) as Record<string, unknown>;
    settings.local = true;
    settings.repeated = false;
    Object.defineProperty(settings, 'shadowed', { value: false, enumerable: false });
    Object.defineProperty(settings, Symbol('private'), { value: true, enumerable: true });
    expect(enumerableKeys(settings)).toEqual(['local', 'repeated', 'inherited']);
    expect(enumerableKeys(null)).toEqual([]);
});
