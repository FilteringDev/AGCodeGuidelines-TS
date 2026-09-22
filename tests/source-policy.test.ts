/** @file Prevent source-format regressions without misreading fixtures or external declarations. */
import {
    mkdir,
    mkdtemp,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { checkSources, inspectSource } from '../scripts/source-policy';

it.each([
    ['ordinary ESM', 'import value from "./value"; export default value;'],
    ['fixture strings', 'export const fixture = "module.exports = require(\'./fixture.js\')";'],
    ['comments', '// module.exports = require("./fixture.js")\nexport const value = 1;'],
    ['captured module data', 'const module = { exports: {} }; export default module.exports;'],
    ['function-local data', 'export function capture(module: { exports: object }) { return module.exports; }'],
    ['lexical exports binding', 'export function capture(exports: object) { return Object.keys(exports); }'],
])('accepts %s', (_name, source) => {
    expect(inspectSource('scripts/example.ts', source)).toEqual([]);
});

it.each([
    ['module.exports = {};', 'CommonJS module globals'],
    ['module["exports"] = {};', 'CommonJS module globals'],
    ['exports.value = 1;', 'CommonJS module globals'],
    ['require("./local");', 'Use an ESM import'],
    ['module.require("./local");', 'CommonJS module globals'],
    ['{ const module = { exports: {} }; } module.exports = {};', 'CommonJS module globals'],
    ['export = {};', 'Local modules must use ESM'],
    ['import value = require("dependency");', 'Local modules must use ESM'],
    ['export const value: any = 1;', 'Use a concrete type'],
    ['// @ts-nocheck\nexport const value = 1;', 'checking'],
    ['// @ts-ignore\nexport const value = 1;', 'suppressions'],
    ['export const = ;', 'Unexpected token'],
])('rejects source regression %s', (source, message) => {
    expect(inspectSource('packages/example/src/index.ts', source).some((issue) => issue.message.includes(message))).toBe(true);
});

it.each(['js', 'jsx', 'cjs', 'mjs', 'cts'])('rejects .%s source files', (extension) => {
    expect(inspectSource(`scripts/example.${extension}`, 'export default 1;')[0]?.message).toContain('TypeScript ESM');
});

it('accepts precise declarations for external CommonJS packages and rejects local shims', () => {
    expect(inspectSource('vendor/dependencies.d.ts', 'declare module "external" { const value: unknown; export = value; }'))
        .toEqual([]);
    expect(inspectSource('vendor/dependencies.d.ts', 'declare module "*vendor/*.js" { const value: unknown; export = value; }'))
        .toEqual([expect.objectContaining({ message: expect.stringContaining('module shims') })]);
});

it('allows reviewed external loaders and rejects local CommonJS paths', () => {
    const factory = 'import { createRequire as loader } from "node:module"; const load = loader(import.meta.url);';
    const filename = 'vendor/react/compat/iterators.ts';
    expect(inspectSource(filename, `${factory} load("external-package");`)).toEqual([]);
    expect(inspectSource(filename, `${factory} load("../local.ts");`)[0]?.message).toContain('local source paths');
    expect(inspectSource('scripts/new-loader.ts', factory)[0]?.message).toContain('external-loader review');
    expect(inspectSource('scripts/new-loader.ts', 'import * as module from "node:module"; module.createRequire(import.meta.url);')[0]?.message)
        .toContain('external-loader review');
});

it('checks untracked source files while excluding generated output and fixture data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ag-source-policy-'));
    try {
        for (const directory of ['packages/example/src', 'vendor', 'scripts', 'tests/fixtures', 'docs/reference', 'packages/example/dist']) {
            await mkdir(join(root, directory), { recursive: true });
        }
        await writeFile(join(root, 'packages/example/src/index.ts'), 'export default 1;');
        await writeFile(join(root, 'packages/example/dist/index.js'), 'module.exports = 1;');
        await writeFile(join(root, 'tests/fixtures/example.js'), 'module.exports = 1;');
        await writeFile(join(root, 'docs/reference/original.txt'), 'module.exports = 1;');
        expect(await checkSources(root)).toBe(1);
        await writeFile(join(root, 'scripts/regression.js'), 'module.exports = 1;');
        await expect(checkSources(root)).rejects.toThrow('scripts/regression.js:1');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
