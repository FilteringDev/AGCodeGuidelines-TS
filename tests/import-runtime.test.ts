/** @file Verify dependency parsing, documentation, and resolution in the Vitest process. */
import {
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RuleTester } from 'oxlint/plugins-dev';
import {
    afterAll,
    describe,
    expect,
    it,
} from 'vitest';

import imports from '../packages/oxlint-plugin/src/import';
import { parseRemote } from '../packages/oxlint-plugin/src/import-parser';
import typescriptResolver from '../vendor/import/compat/import-resolver';
import RemoteSourceCode from '../vendor/import/compat/remote-source';

type Parsed = {
    body: { type: string; range: [number, number]; loc: { start: { line: number; column: number } } }[];
    comments: { range: [number, number]; value: string }[];
};

it.each(['\n', '\r\n', '\r', '\u2028', '\u2029'])('preserves dependency locations across %j', (newline) => {
    const code = `// 😀${newline}/** Public. */${newline}export const value = 'é';`;
    const ast = parseRemote(code, { filePath: 'dependency.ts' }) as Parsed;
    expect(ast.body[0]!.loc.start).toEqual({ line: 3, column: 0 });
    expect(code.slice(...ast.body[0]!.range)).toBe("export const value = 'é';");
    expect(ast.comments.map((comment) => code.slice(...comment.range))).toEqual(['// 😀', '/** Public. */']);
    const source = new RemoteSourceCode({ text: code, ast });
    expect(source.getCommentsBefore(ast.body[0]!)).toEqual(ast.comments);
});

it('attaches positions inside typed arrays, optional children, and declarations', () => {
    const code = 'export interface Value { text?: string }\nexport const values: Value[] = [{ text: "a" }];';
    const ast = parseRemote(code, { filePath: 'types.ts' }) as Parsed;
    expect(ast.body.map((node) => node.type)).toEqual(['ExportNamedDeclaration', 'ExportNamedDeclaration']);
    expect(ast.body[1]!.loc.start).toEqual({ line: 2, column: 0 });
});

it('reports a dependency syntax error at the offending line', () => {
    expect(() => parseRemote('\nconst = ;', { filePath: 'invalid.js' })).toThrow(SyntaxError);
    try {
        parseRemote('\nconst = ;', { filePath: 'invalid.js' });
    } catch (error) {
        expect(error).toMatchObject({ lineNumber: 2, column: 6 });
    }
});

it('respects script and commonjs dependency parsing', () => {
    expect(
        (parseRemote('var value = 1;', { filePath: 'script.js', sourceType: 'script' }) as Parsed).body,
    ).toHaveLength(1);
    expect(
        (parseRemote('module.exports = 1;', { filePath: 'module.cjs', sourceType: 'commonjs' }) as Parsed).body,
    ).toHaveLength(1);
});

it('stops documentation lookup at intervening code and ignores later comments', () => {
    const code = '/** First. */ const first = 1;\nconst second = 2;\n/** Later. */';
    const ast = parseRemote(code, { filePath: 'docs.js' }) as Parsed;
    const source = new RemoteSourceCode({ text: code, ast });
    expect(source.getCommentsBefore(ast.body[0]!)).toEqual([ast.comments[0]]);
    expect(source.getCommentsBefore(ast.body[1]!)).toEqual([]);
    expect(new RemoteSourceCode({ text: '', ast: { comments: [] } }).getCommentsBefore({ range: [0, 0] })).toEqual([]);
});

it('resolves TypeScript aliases, extension aliases, package exports, and builtins', () => {
    const root = mkdtempSync(join(tmpdir(), 'ag-resolver-'));
    try {
        mkdirSync(join(root, 'src'));
        mkdirSync(join(root, 'node_modules/example'), { recursive: true });
        writeFileSync(
            join(root, 'tsconfig.json'),
            JSON.stringify({ compilerOptions: { paths: { '@app/*': ['./src/*'] } } }),
        );
        writeFileSync(join(root, 'src/value.ts'), 'export const value = 1;');
        writeFileSync(
            join(root, 'node_modules/example/package.json'),
            JSON.stringify({ exports: { '.': { types: './index.d.ts', default: './index.js' } } }),
        );
        writeFileSync(join(root, 'node_modules/example/index.d.ts'), 'export declare const value: number;');
        const filename = join(root, 'entry.ts');
        writeFileSync(filename, '');
        for (const specifier of ['./src/value.js', './src/value', '@app/value']) {
            expect(typescriptResolver.resolve(specifier, filename)).toEqual({
                found: true,
                path: join(root, 'src/value.ts'),
            });
        }
        expect(typescriptResolver.resolve('example', filename)).toEqual({
            found: true,
            path: join(root, 'node_modules/example/index.d.ts'),
        });
        expect(typescriptResolver.resolve('node:fs', filename)).toEqual({ found: true, path: null });
        expect(typescriptResolver.resolve('fs', filename)).toEqual({ found: true, path: null });
        expect(typescriptResolver.resolve('./missing', filename)).toEqual({ found: false });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

RuleTester.describe = describe;
RuleTester.it = it;
new RuleTester().run('dependency rule adapter', imports.rules['no-webpack-loader-syntax']!, {
    valid: ['import value from "./value.js";'],
    invalid: [
        {
            code: 'import value from "loader!./value.js";',
            errors: [
                {
                    message:
                        "Unexpected '!' in 'loader!./value.js'. Do not use import syntax to configure webpack loaders.",
                },
            ],
        },
    ],
});

describe('configured dependency directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'ag-dependency-dirs-'));
    afterAll(() => rmSync(root, { recursive: true, force: true }));
    const directories = ['first', 'second'].map((name) => join(root, name));
    directories.forEach((directory, index) => {
        mkdirSync(directory);
        writeFileSync(join(directory, 'package.json'), JSON.stringify({ dependencies: { [`dep${index}`]: '1' } }));
    });
    ['dep0', 'dep1', 'missing'].forEach((name) => {
        const directory = join(root, 'node_modules', name);
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, main: 'index.js' }));
        writeFileSync(join(directory, 'index.js'), 'export default 1;');
    });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'consumer' }));
    const filename = join(root, 'entry.js');
    writeFileSync(filename, '');
    const options = [{ packageDir: directories }];
    new RuleTester().run('import dependencies from multiple package directories', imports.rules['no-extraneous-dependencies']!, {
        valid: [
            { filename, options, code: 'import first from "dep0"; import second from "dep1";' },
        ],
        invalid: [{
            filename,
            options,
            code: 'import missing from "missing";',
            errors: [{ message: /'missing' should be listed in the project's dependencies/u }],
        }],
    });
});
