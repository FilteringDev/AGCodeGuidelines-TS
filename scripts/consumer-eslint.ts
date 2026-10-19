/**
 * @file Collect a consumer's effective ESLint configuration and results through its own installation.
 * No ESLint is loaded in this process; the consumer's copy runs in a child process from its directory.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import type { RuleMap } from '../packages/rule-catalog/src/index';

export interface EslintFile {
    filePath: string;
    messages: { ruleId: string | null; line: number; column: number }[];
    config: {
        rules: RuleMap;
        settings?: Record<string, unknown>;
        env?: Record<string, boolean>;
        globals?: Record<string, boolean | 'readonly' | 'writable' | 'off'>;
        parserOptions?: Record<string, unknown>;
    };
}

const COLLECT = `
import { ESLint } from 'eslint';
const [extensions, allowInlineConfig, ...targets] = JSON.parse(process.argv[1]);
const eslint = new ESLint({ cache: false, extensions, allowInlineConfig });
const files = [];
for (const result of await eslint.lintFiles(targets)) {
    const config = await eslint.calculateConfigForFile(result.filePath);
    files.push({
        filePath: result.filePath,
        messages: result.messages.map(({ ruleId, line, column }) => ({ ruleId, line, column })),
        config: {
            rules: config.rules,
            settings: config.settings,
            env: config.env,
            globals: config.globals,
            parserOptions: config.parserOptions,
        },
    });
}
process.stdout.write(JSON.stringify(files));
`;

/**
 * Lint a consumer with its own ESLint and record each file's effective configuration.
 * @param consumer - Absolute consumer directory containing its ESLint installation and configuration.
 * @param extensions - File extensions ESLint lints when given directories.
 * @param targets - Files or directories relative to the consumer.
 * @param allowInlineConfig - Whether ESLint honors configuration and suppression comments.
 * @returns Absolute file paths, messages and effective configurations.
 */
export function collectEslint(
    consumer: string,
    extensions: readonly string[],
    targets: readonly string[],
    allowInlineConfig = true,
): EslintFile[] {
    const argument = JSON.stringify([extensions, allowInlineConfig, ...(targets.length ? targets : ['.'])]);
    const collected = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', COLLECT, argument],
        { cwd: consumer, encoding: 'utf8', maxBuffer: 1024 ** 3 },
    );
    if (collected.status !== 0) {
        throw new Error(`Consumer ESLint failed: ${collected.stderr.slice(0, 4000)}`);
    }
    return JSON.parse(collected.stdout) as EslintFile[];
}

/**
 * Read the major version of the typescript-eslint plugin that a consumer resolves, without loading it.
 * Ported rules select that version's semantics through the `agTypeScriptEslint` setting.
 * @param consumer - Absolute consumer directory.
 * @returns The major version, or `undefined` when the consumer does not resolve the plugin.
 */
export function typescriptEslintMajor(consumer: string): number | undefined {
    let manifest: string;
    try {
        manifest = createRequire(join(consumer, 'package.json')).resolve('@typescript-eslint/eslint-plugin/package.json');
    } catch {
        return undefined;
    }
    const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version: string };
    return Number.parseInt(version, 10);
}

/**
 * Classify a file by the parser family its consumer configuration applies.
 * @param filePath - File path with its extension.
 * @returns The translated language.
 */
export function languageOf(filePath: string): 'javascript' | 'typescript' {
    return /\.[cm]?tsx?$/u.test(filePath) ? 'typescript' : 'javascript';
}
