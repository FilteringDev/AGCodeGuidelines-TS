/**
 * @file Run the complete TypeScript preset on idiomatic TypeScript and on TypeScript-only violations.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';

import { createConfig } from '../packages/oxlint-config/src/index';
import { catalog } from '../packages/rule-catalog/src/index';
import { lintBatch } from './cli';

import type { Policy } from '../packages/rule-catalog/src/index';
import type { Diagnostic } from './cli';

const REQUIRE = createRequire(import.meta.url);
const CORPUS = new URL('./fixtures/typescript/', import.meta.url);
const HEADER = '/**\n * @file TypeScript fixture.\n */\n\n';
const POLICIES: Policy[] = ['compatibility', 'guideline'];
// Builds template substitutions in fixture source text without writing `${` inside a string literal.
const DOLLAR = '$';
const corpus = Object.fromEntries(readdirSync(CORPUS).map((name) => [name, readFileSync(new URL(name, CORPUS), 'utf8')]));

// Each violation is missed by the pinned JavaScript implementation but reported by the TypeScript-aware one,
// or guards that a replacement keeps reporting genuine errors. Duplicate class members are omitted: Oxc
// rejects them in TypeScript before rules run, so the replacement only has to accept overloads.
const violations: [string, string, string][] = [
    ['enum trailing comma', "enum Color {\n    Red = 'Red',\n    Green = 'Green'\n}\n\nexport { Color };", 'ag-style/comma-dangle'],
    ['tuple trailing comma', 'type Pair = [\n    string,\n    number\n];\n\nexport type { Pair };', 'ag-style/comma-dangle'],
    ['type parameter trailing comma', 'type Pair<\n    First,\n    Second\n> = [First, Second];\n\nexport type { Pair };', 'ag-style/comma-dangle'],
    ['union spacing', 'type Value = string|number;\n\nexport type { Value };', 'ag-style/space-infix-ops'],
    ['type literal spacing', 'type Value = {first: string};\n\nexport type { Value };', 'ag-style/object-curly-spacing'],
    ['interface key spacing', 'interface Shape {\n    area : number;\n}\n\nexport type { Shape };', 'ag-style/key-spacing'],
    ['interface block spacing', 'interface Shape{\n    area: number;\n}\n\nexport type { Shape };', 'ag-style/space-before-blocks'],
    ['type alias semicolon', 'type Value = string\n\nexport type { Value };', 'ag-style/semi'],
    [
        'abstract member semicolon',
        'abstract class Shape {\n    public abstract area(): number\n}\n\nexport { Shape };',
        'ag-style/semi',
    ],
    ['type argument spacing', 'type Table = Map<string,number>;\n\nexport type { Table };', 'ag-style/comma-spacing'],
    ['var redeclaration', 'var value = 1;\nvar value = 2;\n\nexport { value };', 'ag-ts/no-redeclare'],
    ['array constructor', 'const VALUES = new Array(1, 2);\n\nexport { VALUES };', 'eslint/no-array-constructor'],
    ['use before define', 'const FIRST = SECOND;\nconst SECOND = 1;\n\nexport { FIRST, SECOND };', 'eslint/no-use-before-define'],
    [
        'default before required',
        `const greet = (greeting = 'hi', name: string): string => \`${DOLLAR}{greeting} ${DOLLAR}{name}\`;\n\n`
            + 'export { greet };',
        'eslint/default-param-last',
    ],
];

const outcomes = new Map<string, Diagnostic[]>();

beforeAll(async () => {
    for (const policy of POLICIES) {
        const base = createConfig({ language: 'typescript', policy });
        const config = {
            ...base,
            jsPlugins: (base.jsPlugins as { name: string; specifier: string }[])
                .map((provider) => ({ ...provider, specifier: REQUIRE.resolve(provider.specifier) })),
        };
        const files = {
            'package.json': '{"name":"typescript-corpus","type":"module","dependencies":{"react":"19.0.0"}}',
            ...corpus,
            ...Object.fromEntries(violations.map(([, code], index) => [`violations/case-${index}.ts`, `${HEADER}${code}\n`])),
        };
        const results = await lintBatch(config, files);
        results.forEach((diagnostics, name) => outcomes.set(`${policy}/${name}`, diagnostics));
    }
}, 300000);

describe.each(POLICIES)('%s TypeScript preset', (policy) => {
    it.each(Object.keys(corpus))('accepts idiomatic TypeScript in %s', (name) => {
        const diagnostics = outcomes.get(`${policy}/${name}`)!
            // The React package is not installed in the temporary project.
            .filter((diagnostic) => !(diagnostic.code === 'ag-import(no-unresolved)' && diagnostic.message.includes("'react'")));
        expect(diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)).toEqual([]);
    });

    it.each(violations.map(([label, , rule], index) => [label, rule, index] as const))(
        'reports %s with %s',
        (_label, rule, index) => {
            const codes = outcomes.get(`${policy}/violations/case-${index}.ts`)!
                .map((diagnostic) => diagnostic.code?.replace(/^([^()]+)\(([^)]+)\)$/u, '$1/$2'));
            expect(codes).toContain(rule);
        },
    );
});

it('records a TypeScript implementation for every rule it replaces', () => {
    const replaced = Object.entries(catalog.typescriptRules)
        .filter(([, setting]) => setting === 'off')
        .map(([target]) => target);
    replaced.forEach((target) => {
        const mapping = catalog.mappings.find((entry) => entry.target === target && !entry.scope);
        expect(mapping?.typescript, target).toBeDefined();
    });
    violations.forEach(([, , rule]) => {
        expect(Object.keys(catalog.typescriptRules)).toContain(rule);
    });
});
