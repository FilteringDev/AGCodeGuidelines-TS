/** @file Prepare independent temporary consumers without writing to reference projects. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
    lstat,
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    readlink,
    realpath,
    rm,
    symlink,
    unlink,
    writeFile,
} from 'node:fs/promises';
import {
    basename,
    dirname,
    isAbsolute,
    join,
    relative,
    resolve,
    sep,
} from 'node:path';
import { pathToFileURL } from 'node:url';

const PROJECTS = ['AdGuardVPNExtension', 'AdguardBrowserExtension', 'Scriptlets', 'tsurlfilter'];
const EXCLUDED = new Set(['.git', 'node_modules']);
interface Entry {
    path: string;
    kind: 'file' | 'directory' | 'link';
    value: string;
    mode: number;
}
interface MirrorManifest {
    version: 1;
    sourceRoot: string;
    projects: Record<string, Entry[]>;
}

/**
 * Check containment without treating similarly prefixed siblings as children.
 * @param root Parent directory.
 * @param target Candidate path.
 * @returns Whether the path stays in the parent directory.
 */
function contains(root: string, target: string): boolean {
    const path = relative(root, target);
    return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

/**
 * Snapshot file contents and link targets without following symlinks.
 * @param root Source directory.
 * @returns Deterministic source inventory, including Git metadata.
 */
async function snapshot(root: string): Promise<Entry[]> {
    const entries: Entry[] = [];
    const visit = async (directory: string): Promise<void> => {
        for (const name of (await readdir(directory)).sort()) {
            const filename = join(directory, name);
            const info = await lstat(filename);
            const path = relative(root, filename).split(sep).join('/');
            if (info.isSymbolicLink()) {
                entries.push({
                    path, kind: 'link', value: await readlink(filename), mode: info.mode,
                });
            } else if (info.isDirectory()) {
                entries.push({
                    path, kind: 'directory', value: '', mode: info.mode,
                });
                await visit(filename);
            } else if (info.isFile()) {
                const hash = createHash('sha256');
                for await (const chunk of createReadStream(filename)) {
                    hash.update(chunk);
                }
                entries.push({
                    path, kind: 'file', value: hash.digest('hex'), mode: info.mode,
                });
            } else {
                throw new Error(`Unsupported source entry: ${filename}`);
            }
        }
    };
    await visit(root);
    return entries;
}

/**
 * Decide which source entries belong in an independent consumer copy.
 * @param path Source-relative path using forward slashes.
 * @returns Whether the entry is copied.
 */
function copied(path: string): boolean {
    return !path.split('/').some((part) => EXCLUDED.has(part));
}

/**
 * Verify that no reference source file or link changed during a mirror experiment.
 * @param directory Run directory returned by prepareMirrors.
 * @returns Resolves only when every source snapshot still matches.
 */
export async function verifyMirrors(directory: string): Promise<void> {
    const root = await realpath(directory);
    if (dirname(root) !== await realpath('/tmp') || !basename(root).startsWith('agcodeguidelines-migration-')) {
        throw new Error('Expected an isolated migration directory directly under /tmp.');
    }
    const manifest = JSON.parse(await readFile(join(root, 'reports/source-manifest.json'), 'utf8')) as MirrorManifest;
    if (manifest.version !== 1 || !isAbsolute(manifest.sourceRoot)) {
        throw new Error('Invalid mirror manifest.');
    }
    for (const [project, expected] of Object.entries(manifest.projects)) {
        if (!/^[A-Za-z0-9_-]+$/u.test(project)) {
            throw new Error('Invalid mirror project.');
        }
        const actual = await snapshot(join(manifest.sourceRoot, project));
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(`Read-only reference changed: ${project}`);
        }
    }
}

/**
 * Prepare baseline and candidate trees, retaining source fingerprints for verification.
 * @param sourceRoot Read-only directory containing the reference projects.
 * @param projects Project names to mirror.
 * @returns The unique run directory beneath the system /tmp directory.
 */
export async function prepareMirrors(
    sourceRoot = '/references/outside',
    projects: readonly string[] = PROJECTS,
): Promise<string> {
    if (!projects.length || new Set(projects).size !== projects.length
        || projects.some((name) => !/^[A-Za-z0-9_-]+$/u.test(name))) {
        throw new Error('Mirror projects must be distinct directory names.');
    }
    const source = await realpath(sourceRoot);
    const manifest: MirrorManifest = { version: 1, sourceRoot: source, projects: {} };
    for (const project of projects) {
        const root = join(source, project);
        if (!(await lstat(root)).isDirectory()) {
            throw new Error(`Project must be a real directory: ${root}`);
        }
        const entries = await snapshot(root);
        for (const entry of entries.filter((item) => item.kind === 'link' && copied(item.path))) {
            const target = await realpath(join(root, entry.path));
            if (!contains(root, target) || !copied(relative(root, target).split(sep).join('/'))) {
                throw new Error(`Unsafe source link: ${project}/${entry.path}`);
            }
        }
        manifest.projects[project] = entries;
    }
    const directory = await mkdtemp(join(await realpath('/tmp'), 'agcodeguidelines-migration-'));
    try {
        for (const name of ['baseline', 'candidate', 'reports', 'artifacts', 'cache']) {
            await mkdir(join(directory, name));
        }
        for (const [project, entries] of Object.entries(manifest.projects)) {
            const root = join(source, project);
            for (const kind of ['baseline', 'candidate']) {
                const target = join(directory, kind, project);
                execFileSync('rsync', [
                    '-a', '--chmod=u+w', '--exclude=.git', '--exclude=node_modules', `${root}/`, `${target}/`,
                ], { stdio: 'pipe' });
                for (const entry of entries.filter((item) => copied(item.path))) {
                    const filename = join(target, entry.path);
                    if (entry.kind === 'link') {
                        const sourceTarget = await realpath(join(root, entry.path));
                        await unlink(filename);
                        const mirrorTarget = join(target, relative(root, sourceTarget));
                        await symlink(relative(dirname(filename), mirrorTarget) || '.', filename);
                    }
                }
                const actual = await snapshot(target);
                const expected = entries.filter((entry) => copied(entry.path));
                if (actual.length !== expected.length || actual.some((entry, index) => {
                    const original = expected[index]!;
                    return entry.path !== original.path || entry.kind !== original.kind
                        || (entry.kind === 'file' && entry.value !== original.value);
                })) {
                    throw new Error(`Mirror differs from source snapshot: ${kind}/${project}`);
                }
            }
        }
        await writeFile(join(directory, 'reports/source-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        await verifyMirrors(directory);
        return directory;
    } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const [command, directory] = process.argv.slice(2);
    if (command === 'prepare' && !directory) {
        process.stdout.write(`${await prepareMirrors()}\n`);
    } else if (command === 'verify' && directory) {
        await verifyMirrors(directory);
        process.stdout.write('Reference sources are unchanged.\n');
    } else {
        throw new Error('Usage: tsx scripts/mirrors.ts prepare | verify <run-directory>');
    }
}
