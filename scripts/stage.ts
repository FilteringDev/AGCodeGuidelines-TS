/** @file Stage exact review versions without changing workspace manifests or publishing. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    cp,
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import semver from 'semver';

import cacheRoot from './cache-root';
import { execPnpm } from './process';

const version = process.argv[2];
if (!version || semver.valid(version) !== version || !semver.prerelease(version) || version.includes('+')) {
    throw new Error('Usage: pnpm exec tsx scripts/stage.ts <exact-prerelease-version> [output-directory]');
}
const destination = resolve(process.argv[3] ?? cacheRoot('review', version));
await mkdir(dirname(destination), { recursive: true });
await mkdir(destination);
const temporary = await mkdtemp(join(tmpdir(), 'ag-review-stage-'));
const names = ['oxlint-plugin', 'rule-catalog', 'oxlint-config'];

try {
    for (const name of names) {
        const source = resolve('packages', name);
        const staged = join(temporary, name);
        await mkdir(staged);
        for (const file of ['dist', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md',
            ...(name === 'oxlint-config' ? ['tsconfig.base.json'] : [])]) {
            await cp(join(source, file), join(staged, file), { recursive: true });
        }
        const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')) as {
            name: string; version: string; dependencies?: Record<string, string>;
        };
        manifest.version = version;
        for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
            if (range.startsWith('workspace:')) {
                assert.ok(names.some((entry) => dependency === `@agcodeguidelines/${entry}`));
                manifest.dependencies![dependency] = version;
            }
        }
        await writeFile(join(staged, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        execPnpm(['pack', '--pack-destination', destination], { cwd: staged, stdio: 'pipe' });
    }
    const files = [];
    for (const name of (await readdir(destination)).sort()) {
        const archive = join(destination, name);
        const manifest = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }));
        assert.equal(manifest.version, version);
        for (const range of Object.values(manifest.dependencies ?? {})) {
            assert.ok(typeof range === 'string' && !range.startsWith('workspace:'));
        }
        files.push({
            name: manifest.name,
            version,
            archive: name,
            sha256: createHash('sha256').update(await readFile(archive)).digest('hex'),
        });
    }
    const report = {
        version,
        node: process.version,
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        files,
    };
    await writeFile(join(destination, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`Staged ${files.length} review packages at ${destination}; nothing published.\n`);
} finally {
    await rm(temporary, { recursive: true, force: true });
}
