/** @file Freeze source provenance and reject snapshot drift or an installed ESLint engine. */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';

import lock from '../docs/reference/sources.json' with { type: 'json' };
import recipes from './vendor-recipes.json' with { type: 'json' };
import sample from '../docs/reference/eslintrc';
import { portReference, verifyReference } from './reference';

const files = [
    ...Object.keys(recipes),
    ...Object.values(recipes as Record<string, { patchesFile?: string }>)
        .flatMap((recipe) => (recipe.patchesFile ? [recipe.patchesFile] : [])),
    'scripts/vendor-recipes.json',
    'docs/reference/sources.json',
    'docs/reference/Javascript.md',
    'docs/reference/eslintrc.upstream.txt',
    'docs/reference/eslintrc.ts',
    'scripts/reference-patches.json',
    'docs/reference/airbnb.json',
    'tests/fixtures/upstream.json',
    'tests/fixtures/import-report.json',
].sort();
const rawReference = await readFile('docs/reference/eslintrc.upstream.txt', 'utf8');
verifyReference(rawReference, sample);
if (portReference(rawReference) !== await readFile('docs/reference/eslintrc.ts', 'utf8')) {
    throw new Error('The typed reference configuration does not match its reviewed port.');
}
const hashes: Record<string, string> = {};
for (const file of files) {
    hashes[file] = createHash('sha256')
        .update(await readFile(file))
        .digest('hex');
}
const content = `${JSON.stringify({ guide: lock.guide, sources: lock.sources, hashes }, null, 2)}\n`;
if (process.argv.includes('--write')) {
    await writeFile('vendor/manifest.json', content);
} else if ((await readFile('vendor/manifest.json', 'utf8')) !== content) {
    throw new Error('Frozen inputs changed. Review the source update, then run pnpm run snapshots:record.');
}
const installed = await readdir('node_modules/.pnpm');
if (installed.some((name) => /^eslint@/u.test(name))) {
    throw new Error('An ESLint engine is installed; disable automatic peer installation and remove it.');
}
const dependencyLock = await readFile('pnpm-lock.yaml', 'utf8');
if (/^ {2}eslint@/mu.test(dependencyLock)) {
    throw new Error('The lockfile resolves an ESLint engine.');
}
const report = JSON.parse(await readFile('tests/fixtures/import-report.json', 'utf8'));
if (Object.keys(report.failures).length || report.count < 10000) {
    throw new Error('The upstream corpus is incomplete.');
}
process.stdout.write(`Verified ${files.length} frozen inputs and the engine-free dependency graph.\n`);
