/** @file Refresh the guide and reproduce frozen rule sources without installing a lint engine. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    mkdir, mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { execPnpm } from './process';

interface Source {
    repository: string;
    ref: string;
    version: string;
    directory: string;
    archiveSha256?: string;
}
interface SourceLock {
    guide: { repository: string; revision: string };
    sources: Record<string, Source>;
}

const lock = JSON.parse(await readFile('docs/reference/sources.json', 'utf8')) as SourceLock;
const headers: Record<string, string> = { 'User-Agent': 'AGCodeGuidelines snapshot maintenance' };
if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

/**
 * Fetch a public source and surface HTTP failures before changing snapshots.
 * @param url - HTTPS address of a pinned source or upstream revision.
 * @returns A successful source response.
 */
async function fetchSource(url: string): Promise<Response> {
    const response = await fetch(url, {
        headers: url.startsWith('https://api.github.com/') ? headers : {},
        signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) {
        throw new Error(`Source download failed: ${response.status} ${url}`);
    }
    return response;
}

if (process.argv.includes('--latest-guide')) {
    const commit = (await (
        await fetchSource(`https://api.github.com/repos/${lock.guide.repository}/commits/master`)
    ).json()) as { sha: string };
    if (!/^[a-f0-9]{40}$/u.test(commit.sha)) {
        throw new Error('The guide response did not contain a commit SHA.');
    }
    lock.guide.revision = commit.sha;
}
const temporary = await mkdtemp(join(tmpdir(), 'ag-source-download-'));
const root = resolve('.cache/upstream');
await mkdir(root, { recursive: true });
try {
    for (const source of Object.values(lock.sources)) {
        const response = await fetchSource(`https://codeload.github.com/${source.repository}/tar.gz/${source.ref}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const digest = createHash('sha256').update(bytes).digest('hex');
        if (source.archiveSha256 && source.archiveSha256 !== digest) {
            throw new Error(`Source archive changed for ${source.repository}@${source.ref}.`);
        }
        if (!source.archiveSha256 && !process.argv.includes('--record-archives')) {
            throw new Error(`Review and record an archive hash for ${source.repository}@${source.ref}.`);
        }
        source.archiveSha256 = digest;
        const archive = join(temporary, 'source.tgz');
        await writeFile(archive, bytes);
        const output = join(root, source.directory);
        await rm(output, { recursive: true, force: true });
        await mkdir(output, { recursive: true });
        execFileSync('tar', ['-xzf', archive, '-C', output, '--strip-components=1'], { stdio: 'inherit' });
    }
    const guide = `https://raw.githubusercontent.com/${lock.guide.repository}/${lock.guide.revision}/JavaScript`;
    const guideText = await (await fetchSource(`${guide}/Javascript.md`)).text();
    const sampleText = await (await fetchSource(`${guide}/.eslintrc.js`)).text();
    // Verify ports before applying the new guide snapshot.
    execPnpm(['exec', 'tsx', 'scripts/vendor.ts', '--source-root', root], { stdio: 'inherit' });
    await writeFile('docs/reference/Javascript.md', guideText);
    await writeFile('docs/reference/eslintrc.cjs', sampleText);
    await writeFile('docs/reference/sources.json', `${JSON.stringify(lock, null, 2)}\n`);
    for (const task of ['snapshots:airbnb', 'catalog:generate', 'build']) {
        execPnpm(['run', task], { stdio: 'inherit' });
    }
    execPnpm(['run', 'fixtures:import', '--source-root', root], { stdio: 'inherit' });
    execPnpm(['run', 'snapshots:record'], { stdio: 'inherit' });
} finally {
    await rm(temporary, { recursive: true, force: true });
}
