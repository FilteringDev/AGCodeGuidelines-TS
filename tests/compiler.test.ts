/**
 * @file Verify consumer tsconfig checks for the guide's compiler clauses.
 */
import {
    mkdir,
    mkdtemp,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';

import { parseArguments, runCli } from '../packages/oxlint-config/src/cli';
import { checkTsconfig, parseJsonc } from '../packages/oxlint-config/src/compiler';

let directory: string;

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ag-tsconfig-'));
});

afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
});

/**
 * Write a file below the temporary project.
 * @param name - Relative file name.
 * @param content - File text or JSON value.
 */
async function write(name: string, content: unknown): Promise<void> {
    const path = join(directory, name);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content));
}

describe('JSON with comments', () => {
    it.each([
        ['{"a": 1}', { a: 1 }],
        ['{\n  // comment\n  "a": 1, /* block */\n}', { a: 1 }],
        ['{"list": [1, 2,],}', { list: [1, 2] }],
        ['{"url": "http://example.com/*x*/", "comma": ",}"}', { url: 'http://example.com/*x*/', comma: ',}' }],
        ['{"escaped": "quote \\" // not a comment"}', { escaped: 'quote " // not a comment' }],
        ['// leading\n{"a": true} // trailing', { a: true }],
        ['{"a": 1 /* unterminated', null],
    ])('parses %j', (text, expected) => {
        if (expected === null) {
            expect(() => parseJsonc(text)).toThrow();
        } else {
            expect(parseJsonc(text)).toEqual(expected);
        }
    });
});

describe('tsconfig requirements', () => {
    it('accepts the shared compiler settings', async () => {
        const result = await checkTsconfig('packages/oxlint-config/tsconfig.base.json');
        expect(result.problems).toEqual([]);
        expect(result.compilerOptions).toMatchObject({ strict: true, noUncheckedIndexedAccess: true });
    });

    it('reports every missing clause requirement', async () => {
        await write('tsconfig.json', { compilerOptions: { useUnknownInCatchVariables: false } });
        const { problems } = await checkTsconfig(join(directory, 'tsconfig.json'));
        expect(problems).toEqual([
            '26.1: set "strict": true',
            '26.2: set "noUncheckedIndexedAccess": true',
            '25.3: do not disable "useUnknownInCatchVariables"',
        ]);
    });

    it('follows relative, package, and array extends chains with later files taking precedence', async () => {
        await write('node_modules/shared-config/package.json', { name: 'shared-config', version: '1.0.0' });
        await write('node_modules/shared-config/tsconfig.json', { compilerOptions: { strict: true } });
        await write('configs/strict.json', '{\n  // Relative base\n  "compilerOptions": { "noUncheckedIndexedAccess": true, },\n}');
        await write('configs/loose.json', { compilerOptions: { strict: false } });
        await write('tsconfig.json', { extends: ['./configs/loose', 'shared-config/tsconfig.json', './configs/strict.json'] });
        const result = await checkTsconfig(join(directory, 'tsconfig.json'));
        expect(result.problems).toEqual([]);
        expect(result.files).toHaveLength(4);
    });

    it('resolves package names without an explicit json extension', async () => {
        await write('node_modules/shared-config/package.json', { name: 'shared-config', version: '1.0.0' });
        await write('node_modules/shared-config/base.json', { compilerOptions: { strict: true, noUncheckedIndexedAccess: true } });
        await write('tsconfig.json', { extends: 'shared-config/base' });
        expect((await checkTsconfig(join(directory, 'tsconfig.json'))).problems).toEqual([]);
    });

    it('resolves bare package names like TypeScript and never through main', async () => {
        await write('node_modules/strictest/package.json', { name: 'strictest', main: 'index.js' });
        await write('node_modules/strictest/index.js', 'module.exports = {};');
        await write('node_modules/strictest/tsconfig.json', { compilerOptions: { strict: true, noUncheckedIndexedAccess: true } });
        await write('node_modules/fielded/package.json', { name: 'fielded', tsconfig: 'configs/base.json' });
        await write('node_modules/fielded/configs/base.json', { compilerOptions: { strict: true, noUncheckedIndexedAccess: true } });
        await write('first.json', { extends: 'strictest' });
        await write('second.json', { extends: 'fielded' });
        expect((await checkTsconfig(join(directory, 'first.json'))).problems).toEqual([]);
        expect((await checkTsconfig(join(directory, 'second.json'))).files.at(-1)).toContain('configs');
    });

    it('uses an existing relative file as written and reports unresolved packages', async () => {
        await write('base.jsonc', { compilerOptions: { strict: true, noUncheckedIndexedAccess: true } });
        await write('tsconfig.json', { extends: './base.jsonc' });
        expect((await checkTsconfig(join(directory, 'tsconfig.json'))).problems).toEqual([]);
        await write('missing.json', { extends: 'no-such-config' });
        await expect(checkTsconfig(join(directory, 'missing.json'))).rejects.toThrow(/Cannot resolve tsconfig extends/u);
    });

    it('reports strict-family options disabled next to strict', async () => {
        await write('tsconfig.json', {
            compilerOptions: { strict: true, noUncheckedIndexedAccess: true, strictNullChecks: false },
        });
        expect((await checkTsconfig(join(directory, 'tsconfig.json'))).problems)
            .toEqual(['26.1: do not disable "strictNullChecks", which "strict" enables']);
    });

    it('lets a project disable an inherited requirement and reports it', async () => {
        await write('base.json', { compilerOptions: { strict: true, noUncheckedIndexedAccess: true } });
        await write('tsconfig.json', { extends: './base.json', compilerOptions: { strict: false } });
        expect((await checkTsconfig(join(directory, 'tsconfig.json'))).problems).toEqual(['26.1: set "strict": true']);
    });

    it('rejects circular extends chains', async () => {
        await write('first.json', { extends: './second.json' });
        await write('second.json', { extends: './first.json' });
        await expect(checkTsconfig(join(directory, 'first.json'))).rejects.toThrow(/Circular tsconfig extends/u);
    });
});

describe('tsconfig CLI', () => {
    it('parses the optional path', () => {
        expect(parseArguments(['--check-tsconfig']).tsconfig).toBe('tsconfig.json');
        expect(parseArguments(['--check-tsconfig', 'app/tsconfig.json']).tsconfig).toBe('app/tsconfig.json');
        expect(parseArguments(['--check-tsconfig', '--force']).tsconfig).toBe('tsconfig.json');
    });

    it('prints success and fails with every unmet requirement', async () => {
        await write('good.json', { compilerOptions: { strict: true, noUncheckedIndexedAccess: true } });
        await write('bad.json', { compilerOptions: { strict: true } });
        let output = '';
        await runCli(['--check-tsconfig', join(directory, 'good.json')], (text) => {
            output += text;
        });
        expect(output).toContain("meets the guide's compiler requirements");
        await expect(runCli(['--check-tsconfig', join(directory, 'bad.json')], () => undefined))
            .rejects.toThrow(/26\.2: set "noUncheckedIndexedAccess": true/u);
    });
});
