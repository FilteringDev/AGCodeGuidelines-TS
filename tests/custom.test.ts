/**
 * @file Test custom rule listeners through Oxlint's native parser and runtime.
 */
import { RuleTester } from 'oxlint/plugins-dev';
import { describe, expect, it } from 'vitest';

import plugin, { rules } from '../packages/oxlint-plugin/src/index';
import { customCases } from './custom-cases';

RuleTester.describe = describe;
RuleTester.it = it;

Object.entries(rules).forEach(([name, rule]) => {
    const cases = customCases.filter((item) => item.rule === name);
    const tester = new RuleTester();
    const makeCase = (item: (typeof cases)[number]) => ({
        name: item.name,
        code: item.code,
        languageOptions: { parserOptions: { lang: item.lang } },
    });
    tester.run(name, rule, {
        valid: cases.filter((item) => !item.errors).map(makeCase),
        invalid: cases
            .filter((item) => item.errors)
            .map((item) => ({
                ...makeCase(item),
                errors: Array.from({ length: item.errors }, () => ({ messageId: 'guideline' })),
                output: null,
            })),
    });
});

describe('custom plugin contract', () => {
    it('exports stable names and source-linked metadata', () => {
        expect(plugin.meta?.name).toBe('ag');
        expect(Object.keys(rules)).toEqual(Object.keys(rules));
        Object.values(rules).forEach((rule) => {
            expect(rule.meta?.schema).toEqual([]);
            expect(rule.meta?.docs?.url).toContain('CodeGuidelines/blob/master/JavaScript/Javascript.md#');
            expect(rule.meta?.fixable).toBeUndefined();
        });
    });
});
