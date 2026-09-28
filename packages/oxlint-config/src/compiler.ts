/** @file Verify that a consumer tsconfig enables the compiler options required by the guide. */
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
    dirname,
    isAbsolute,
    join,
    resolve,
} from 'node:path';

// Options that `strict: true` enables and a project can still turn off individually.
const STRICT_FAMILY = [
    'alwaysStrict',
    'noImplicitAny',
    'noImplicitThis',
    'strictBindCallApply',
    'strictBuiltinIteratorReturn',
    'strictFunctionTypes',
    'strictNullChecks',
    'strictPropertyInitialization',
];

export interface TsconfigCheck {
    /** Resolved configuration files, starting with the checked file. */
    files: string[];
    /** Compiler options after applying the `extends` chain. */
    compilerOptions: Record<string, unknown>;
    /** Unmet guide requirements. */
    problems: string[];
}

/**
 * Find the next significant character after whitespace and comments.
 * @param text - Configuration text.
 * @param start - Offset to scan from.
 * @returns Offset of the next significant character.
 */
function skipTrivia(text: string, start: number): number {
    let index = start;
    while (index < text.length) {
        if (/\s/u.test(text[index]!)) {
            index += 1;
        } else if (text.startsWith('//', index)) {
            const end = text.indexOf('\n', index);
            index = end === -1 ? text.length : end;
        } else if (text.startsWith('/*', index)) {
            const end = text.indexOf('*/', index + 2);
            index = end === -1 ? text.length : end + 2;
        } else {
            break;
        }
    }
    return index;
}

/**
 * Parse JSON with comments and trailing commas, as TypeScript accepts in tsconfig files.
 * @param text - Configuration text.
 * @returns Parsed value.
 */
export function parseJsonc(text: string): unknown {
    let output = '';
    let index = 0;
    while (index < text.length) {
        index = skipTrivia(text, index);
        const character = text[index];
        if (character === '"') {
            const literal = /"(?:[^"\\]|\\.)*"/uy;
            literal.lastIndex = index;
            const value = literal.exec(text)?.[0] ?? text.slice(index);
            output += value;
            index += value.length;
        } else if (character === ',' && ['}', ']'].includes(text[skipTrivia(text, index + 1)] ?? '')) {
            index += 1;
        } else if (character !== undefined) {
            output += character;
            index += 1;
        }
    }
    return JSON.parse(output);
}

/**
 * Resolve an `extends` entry the way TypeScript does.
 * @param specifier - Value from the `extends` field.
 * @param from - Configuration file that declares it.
 * @returns Absolute path of the extended configuration.
 */
function resolveExtends(specifier: string, from: string): string {
    if (specifier.startsWith('.') || isAbsolute(specifier)) {
        const path = resolve(dirname(from), specifier);
        return existsSync(path) || path.endsWith('.json') ? path : `${path}.json`;
    }
    const require = createRequire(from);
    const bare = /^(?:@[^/]+\/)?[^/]+$/u.test(specifier);
    // A bare package name uses its package.json `tsconfig` field or its root tsconfig.json, never `main`.
    const candidates = bare ? [`${specifier}/tsconfig.json`] : [specifier, `${specifier}.json`];
    if (bare) {
        try {
            const manifest = require.resolve(`${specifier}/package.json`);
            const { tsconfig } = JSON.parse(readFileSync(manifest, 'utf8')) as { tsconfig?: unknown };
            if (typeof tsconfig === 'string') {
                candidates.unshift(join(dirname(manifest), tsconfig));
            }
        } catch {
            // Packages may hide package.json behind `exports`; the root tsconfig.json still applies.
        }
    }
    for (const candidate of candidates) {
        try {
            return require.resolve(candidate);
        } catch {
            // Try the next form TypeScript accepts.
        }
    }
    throw new Error(`Cannot resolve tsconfig extends "${specifier}" from ${from}`);
}

/**
 * Load a configuration and its `extends` chain; later files override earlier ones.
 * @param path - Configuration path.
 * @param seen - Files on the current chain, used to reject cycles.
 * @returns Resolved files and merged compiler options.
 */
async function load(path: string, seen: string[]): Promise<Omit<TsconfigCheck, 'problems'>> {
    if (seen.includes(path)) {
        throw new Error(`Circular tsconfig extends: ${[...seen, path].join(' -> ')}`);
    }
    const config = parseJsonc(await readFile(path, 'utf8')) as {
        extends?: string | string[];
        compilerOptions?: Record<string, unknown>;
    };
    const parents = config.extends === undefined ? [] : [config.extends].flat();
    const files = [path];
    let compilerOptions: Record<string, unknown> = {};
    for (const parent of parents) {
        const loaded = await load(resolveExtends(parent, path), [...seen, path]);
        files.push(...loaded.files);
        compilerOptions = { ...compilerOptions, ...loaded.compilerOptions };
    }
    return { files, compilerOptions: { ...compilerOptions, ...config.compilerOptions } };
}

/**
 * Check clauses 26.1 and 26.2 and the unknown catch variables that clause 25.3 relies on.
 * @param path - tsconfig file to check.
 * @returns Resolved options and any unmet requirements.
 */
export async function checkTsconfig(path = 'tsconfig.json'): Promise<TsconfigCheck> {
    const { files, compilerOptions } = await load(resolve(path), []);
    const problems: string[] = [];
    if (compilerOptions.strict !== true) {
        problems.push('26.1: set "strict": true');
    }
    if (compilerOptions.noUncheckedIndexedAccess !== true) {
        problems.push('26.2: set "noUncheckedIndexedAccess": true');
    }
    if (compilerOptions.useUnknownInCatchVariables === false) {
        problems.push('25.3: do not disable "useUnknownInCatchVariables"');
    }
    STRICT_FAMILY.filter((option) => compilerOptions[option] === false).forEach((option) => {
        problems.push(`26.1: do not disable "${option}", which "strict" enables`);
    });
    return { files, compilerOptions, problems };
}
