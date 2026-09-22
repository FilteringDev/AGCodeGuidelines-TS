/** @file Verify runtime behavior at TypeScript source-port boundaries. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { RuleTester } from 'oxlint/plugins-dev';
import {
    describe, expect, it, vi,
} from 'vitest';

import compat from '../packages/oxlint-plugin/src/compat';
import reactPlugin from '../packages/oxlint-plugin/src/react';
import registry from '../vendor/core/lib/rules/utils/lazy-loading-rule-map';
import strings from '../vendor/core/lib/shared/string-utils';
import type { LegacyRule } from '../vendor/types';
import jsdoc from '../vendor/jsdoc/index';
import react from '../vendor/react/index';
import importRules from '../vendor/import/index';
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
