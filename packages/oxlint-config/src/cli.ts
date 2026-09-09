#!/usr/bin/env node
/** @file Materialize a complete Oxlint configuration for a consumer project. */
import { writeFile } from 'node:fs/promises';

import { createConfig } from './index';

import type { ConfigOptions } from './index';

export const usage = `Usage: ag-oxlint-config [options]

  --language javascript|typescript  Source language (default: javascript)
  --environment browser|node|both   Globals (default: browser)
  --source-type module|script|commonjs  Module semantics (default: module)
  --output PATH                    Output file (default: .oxlintrc.json)
  --force                          Replace an existing output file
  --help                           Print this help
`;

/**
 * Parse the CLI arguments before making any filesystem changes.
 * @param args - Literal command-line arguments.
 * @returns Validated options and output settings.
 */
export function parseArguments(args: string[]): {
    options: ConfigOptions;
    output: string;
    force: boolean;
    help: boolean;
} {
    const result = {
        options: {} as ConfigOptions,
        output: '.oxlintrc.json',
        force: false,
        help: false,
    };
    const seen = new Set<string>();
    for (let index = 0; index < args.length; index += 1) {
        const flag = args[index]!;
        if (seen.has(flag)) {
            throw new TypeError(`Duplicate option: ${flag}`);
        }
        seen.add(flag);
        if (flag === '--force') {
            result.force = true;
        } else if (flag === '--help') {
            result.help = true;
        } else if (['--language', '--environment', '--source-type', '--output'].includes(flag)) {
            const value = args[index + 1];
            if (!value || value.startsWith('--')) {
                throw new TypeError(`Missing value for ${flag}`);
            }
            index += 1;
            if (flag === '--output') {
                result.output = value;
            } else {
                const key = flag === '--source-type' ? 'sourceType' : flag.slice(2);
                Object.assign(result.options, { [key]: value });
            }
        } else {
            throw new TypeError(`Unknown option: ${flag}`);
        }
    }
    createConfig(result.options);
    return result;
}

/**
 * Write a complete configuration, preserving existing files unless explicitly replaced.
 * @param args - Literal command-line arguments.
 * @param print - Destination for human-readable or JSON output.
 */
export async function runCli(
    args: string[],
    print: (text: string) => void = (text) => process.stdout.write(text),
): Promise<void> {
    const {
        options, output, force, help,
    } = parseArguments(args);
    if (help) {
        print(usage);
        return;
    }
    const text = `${JSON.stringify(createConfig(options), null, 2)}\n`;
    if (output === '-') {
        print(text);
        return;
    }
    await writeFile(output, text, { flag: force ? 'w' : 'wx' });
    print(`Created ${output}\n`);
}

if (import.meta.main) {
    await runCli(process.argv.slice(2)).catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
