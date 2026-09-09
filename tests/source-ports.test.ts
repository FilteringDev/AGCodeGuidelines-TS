/** @file Verify runtime behavior at TypeScript source-port boundaries. */
import { execFileSync } from 'node:child_process';
import { RuleTester } from 'oxlint/plugins-dev';
import {
    describe, expect, it, vi,
} from 'vitest';

import compat from '../packages/oxlint-plugin/src/compat';
import registry from '../vendor/core/lib/rules/utils/lazy-loading-rule-map';
import strings from '../vendor/core/lib/shared/string-utils';
import type { LegacyRule } from '../vendor/types';

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
