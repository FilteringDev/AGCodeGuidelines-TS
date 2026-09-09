/** @file Verify that TypeScript-only syntax preserves the intended scope and formatting policy. */
import { createRequire } from 'node:module';

import { beforeAll, expect, it } from 'vitest';

import { createConfig } from '../packages/oxlint-config/src/index';
import { lintBatch } from './cli';

const require = createRequire(import.meta.url);
const scenarios = [
    ['function signature', 'export type Callback = (input: string) => void;', 0],
    ['construct signature', 'export type Constructor = new (input: string) => object;', 0],
    [
        'interface argument shadow',
        'const value = 1; export interface Writer { write(value: string): void; } export { value };',
        0,
    ],
    ['parameter property', 'export class Value { constructor(public readonly value: string) {} }', 0],
    ['empty private constructor requires an explanation', 'export class Value { private constructor() {} }', 1],
    [
        'documented private constructor',
        'export class Value { private constructor() { /* Prevent construction. */ } }',
        0,
    ],
    ['runtime variable', 'const unused = 1; export {};', 1],
    ['runtime argument', 'export function read(unused: string): number { return 1; }', 1],
    [
        'runtime shadow',
        'const value = 1; export function read(value: number): number { return value; } export { value };',
        1,
    ],
    ['unused catch binding', 'try { throw new Error(); } catch (error) { /* Intentionally ignored. */ }', 0],
    ['rest sibling', 'const source = { omit: 1, keep: 2 }; const { omit, ...rest } = source; export { rest };', 0],
    ['typed indentation', 'export interface Value {\n    value: string;\n}\n', 0],
    ['incorrect typed indentation', 'export interface Value {\n  value: string;\n}\n', 1],
] as const;
const extensions = ['ts', 'tsx', 'mts', 'cts'];
let counts: Map<string, number>;

beforeAll(async () => {
    const preset = createConfig('typescript');
    const overlay = preset.overrides![0]!.rules!;
    const names = [
        'eslint/no-unused-vars',
        'eslint/no-shadow',
        'eslint/no-useless-constructor',
        'eslint/no-empty-function',
        'ag-style/indent',
    ];
    const config = {
        ...preset,
        jsPlugins: [{ name: 'ag-style', specifier: require.resolve('@agcodeguidelines/oxlint-plugin/stylistic') }],
        rules: Object.fromEntries(names.map((name) => [name, overlay[name as keyof typeof overlay]])),
        overrides: [],
    };
    const files = Object.fromEntries(
        extensions.flatMap((extension) => scenarios.map(([, code], index) => [`case-${index}.${extension}`, code])),
    );
    const results = await lintBatch(config, files);
    counts = new Map(Array.from(results, ([filename, diagnostics]) => [filename, diagnostics.length]));
});

extensions.forEach((extension) => {
    scenarios.forEach(([name, , expected], index) => {
        it(`${extension}: ${name}`, () => {
            expect(counts.get(`case-${index}.${extension}`)).toBe(expected);
        });
    });
});
