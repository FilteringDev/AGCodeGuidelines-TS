/** @file Verify independent migration copies and read-only reference guards. */
import {
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    stat,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { expect, it as test } from 'vitest';

import { prepareMirrors, verifyMirrors } from '../scripts/mirrors';

const it = test.skipIf(process.platform === 'win32');

it('copies hidden settings and resources without sharing sources or Git metadata', async () => {
    const source = await mkdtemp('/tmp/ag-mirror-fixture-');
    let run: string | undefined;
    try {
        const project = join(source, 'Example');
        await mkdir(join(project, '.git'), { recursive: true });
        await mkdir(join(project, 'node_modules'), { recursive: true });
        await mkdir(join(project, 'dist'), { recursive: true });
        await writeFile(join(project, '.eslintrc.json'), '{}');
        await writeFile(join(project, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0');
        await writeFile(join(project, '.git/config'), 'original git metadata');
        await writeFile(join(project, 'node_modules/dependency'), 'old installation');
        await writeFile(join(project, 'dist/resource.dat'), 'required resource');
        run = await prepareMirrors(source, ['Example']);
        for (const kind of ['baseline', 'candidate']) {
            const copy = join(run, kind, 'Example');
            expect(await readFile(join(copy, '.eslintrc.json'), 'utf8')).toBe('{}');
            expect(await readFile(join(copy, 'dist/resource.dat'), 'utf8')).toBe('required resource');
            await expect(stat(join(copy, '.git'))).rejects.toMatchObject({ code: 'ENOENT' });
            await expect(stat(join(copy, 'node_modules'))).rejects.toMatchObject({ code: 'ENOENT' });
        }
        await writeFile(join(run, 'candidate/Example/.eslintrc.json'), '{"changed":true}');
        expect(await readFile(join(run, 'baseline/Example/.eslintrc.json'), 'utf8')).toBe('{}');
        expect(await readFile(join(project, '.eslintrc.json'), 'utf8')).toBe('{}');
        await verifyMirrors(run);
        await writeFile(join(project, '.eslintrc.json'), '{"unexpected":true}');
        await expect(verifyMirrors(run)).rejects.toThrow('Read-only reference changed');
    } finally {
        if (run) {
            await rm(run, { recursive: true, force: true });
        }
        await rm(source, { recursive: true, force: true });
    }
});

it('remaps internal absolute links and refuses escaping links', async () => {
    const source = await mkdtemp('/tmp/ag-mirror-links-');
    let run: string | undefined;
    try {
        const project = join(source, 'Example');
        await mkdir(project);
        await writeFile(join(project, 'value.txt'), 'original');
        await symlink(join(project, 'value.txt'), join(project, 'internal'));
        run = await prepareMirrors(source, ['Example']);
        const link = join(run, 'candidate/Example/internal');
        expect(await realpath(link)).toBe(join(run, 'candidate/Example/value.txt'));
        await writeFile(link, 'candidate');
        expect(await readFile(join(project, 'value.txt'), 'utf8')).toBe('original');
        await verifyMirrors(run);
        await symlink(source, join(project, 'escape'));
        await expect(prepareMirrors(source, ['Example'])).rejects.toThrow('Unsafe source link');
    } finally {
        if (run) {
            await rm(run, { recursive: true, force: true });
        }
        await rm(source, { recursive: true, force: true });
    }
});

it('rejects ambiguous project names and non-run verification directories', async () => {
    await expect(prepareMirrors('/references/outside', ['../outside'])).rejects.toThrow('directory names');
    await expect(prepareMirrors('/references/outside', ['Example', 'Example'])).rejects.toThrow('distinct');
    await expect(prepareMirrors('/references/outside', [])).rejects.toThrow('directory names');
    await expect(verifyMirrors('/tmp')).rejects.toThrow('isolated migration directory');
});
