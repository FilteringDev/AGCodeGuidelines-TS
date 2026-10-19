/**
 * @file Test that TypeScript extension-style rules report what their typescript-eslint sources report.
 */
import stylistic from '@stylistic/eslint-plugin';
import { RuleTester } from 'oxlint/plugins-dev';
import { describe, expect, it } from 'vitest';

import plugin from '../packages/oxlint-plugin/src/typescript-stylistic';
import { catalog } from '../packages/rule-catalog/src/index';

RuleTester.describe = describe;
RuleTester.it = it;

const typescript = { languageOptions: { parserOptions: { lang: 'ts' } } } as const;
const multiline = 'always-multiline';
const everyMultiline = [{
    arrays: multiline,
    objects: multiline,
    imports: multiline,
    exports: multiline,
    functions: multiline,
    enums: multiline,
    generics: multiline,
    tuples: multiline,
}];

new RuleTester().run('comma-dangle', plugin.rules['comma-dangle']!, {
    valid: [
        // Function types, declared functions, and type arguments are outside typescript-eslint 7.18 coverage.
        { code: 'type Handler = (\n    value: string\n) => void;', options: everyMultiline },
        { code: 'declare function work(\n    value: string\n): void;', options: everyMultiline },
        { code: 'const value = run<\n    string,\n>();', options: everyMultiline },
        // ESLint 8.57.1 does not check import attributes or dynamic imports.
        { code: "import data from './data.json' with {\n    type: 'json',\n};", options: everyMultiline },
        { code: "export * from './data.json' with {\n    type: 'json',\n};", options: everyMultiline },
        { code: "import data from './data.json' with {\n    type: 'json'\n};", options: [multiline] },
        { code: "const loaded = import(\n    './data.js'\n);", options: [multiline] },
        { code: "import data from './data.json' with { type: 'json', };" },
        // ESLint 8 ignores function commas before ES2017.
        { code: 'call(\n    1\n);', options: [multiline], settings: { agRuleEcmaVersion: 2015 } },
    ].map((testCase) => ({ ...typescript, ...testCase })),
    invalid: [
        { code: 'call(\n    1\n);', output: 'call(\n    1,\n);', options: everyMultiline },
        { code: 'call(\n    1\n);', output: 'call(\n    1,\n);', options: [multiline] },
        {
            code: 'const value = {\n    a: 1\n};',
            output: 'const value = {\n    a: 1,\n};',
            options: [multiline],
            settings: { agRuleEcmaVersion: 2015 },
        },
        { code: 'enum Mode {\n    Light\n}', output: 'enum Mode {\n    Light,\n}', options: everyMultiline },
        { code: 'type Pair = [\n    string\n];', output: 'type Pair = [\n    string,\n];', options: everyMultiline },
        { code: 'const value = [1,];', output: 'const value = [1];', messageId: 'unexpected' },
    ].map(({ messageId = 'missing', ...testCase }) => ({ ...typescript, ...testCase, errors: [{ messageId }] })),
});

new RuleTester().run('semi', plugin.rules.semi!, {
    valid: [
        // Auto-accessor fields are outside typescript-eslint 7.18 and ESLint 8.57.1 coverage.
        { code: 'class Store {\n    accessor value!: string\n}', options: ['always'] },
    ].map((testCase) => ({ ...typescript, ...testCase })),
    invalid: [
        {
            code: 'type Mode = string',
            output: 'type Mode = string;',
            options: ['always'],
            errors: [{ messageId: 'missingSemi' }],
        },
    ].map((testCase) => ({ ...typescript, ...testCase })),
});

/**
 * Valid code for syntax that Stylistic checks and the typescript-eslint source rule does not.
 */
const skipped: Record<string, RuleTester.ValidTestCase[]> = {
    'function-call-spacing': [{ code: "const loaded = import ('./data.js');", options: ['never'] }],
    indent: [
        { code: 'const value = run<\nstring\n>();', options: [4] },
        {
            code: 'class Store {\n    read = async (): Promise<\n    string\n    > => value;\n}',
            options: [4, { SwitchCase: 1 }],
        },
    ],
    'key-spacing': [{ code: "import data from './data.json' with { type : 'json' };" }],
    'keyword-spacing': [
        { code: 'class Store {\n    accessor[key] = 1;\n}' },
        { code: "const value = 'a'satisfies string;" },
    ],
    'no-extra-parens': [{ code: 'type Mode = (string);' }, { code: 'let mode: (string);' }],
    'no-extra-semi': [{ code: 'class Store {\n    accessor value = 1;;\n}' }],
    'object-curly-spacing': [
        { code: 'interface Shape {a: string}', options: ['always'] },
        { code: 'enum Mode {Light}', options: ['always'] },
        { code: "export * from './data.json' with {type: 'json'};", options: ['always'] },
    ],
    'space-before-blocks': [{ code: "declare module 'data'{}" }],
    'space-before-function-paren': [{
        code: 'try {} catch(error) {}',
        options: [{ anonymous: 'always', named: 'never', asyncArrow: 'always' }],
    }],
    'space-infix-ops': [{ code: 'class Store {\n    accessor value=1;\n}' }],
};

for (const [name, valid] of Object.entries(skipped)) {
    new RuleTester().run(name, plugin.rules[name]!, {
        valid: valid.map((testCase) => ({ ...typescript, ...testCase })),
        invalid: [],
    });
}

const missingSpace = [{ messageId: 'missing' }, { messageId: 'missing' }];

new RuleTester().run('block-spacing', plugin.rules['block-spacing']!, {
    valid: [{ code: 'interface Shape { a: string }' }, { code: 'interface Shape {}' }]
        .map((testCase) => ({ ...typescript, ...testCase })),
    invalid: [
        { code: 'interface Shape {a: string}', output: 'interface Shape { a: string }' },
        { code: 'type Shape = {a: string};', output: 'type Shape = { a: string };' },
        { code: 'enum Mode {Light}', output: 'enum Mode { Light }' },
    ].map((testCase) => ({ ...typescript, ...testCase, errors: missingSpace })),
});

const singleLine = ['1tbs', { allowSingleLine: true }];

new RuleTester().run('brace-style', plugin.rules['brace-style']!, {
    valid: [
        // typescript-eslint skips every check for single-line TypeScript bodies when `allowSingleLine` is set.
        { code: 'namespace Store\n{ const value = 1; }', options: singleLine },
        { code: 'interface Shape\n{ a: string }', options: singleLine },
        { code: 'enum Mode\n{ Light }', options: singleLine },
    ].map((testCase) => ({ ...typescript, ...testCase })),
    invalid: [
        { code: 'interface Shape\n{\n    a: string;\n}', output: 'interface Shape {\n    a: string;\n}' },
        { code: 'enum Mode\n{\n    Light,\n}', output: 'enum Mode {\n    Light,\n}' },
        {
            code: 'namespace Store\n{\n    const value = 1;\n}',
            output: 'namespace Store {\n    const value = 1;\n}',
            options: singleLine,
        },
    ].map((testCase) => ({ ...typescript, ...testCase, errors: [{ messageId: 'nextLineOpen' }] })),
});

describe('TypeScript style plugin contract', () => {
    const names = Object.keys(plugin.rules);
    const prefix = 'ag-ts-style/';

    it('implements every catalog target', () => {
        const targets = [
            ...Object.values(catalog.compatibility).map(({ target }) => target),
            ...(catalog.inventory ?? []).map(({ target }) => target),
        ].filter((target): target is string => target?.startsWith(prefix) === true);
        expect(Array.from(new Set(targets), (target) => target.slice(prefix.length)).sort()).toEqual(names.sort());
    });

    it('keeps the pinned metadata and leaves rules without coverage differences unchanged', () => {
        const unchanged = new Set([
            'comma-spacing',
            'lines-around-comment',
            'lines-between-class-members',
            'member-delimiter-style',
            'padding-line-between-statements',
            'quotes',
        ]);
        for (const name of names) {
            const source = stylistic.rules[name as keyof typeof stylistic.rules];
            expect(plugin.rules[name]!.meta).toBe(source?.meta);
            expect(plugin.rules[name] === source).toBe(unchanged.has(name));
        }
    });
});
