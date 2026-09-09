/** @file Verify complete configuration materialization and non-destructive CLI behavior. */
import {
    mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    describe, expect, it, vi,
} from 'vitest';

import { parseArguments, runCli, usage } from '../packages/oxlint-config/src/cli';
import { createConfig } from '../packages/oxlint-config/src/index';

it('provides documented defaults', () => {
    expect(parseArguments([])).toEqual({
        options: {},
        output: '.oxlintrc.json',
        force: false,
        help: false,
    });
});

it.each(
    [
        ['--unknown'],
        ['typescript'],
        ['--language'],
        ['--output', '--force'],
        ['--help', '--help'],
        ['--force', '--force'],
        ['--language', 'flow'],
        ['--environment', 'worker'],
        ['--source-type', 'automatic'],
    ].map((args) => ({ args })),
)('rejects invalid arguments $args', ({ args }) => {
    expect(() => parseArguments(args)).toThrow(TypeError);
});

it('prints help without creating a configuration', async () => {
    const output: string[] = [];
    await runCli(['--help'], (text) => output.push(text));
    expect(output).toEqual([usage]);
});

it('uses standard output when no printer is supplied', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
        await runCli(['--help']);
        expect(output).toHaveBeenCalledWith(usage);
    } finally {
        output.mockRestore();
    }
});

it('writes a complete configuration to stdout', async () => {
    const output: string[] = [];
    await runCli(
        ['--language', 'typescript', '--environment', 'node', '--source-type', 'module', '--output', '-'],
        (text) => output.push(text),
    );
    const config = JSON.parse(output.join(''));
    expect(config).toEqual(createConfig({ language: 'typescript', environment: 'node' }));
    expect(config.settings['import/resolver'].typescript).toBe(true);
    expect(config.settings.agReact.pragma).toBe('React');
    expect(config.env).toMatchObject({
        builtin: true,
        es2026: true,
        node: true,
        browser: false,
    });
});

it('requires an explicit force flag before replacing an existing file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ag-config-cli-'));
    const output = join(directory, 'config.json');
    const messages: string[] = [];
    try {
        await runCli(['--output', output], (text) => messages.push(text));
        expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(createConfig());
        await writeFile(output, 'existing configuration');
        await expect(runCli(['--output', output])).rejects.toMatchObject({ code: 'EEXIST' });
        expect(await readFile(output, 'utf8')).toBe('existing configuration');
        await runCli(['--output', output, '--force'], (text) => messages.push(text));
        expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(createConfig());
        expect(messages).toHaveLength(2);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

describe('configuration options remain isolated', () => {
    for (const language of ['javascript', 'typescript'] as const) {
        for (const environment of ['browser', 'node', 'both'] as const) {
            it(`${language}/${environment}`, () => {
                const config = createConfig({ language, environment });
                expect(config.env?.browser).toBe(environment !== 'node');
                expect(config.env?.node).toBe(environment !== 'browser');
                expect(config.options?.typeAware).not.toBe(true);
                config.settings!['import/extensions'] = [];
                expect(createConfig({ language, environment }).settings!['import/extensions']).not.toEqual([]);
            });
        }
    }
});
