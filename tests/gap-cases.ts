/**
 * @file Focused consumer cases for rules whose upstream suites need custom parsers or projects.
 */
export interface GapCase {
    rule: string;
    valid: string;
    invalid: string;
    extension?: string;
    language?: 'javascript' | 'typescript';
    files?: Record<string, string>;
    validFiles?: Record<string, string>;
    invalidFiles?: Record<string, string>;
    /** Configuration layer that enables the rule; absent for the base preset. */
    scope?: 'guideline' | 'adguard-projects';
}

export const gapCases: GapCase[] = [
    {
        rule: '@typescript-eslint/consistent-type-exports',
        scope: 'adguard-projects',
        valid: 'export type { Value } from "./dependency";',
        invalid: 'export { Value } from "./dependency";',
        extension: 'ts',
        language: 'typescript',
        files: {
            'dependency.ts': 'export interface Value { text: string }',
            'tsconfig.json': JSON.stringify({
                compilerOptions: {
                    strict: true, module: 'ESNext', moduleResolution: 'Bundler', types: [], noEmit: true,
                },
                include: ['*.ts'],
            }),
        },
    },
    { rule: 'no-global-assign', valid: 'const local = 1;', invalid: 'Array = 1;' },
    { rule: 'no-implied-eval', valid: 'setTimeout(() => work(), 0);', invalid: 'setTimeout("work()", 0);' },
    { rule: 'no-lone-blocks', valid: 'if (ready) { work(); }', invalid: '{ work(); }' },
    { rule: 'no-redeclare', valid: 'var first; var second;', invalid: 'var value; var value;' },
    { rule: 'no-extra-boolean-cast', valid: 'if (ready) {}', invalid: 'if (!!ready) {}' },
    { rule: 'no-obj-calls', valid: 'Math.random();', invalid: 'Math();' },
    {
        rule: 'no-unneeded-ternary',
        valid: 'const result = ready ? first : second;',
        invalid: 'const result = ready ? true : false;',
    },
    { rule: 'prefer-exponentiation-operator', valid: 'value ** 2;', invalid: 'Math.pow(value, 2);' },
    { rule: 'no-restricted-globals', valid: 'Number.isNaN(value);', invalid: 'isNaN(value);' },
    {
        rule: 'no-shadow',
        valid: 'const value = 1; function run(other) {}',
        invalid: 'const value = 1; function run(value) {}',
    },
    { rule: 'no-undef', valid: 'const value = 1; value;', invalid: 'missing();' },
    { rule: 'prefer-const', valid: 'let value = 1; value = 2;', invalid: 'let value = 1; consume(value);' },
    {
        rule: 'react/jsx-no-undef',
        valid: 'const Widget = () => null; <Widget />;',
        invalid: '<Missing />;',
        extension: 'jsx',
    },
    {
        rule: 'react/jsx-props-no-multi-spaces',
        valid: '<Widget first second />;',
        invalid: '<Widget first  second />;',
        extension: 'jsx',
    },
    {
        rule: 'jsx-a11y/aria-props',
        valid: '<div aria-hidden="true" />;',
        invalid: '<div aria-invisible="true" />;',
        extension: 'jsx',
    },
    {
        rule: 'jsx-a11y/aria-proptypes',
        valid: '<div aria-hidden="true" />;',
        invalid: '<div aria-hidden="sometimes" />;',
        extension: 'jsx',
    },
    {
        rule: 'jsx-a11y/control-has-associated-label',
        valid: '<button aria-label="Save" />;',
        invalid: '<button />;',
        extension: 'jsx',
    },
    {
        rule: 'jsx-a11y/interactive-supports-focus',
        valid: '<div role="button" tabIndex={0} onClick={act} />;',
        invalid: '<div role="button" onClick={act} />;',
        extension: 'jsx',
    },
    {
        rule: 'jsx-a11y/label-has-associated-control',
        valid: '<label htmlFor="name"><input id="name" />Name</label>;',
        invalid: '<label>Name</label>;',
        extension: 'jsx',
    },
    {
        rule: 'jsx-a11y/no-interactive-element-to-noninteractive-role',
        valid: '<button role="button" />;',
        invalid: '<button role="article" />;',
        extension: 'jsx',
    },
    {
        rule: 'jsx-a11y/no-noninteractive-element-interactions',
        valid: '<div role="button" onClick={act} />;',
        invalid: '<article onClick={act} />;',
        extension: 'jsx',
    },
    {
        rule: 'jsx-a11y/no-noninteractive-element-to-interactive-role',
        valid: '<button role="button" />;',
        invalid: '<article role="button" />;',
        extension: 'jsx',
    },
    {
        rule: 'jsx-a11y/no-noninteractive-tabindex',
        valid: '<button tabIndex={0} />;',
        invalid: '<article tabIndex={0} />;',
        extension: 'jsx',
    },
    {
        rule: 'jsx-a11y/no-redundant-roles',
        valid: '<button />;',
        invalid: '<button role="button" />;',
        extension: 'jsx',
    },
    {
        rule: 'jsx-a11y/no-static-element-interactions',
        valid: '<div role="button" onClick={act} />;',
        invalid: '<div onClick={act} />;',
        extension: 'jsx',
    },
    {
        rule: 'jsdoc/check-tag-names',
        valid: '/** @param {string} value - Input. */\nfunction example(value) {}',
        invalid: '/** @notARealTag value */\nfunction example() {}',
    },
    {
        rule: 'jsdoc/no-undefined-types',
        valid: '/** @param {string} value - Input. */\nfunction example(value) {}',
        invalid: '/** @param {MissingType} value - Input. */\nfunction example(value) {}',
    },
    { rule: 'jsdoc/require-jsdoc', valid: '/** Work. */\nfunction example() {}', invalid: 'function example() {}' },
    { rule: 'unicorn/prefer-node-protocol', valid: 'import fs from "node:fs";', invalid: 'import fs from "fs";' },
    { rule: 'unicorn/no-this-assignment', valid: 'const callback = () => this.value;', invalid: 'const self = this;' },
    {
        rule: 'import/no-unresolved',
        valid: 'import value from "./dependency";',
        invalid: 'import value from "./missing";',
    },
    {
        rule: 'import/named',
        valid: 'import { named } from "./dependency";',
        invalid: 'import { missing } from "./dependency";',
    },
    {
        rule: 'import/export',
        valid: 'export const value = 1;',
        invalid: 'const value = 1; export { value }; export { value };',
    },
    {
        rule: 'import/no-named-as-default',
        valid: 'import value from "./dependency";',
        invalid: 'import named from "./dependency";',
    },
    {
        rule: 'import/no-named-as-default-member',
        valid: 'import value from "./dependency"; value.other;',
        invalid: 'import value from "./dependency"; value.named;',
    },
    {
        rule: 'import/no-extraneous-dependencies',
        valid: 'import fs from "node:fs";',
        invalid: 'import value from "undeclared";',
        files: {
            'node_modules/undeclared/package.json': '{"name":"undeclared","main":"index.js"}',
            'node_modules/undeclared/index.js': 'export default 1;',
        },
    },
    { rule: 'import/no-mutable-exports', valid: 'export const value = 1;', invalid: 'export let value = 1;' },
    {
        rule: 'import/no-amd',
        valid: 'import value from "./dependency";',
        invalid: 'define(["dependency"], function (value) {});',
    },
    {
        rule: 'import/first',
        valid: 'import value from "./dependency"; work();',
        invalid: 'work(); import value from "./dependency";',
    },
    {
        rule: 'import/no-duplicates',
        valid: 'import { named } from "./dependency";',
        invalid: 'import value from "./dependency"; import { named } from "./dependency";',
    },
    {
        rule: 'import/extensions',
        valid: 'import value from "./dependency";',
        invalid: 'import value from "./dependency.js";',
    },
    {
        rule: 'import/order',
        valid: 'import fs from "node:fs";\nimport value from "./dependency";',
        invalid: 'import value from "./dependency";\nimport fs from "node:fs";',
    },
    {
        rule: 'import/newline-after-import',
        valid: 'import value from "./dependency";\n\nwork();',
        invalid: 'import value from "./dependency";\nwork();',
    },
    {
        rule: 'import/prefer-default-export',
        valid: 'const value = 1; export default value;',
        invalid: 'export const value = 1;',
    },
    {
        rule: 'import/no-absolute-path',
        valid: 'import value from "./dependency";',
        invalid: 'import value from "/absolute/path";',
    },
    {
        rule: 'import/no-dynamic-require',
        valid: 'const value = require("./dependency");',
        invalid: 'const value = require(path);',
    },
    {
        rule: 'import/no-webpack-loader-syntax',
        valid: 'import value from "./dependency";',
        invalid: 'import value from "loader!./dependency";',
    },
    {
        rule: 'import/no-named-default',
        valid: 'import value from "./dependency";',
        invalid: 'import { default as value } from "./dependency";',
    },
    {
        rule: 'import/no-self-import',
        valid: 'import value from "./dependency";',
        invalid: 'import value from "./main.js";',
    },
    {
        rule: 'import/no-cycle',
        valid: 'import value from "./dependency";',
        invalid: 'import value from "./dependency";',
        invalidFiles: { 'dependency.js': 'import value from "./main.js"; export default value;' },
    },
    {
        rule: 'import/no-useless-path-segments',
        valid: 'import value from "./dependency";',
        invalid: 'import value from "./folder/../dependency";',
        files: { 'folder/placeholder.js': 'export default 1;' },
    },
    {
        rule: 'import/no-import-module-exports',
        valid: 'import value from "./dependency"; export default value;',
        invalid: 'import value from "./dependency"; module.exports = value;',
    },
    {
        rule: 'import/no-relative-packages',
        valid: 'import value from "./dependency";',
        invalid: 'import value from "./other/entry.js";',
        files: { 'other/package.json': '{"name":"other","type":"module"}', 'other/entry.js': 'export default 1;' },
    },
    {
        rule: 'import/no-unassigned-import',
        scope: 'adguard-projects',
        valid: 'import value from "./dependency";',
        invalid: 'import "./dependency";',
    },
    {
        rule: 'sort-imports',
        valid: 'import { a, b } from "./dependency";',
        invalid: 'import { b, a } from "./dependency";',
    },
    {
        rule: 'no-restricted-imports',
        scope: 'adguard-projects',
        valid: 'import value from "./allowed";',
        invalid: 'import value from "./feature-mv2";',
    },
    {
        rule: 'import-newlines/enforce',
        scope: 'adguard-projects',
        valid: 'import { a } from "./dependency";',
        invalid: 'import { a, b, c, d } from "./dependency";',
    },
    {
        rule: 'boundaries/element-types',
        scope: 'adguard-projects',
        // Resolves extensionless '../src/index' to src/index.ts via the
        // TypeScript-aware import resolver.
        language: 'typescript',
        valid: 'import value from "../src/helper";',
        invalid: 'import value from "../src/index";',
        files: {
            'src/index.ts': 'export const value = 1;',
            'src/helper.ts': 'export const value = 1;',
        },
        validFiles: { 'test/main.js': 'import value from "../src/helper";' },
        invalidFiles: { 'test/main.js': 'import value from "../src/index";' },
    },
    {
        rule: '@adguard/logger-context/require-logger-context',
        scope: 'adguard-projects',
        valid: 'logger.error("[ext.main]: message");',
        invalid: 'logger.error("message");',
    },
    {
        rule: '@typescript-eslint/no-explicit-any',
        scope: 'adguard-projects',
        valid: 'export const value: unknown = 1;',
        invalid: 'export const value: any = 1;',
        extension: 'ts',
    },
    {
        rule: '@typescript-eslint/explicit-function-return-type',
        scope: 'adguard-projects',
        valid: 'export function read(): number { return 1; }',
        invalid: 'export function read() { return 1; }',
        extension: 'ts',
    },
    {
        rule: '@typescript-eslint/no-var-requires',
        scope: 'adguard-projects',
        valid: 'import value from "./dependency";\nconsole.log(value);',
        invalid: 'export const value = require("./dependency");',
        extension: 'ts',
    },
    {
        rule: '@typescript-eslint/ban-ts-comment',
        scope: 'adguard-projects',
        valid: 'export const value = 1;',
        invalid: 'export const value = 1; // @ts-ignore',
        extension: 'ts',
    },
    {
        rule: '@typescript-eslint/explicit-member-accessibility',
        scope: 'adguard-projects',
        valid: 'export class Value { public read(): number { return 1; } }',
        invalid: 'export class Value { read(): number { return 1; } }',
        extension: 'ts',
    },
    {
        rule: '@typescript-eslint/consistent-type-imports',
        scope: 'adguard-projects',
        valid: 'import { type Value } from "./dependency";\nconst x: Value = 1 as Value;\nconsole.log(x);',
        invalid: 'import { Value } from "./dependency";\nconst x: Value = 1 as Value;\nconsole.log(x);',
        extension: 'ts',
        files: { 'dependency.ts': 'export type Value = number;' },
    },
    {
        rule: 'import/no-commonjs',
        scope: 'guideline',
        valid: 'import value from "./dependency";\n\nexport { value };',
        invalid: 'const value = require("./dependency");\n\nmodule.exports = value;',
    },
    {
        rule: 'import/no-namespace',
        scope: 'guideline',
        valid: 'import { named } from "./dependency";\n\nexport { named };',
        invalid: 'import * as dependency from "./dependency";\n\nexport { dependency };',
    },
    {
        rule: 'import/no-default-export',
        scope: 'guideline',
        valid: 'export const value = 1;',
        invalid: 'const value = 1;\n\nexport default value;',
    },
    {
        rule: 'import/order',
        scope: 'guideline',
        valid: 'import fs from "node:fs";\n\nimport value from "./dependency";\n\nexport { fs, value };',
        invalid: 'import fs from "node:fs";\nimport value from "./dependency";\n\nexport { fs, value };',
    },
    {
        rule: 'line-comment-position',
        scope: 'guideline',
        valid: '// Explains the value.\nconst value = 1;',
        invalid: 'const value = 1; // Explains the value.',
    },
    {
        rule: 'lines-around-comment',
        scope: 'guideline',
        valid: 'work();\n\n// Explains the value.\nconst value = 1;',
        invalid: 'work();\n// Explains the value.\nconst value = 1;',
    },
    {
        rule: 'padding-line-between-statements',
        scope: 'guideline',
        valid: 'if (ready) {\n    work();\n}\n\nwork();',
        invalid: 'if (ready) {\n    work();\n}\nwork();',
    },
    {
        rule: 'id-length',
        scope: 'guideline',
        valid: 'const query = 1;',
        invalid: 'const q = 1;',
    },
    {
        rule: 'no-implicit-coercion',
        scope: 'guideline',
        valid: 'const value = Number(source);',
        invalid: 'const value = +source;',
    },
    {
        rule: '@typescript-eslint/no-require-imports',
        scope: 'guideline',
        language: 'typescript',
        extension: 'ts',
        valid: 'import fs from "node:fs";\n\nexport { fs };',
        invalid: 'import fs = require("node:fs");\n\nexport { fs };',
    },
    {
        rule: 'member-delimiter-style',
        scope: 'adguard-projects',
        language: 'typescript',
        extension: 'ts',
        valid: 'export interface Shape {\n    area: number;\n}',
        invalid: 'export interface Shape {\n    area: number\n}',
    },
];
