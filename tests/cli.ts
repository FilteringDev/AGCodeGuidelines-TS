/**
 * @file Execute real Oxlint processes against isolated temporary projects.
 */
import { execFile } from 'node:child_process';
import {
    mkdir, mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
    isAbsolute, join, relative, resolve,
} from 'node:path';
import { promisify } from 'node:util';

export interface Diagnostic {
    message: string;
    code?: string;
    filename?: string;
    severity: string;
    labels?: { span: { offset: number; length: number; line: number; column: number } }[];
}

const EXEC_FILE = promisify(execFile);
export const OXLINT = resolve('node_modules/oxlint/bin/oxlint');

/**
 * Run a CLI command while retaining expected lint-error exit codes.
 * @param args - Oxlint arguments.
 * @param cwd - Consumer working directory.
 * @returns Parsed diagnostics and process status.
 */
export async function runOxlint(args: string[], cwd: string): Promise<{ diagnostics: Diagnostic[]; status: number }> {
    let stdout: string;
    let status = 0;
    try {
        ({ stdout } = await EXEC_FILE(process.execPath, [OXLINT, ...args, '--format', 'json'], {
            cwd,
            maxBuffer: 32 * 1024 * 1024,
        }));
    } catch (error: unknown) {
        const failure = error as { stdout?: string; stderr?: string; code?: number };
        if (failure.code !== 1 || !failure.stdout) {
            throw error;
        }
        stdout = failure.stdout;
        status = failure.code;
    }
    try {
        return { diagnostics: (JSON.parse(stdout) as { diagnostics: Diagnostic[] }).diagnostics, status };
    } catch {
        throw new Error(`Oxlint did not return diagnostic JSON: ${stdout.slice(0, 2000)}`);
    }
}

/**
 * Run same-configuration source files together while preserving file isolation.
 * @param config - Complete configuration for this batch.
 * @param files - Filename-to-source mapping.
 * @returns Diagnostics indexed by filename.
 */
export async function lintBatch(config: object, files: Record<string, string>): Promise<Map<string, Diagnostic[]>> {
    const directory = await mkdtemp(join(tmpdir(), 'ag-oxlint-'));
    try {
        await writeFile(join(directory, '.oxlintrc.json'), JSON.stringify(config));
        await Promise.all(
            Object.entries(files).map(async ([name, code]) => {
                const filename = join(directory, name);
                await mkdir(resolve(filename, '..'), { recursive: true });
                await writeFile(filename, code);
            }),
        );
        const result = await runOxlint(['--config', '.oxlintrc.json', '--no-ignore', ...Object.keys(files)], directory);
        const byFile = new Map(Object.keys(files).map((name) => [name, [] as Diagnostic[]]));
        result.diagnostics.forEach((diagnostic) => {
            const reported = diagnostic.filename ?? '';
            const name = (isAbsolute(reported) ? relative(directory, reported) : reported)
                .replaceAll('\\', '/')
                .replace(/^\.\//u, '');
            if (!byFile.has(name)) {
                throw new Error(`Unexpected diagnostic outside fixture files: ${JSON.stringify(diagnostic)}`);
            }
            byFile.get(name)!.push(diagnostic);
        });
        return byFile;
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

/**
 * Read a generated JSON configuration.
 * @param language - Preset name.
 * @returns Serialized preset.
 */
export async function preset(language: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(`packages/oxlint-config/dist/${language}.json`, 'utf8'));
}
