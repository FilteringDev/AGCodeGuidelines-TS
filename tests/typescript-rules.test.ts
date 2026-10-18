/**
 * @file Test TypeScript-aware variants of pinned core rules through Oxlint's runtime.
 */
import { RuleTester } from 'oxlint/plugins-dev';
import { describe, expect, it } from 'vitest';

import plugin, { isAllowedMerge, rules } from '../packages/oxlint-plugin/src/typescript';

RuleTester.describe = describe;
RuleTester.it = it;

const typescript = { languageOptions: { parserOptions: { lang: 'ts' } } } as const;

const namingOptions = [
    { selector: 'variable', format: ['camelCase', 'PascalCase', 'UPPER_CASE'] },
    { selector: 'function', format: ['camelCase', 'PascalCase'] },
    { selector: 'typeLike', format: ['PascalCase'] },
];
new RuleTester().run('naming-convention', rules['naming-convention'], {
    valid: [
        'const lowerCase = 1; const PascalCase = 2; const UPPER_CASE = 3;',
        'function work() {} function Component() {}',
        'class Widget {} interface Shape {} type Mode = string; enum Color { red }',
        'function work<Input>(input: Input): Input { return input; }',
        'const { bad_key: goodName, other: { valueName }, ...REST } = source;',
        'const [firstName, , ...REST] = source;',
        'const { bad_key: goodName = 1 } = source;',
        'const value = { bad_key: 1 }; function work(bad_parameter: number) {} namespace lower_namespace {}',
        'const element = <Component bad_prop="value" />;',
        'const \u00e9l\u00e9ment = 1; class \u00c9l\u00e9ment {}',
    ].map((code) => ({
        code,
        options: namingOptions,
        filename: 'main.tsx',
        languageOptions: { parserOptions: { lang: 'tsx' } },
    })),
    invalid: [
        'const bad_name = 1;',
        'const BAD__NAME = 1;',
        'const _BAD = 1;',
        'const BAD_ = 1;',
        'const { good: bad_name } = source;',
        'const { bad_name } = source;',
        'const [bad_name = 1] = source;',
        'function bad_name() {}',
        'const value = function bad_name() {};',
        'declare function bad_name(): void;',
        'class badName {}',
        'const value = class badName {};',
        'interface badName {}',
        'type badName = string;',
        'enum badName { Good }',
        'function work<badName>(input: badName): badName { return input; }',
    ].map((code) => ({
        code, options: namingOptions, ...typescript, errors: [{ messageId: 'doesNotMatchFormat' }],
    })),
});

const valid = [
    ['function overloads', 'function convert(input: string): string;\nfunction convert(input: number): number;\nfunction convert(input: unknown): unknown { return input; }'],
    ['exported overloads', 'export function convert(input: string): string;\nexport function convert(input: unknown): unknown { return input; }'],
    ['ambient overloads', 'declare function convert(input: string): string;\ndeclare function convert(input: number): number;'],
    ['interface merge', 'interface Box { width: number }\ninterface Box { height: number }'],
    ['class and interface', 'interface Widget { size: number }\nclass Widget { name = "widget"; }'],
    ['class and namespace', 'class Box {}\nnamespace Box { export const SIZE = 1; }'],
    ['function and namespace', 'function build(): number { return 1; }\nnamespace build { export const SIZE = 1; }'],
    ['enum and namespace', 'enum Color { Red }\nnamespace Color { export const DEFAULT = 1; }'],
    ['namespace merge', 'namespace Space { export const A = 1; }\nnamespace Space { export const B = 2; }'],
    ['interface and namespace', 'interface Box { width: number }\nnamespace Box { export const SIZE = 1; }'],
    ['overloads with namespace', 'function build(): number;\nfunction build(): number { return 1; }\nnamespace build { export const SIZE = 1; }'],
    ['nested block merge', 'function run() {\n    interface Box { width: number }\n    interface Box { height: number }\n}'],
    ['namespace body merge', 'namespace Outer {\n    export interface Box { width: number }\n    export interface Box { height: number }\n}'],
    ['distinct names', 'let first = 1;\nlet second = 2;'],
] as const;

const invalid = [
    ['var redeclaration', 'var value = 1;\nvar value = 2;', 1],
    ['two implementations', 'function run() {}\nfunction run() {}', 1],
    ['class and function', 'class Box {}\nfunction Box() {}', 1],
    // TypeScript merges these, but @typescript-eslint/no-redeclare reports them.
    ['enum merge', 'enum Color { Red }\nenum Color { Green = 1 }', 1],
    ['type and value', 'type Mode = "light" | "dark";\nconst Mode = { Light: "light" };', 1],
    ['interface and value', 'interface Mode { name: string }\nconst Mode = { name: "light" };', 1],
    ['import and interface', 'import { Box } from "./box";\ninterface Box { width: number }', 1],
    ['hoisted var in block', 'var value = 1;\nif (value) {\n    var value = 2;\n}', 1],
    ['switch case', 'switch (mode) {\n    case 1:\n        var value = 1;\n        var value = 2;\n}', 1],
] as const;

new RuleTester().run('no-redeclare', rules['no-redeclare'], {
    valid: valid.map(([name, code]) => ({ name, code, ...typescript })),
    invalid: [
        ...invalid.map(([name, code, errors]) => ({
            name,
            code,
            ...typescript,
            errors: Array.from({ length: errors }, () => ({ messageId: 'redeclared' })),
        })),
        {
            // Other message kinds pass through unchanged. Only script-scope bindings are globals that a
            // comment can declare; the pinned scope adapter models those for JavaScript sources.
            name: 'declared by comment',
            code: '/* global value */\nvar value = 1;',
            options: [{ builtinGlobals: true }],
            languageOptions: { sourceType: 'script', env: { builtin: true }, parserOptions: { lang: 'jsx' } },
            errors: [{ messageId: 'redeclaredBySyntax' }],
        },
    ],
});

const tsx = { filename: 'main.tsx', languageOptions: { parserOptions: { lang: 'tsx' } } } as const;
// Oxlint's RuleTester uses zero-based columns, and ESLint's uses one-based columns.
const returnTypeError = (line: number, column: number, endColumn: number) => ({
    messageId: 'missingReturnType', line, column: column - 1, endLine: line, endColumn: endColumn - 1,
});
// ESLint positions were measured against @typescript-eslint/eslint-plugin 5.62.0, 7.18.0, and 8.29.0.
const semanticsCases = [
    {
        name: 'typed default parameter',
        code: 'function run(cb: () => void = () => {}): void { cb(); }',
        errors: { 5: [returnTypeError(1, 31, 36)], 7: [], 8: [] },
    },
    {
        name: 'JSX attribute',
        code: 'const element = <Button onClick={() => {}} />;',
        errors: { 5: [returnTypeError(1, 34, 39)], 7: [], 8: [] },
    },
    {
        name: 'higher-order function with several returns',
        code: 'function pick(flag: boolean) {\n'
            + '    if (flag) {\n        return (): number => 1;\n    }\n    return (): number => 2;\n}',
        errors: { 5: [returnTypeError(1, 1, 29)], 7: [], 8: [] },
    },
    {
        name: 'untyped variable inside a typed function',
        code: 'function outer(): () => () => number {\n    const inner = () => () => 1;\n    return inner;\n}',
        errors: { 5: [], 7: [returnTypeError(2, 28, 30)], 8: [returnTypeError(2, 28, 30)] },
    },
    {
        name: 'const assertion wrapped in satisfies',
        code: 'const read = () => ({ a: 1 } as const) satisfies { a: number };',
        errors: { 5: [returnTypeError(1, 14, 19)], 7: [returnTypeError(1, 17, 19)], 8: [] },
    },
    {
        name: 'method head',
        code: 'class Widget {\n    method() { return 1; }\n}',
        errors: { 5: [returnTypeError(2, 5, 13)], 7: [returnTypeError(2, 5, 11)], 8: [returnTypeError(2, 5, 11)] },
    },
] as const;

new RuleTester().run('explicit-function-return-type', rules['explicit-function-return-type'], {
    valid: [
        'function work(): number { return 1; }',
        'type Fn = () => void;\nconst typed: Fn = () => {};',
        'declare function use(cb: () => void): void;\nuse(() => {});',
        'const value = (() => 1) as () => number;',
        'const hof = () => (): number => 1;',
        'class Widget {\n    constructor() {}\n    set value(next: number) {}\n}',
        'function outer(): () => void {\n    return function inner() {};\n}',
        'const read = () => ({ a: 1 } as const);',
        { code: '(() => 1)();', options: [{ allowIIFEs: true }] },
        { code: 'const run = () => 1;', options: [{ allowedNames: ['run'] }] },
        { code: 'const run = () => void 0;', options: [{ allowConciseArrowFunctionExpressionsStartingWithVoid: true }] },
        { code: 'const run = [1].map(function () { return 1; });', options: [{ allowExpressions: true }] },
        ...semanticsCases.flatMap(({ name, code, errors }) => ([5, 7, 8] as const)
            .filter((major) => errors[major].length === 0)
            .map((major) => ({
                name: `${name} (v${major})`, code, settings: { agTypeScriptEslint: major }, ...tsx,
            }))),
    ].map((testCase) => (typeof testCase === 'string' ? { code: testCase, ...typescript } : { ...typescript, ...testCase })),
    invalid: [
        { code: 'function work() { return 1; }', ...typescript, errors: [returnTypeError(1, 1, 14)] },
        { code: 'const run = () => 1;', ...typescript, errors: [returnTypeError(1, 16, 18)] },
        {
            code: 'const hof = () => () => 1;',
            options: [{ allowHigherOrderFunctions: false }],
            ...typescript,
            errors: [returnTypeError(1, 16, 18), returnTypeError(1, 22, 24)],
        },
        {
            code: 'type Fn = () => void;\nconst typed: Fn = () => {};',
            options: [{ allowTypedFunctionExpressions: false }],
            ...typescript,
            errors: [returnTypeError(2, 22, 24)],
        },
        ...semanticsCases.flatMap(({ name, code, errors }) => ([5, 7, 8] as const)
            .filter((major) => errors[major].length > 0)
            .map((major) => ({
                name: `${name} (v${major})`, code, settings: { agTypeScriptEslint: major }, ...tsx, errors: [...errors[major]],
            }))),
    ],
});

describe('TypeScript rule plugin contract', () => {
    it('exposes TypeScript-aware rules under their core names', () => {
        expect(plugin.meta?.name).toBe('ag-ts');
        expect(Object.keys(rules)).toEqual(['explicit-function-return-type', 'naming-convention', 'no-redeclare']);
    });

    it('rejects merges that TypeScript does not permit', () => {
        // The parser already rejects these as duplicate declarations; the predicate agrees.
        const declaration = (kind: Parameters<typeof isAllowedMerge>[0][number]['kind'], implementation = false) => ({
            kind,
            implementation,
        });
        expect(isAllowedMerge([declaration('class'), declaration('class')])).toBe(false);
        expect(isAllowedMerge([declaration('type'), declaration('interface')])).toBe(false);
        expect(isAllowedMerge([declaration('type'), declaration('type')])).toBe(false);
        expect(isAllowedMerge([declaration('variable'), declaration('namespace')])).toBe(false);
        expect(isAllowedMerge([declaration('variable'), declaration('variable')])).toBe(false);
        expect(isAllowedMerge([declaration('function', true), declaration('function', true)])).toBe(false);
        expect(isAllowedMerge([declaration('class'), declaration('enum')])).toBe(false);
        expect(isAllowedMerge([declaration('function'), declaration('function', true)])).toBe(true);
        expect(isAllowedMerge([declaration('function'), declaration('function')])).toBe(true);
        expect(isAllowedMerge([declaration('enum'), declaration('enum')])).toBe(false);
        expect(isAllowedMerge([declaration('enum'), declaration('enum'), declaration('namespace')])).toBe(false);
        expect(isAllowedMerge([declaration('type'), declaration('variable')])).toBe(false);
        expect(isAllowedMerge([declaration('interface'), declaration('variable')])).toBe(false);
        expect(isAllowedMerge([declaration('class'), declaration('class'), declaration('interface')])).toBe(false);
        expect(isAllowedMerge([declaration('function', true), declaration('function', true), declaration('namespace')]))
            .toBe(false);
    });

    it('requires at least two declarations to describe a merge', () => {
        expect(isAllowedMerge([])).toBe(false);
        expect(isAllowedMerge([{ kind: 'interface', implementation: false }])).toBe(false);
        expect(isAllowedMerge([
            { kind: 'interface', implementation: false },
            { kind: 'interface', implementation: false },
        ])).toBe(true);
    });
});
