/**
 * @file Extract attributed test data from pinned upstream repositories.
 *
 * This maintenance command reads source checkouts supplied with --source-root.
 * Only serialized test cases are committed; upstream test programs are not run
 * during the repository test suite.
 */
import { createHash } from 'node:crypto';
import { readdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
    basename,
    dirname,
    isAbsolute,
    join,
    relative,
} from 'node:path';
import { runInNewContext } from 'node:vm';

import { transformSync } from 'esbuild';
import builtinRules from '../vendor/core/lib/rules/index';

import catalog from '../packages/rule-catalog/src/catalog.json' with { type: 'json' };

const SOURCE_ROOT = process.argv[process.argv.indexOf('--source-root') + 1];
if (!SOURCE_ROOT || !process.argv.includes('--source-root')) {
    throw new Error('Usage: pnpm exec tsx scripts/import-upstream.ts --source-root <directory>');
}
const DEPENDENCY_REQUIRE = createRequire(new URL('../packages/oxlint-plugin/package.json', import.meta.url));
const capture: Record<string, unknown>[] = [];
const failures: Record<string, string> = {};
const exclusions: Record<string, number> = {};
const excludedCases: { origin: string; rule: string; reason: string; codeHash: string }[] = [];
let currentSource = '';
let currentRule = '';
let currentTarget = '';
let currentGroup = '';

/**
 * Remove common indentation from a tagged fixture while preserving its lines.
 * @param strings - Template strings or a plain string.
 * @param values - Interpolated values.
 * @returns Dedented code.
 */
function dedent(strings: TemplateStringsArray | string, ...values: unknown[]): string {
    const text = typeof strings === 'string'
        ? strings
        : strings.reduce((result, part, index) => result + part + (values[index] ?? ''), '');
    const lines = text
        .replace(/^\n/u, '')
        .replace(/\n\s*$/u, '')
        .split('\n');
    const lengths = lines.filter((line) => line.trim()).map((line) => /^\s*/u.exec(line)?.[0].length ?? 0);
    const width = Math.min(...lengths);
    return lines.map((line) => line.slice(width)).join('\n');
}

/**
 * Normalize upstream filenames to portable values before serialization.
 * @param filename - Raw filename captured from an upstream assertion.
 * @returns A cwd-independent filename, or undefined when absent.
 */
function normalizeFilename(filename: unknown): string | undefined {
    if (typeof filename !== 'string') {
        return undefined;
    }
    const portable = filename.replaceAll(SOURCE_ROOT!, '<upstream>');
    if (!isAbsolute(portable)) {
        return portable;
    }
    const cwdRelative = relative(process.cwd(), portable);
    if (cwdRelative && !cwdRelative.startsWith('..') && !isAbsolute(cwdRelative)) {
        return cwdRelative;
    }
    return basename(portable);
}

/**
 * Save a portable, deterministic assertion from an upstream fixture.
 * @param item - Original fixture.
 * @param invalid - Whether diagnostics are expected.
 * @param defaults - Suite defaults.
 * @param lang - Source language.
 */
function save(item: unknown, invalid: boolean, defaults: Record<string, unknown> = {}, lang = 'js'): void {
    if (!item || (typeof item !== 'object' && typeof item !== 'string')) {
        return;
    }
    const value = typeof item === 'string' ? { code: item } : (item as Record<string, unknown>);
    if (typeof value.code !== 'string') {
        return;
    }
    const language = { ...(defaults.languageOptions as object), ...(value.languageOptions as object) } as Record<
        string,
        unknown
    >;
    const parser = {
        ...(defaults.parserOptions as object),
        ...(value.parserOptions as object),
        ...((defaults.languageOptions as Record<string, unknown>)?.parserOptions as object),
        ...((value.languageOptions as Record<string, unknown>)?.parserOptions as object),
    } as Record<string, unknown>;
    const features = new Set<string>(
        Array.isArray(value.features) ? value.features : value.features ? [String(value.features)] : [],
    );
    const unsupported = features.has('no-default') && features.has('no-ts')
        ? 'upstream disables supported parsers'
        : ((features.has('no-default') || features.has('ts') || features.has('types'))
                    && features.has('no-ts-new'))
                || features.has('ts-old')
            ? 'legacy TypeScript parser AST'
            : features.has('types') && /:\s*\*/u.test(value.code)
                ? 'Flow wildcard type'
                : ['flow', 'bind operator', 'do expressions'].find((feature) => features.has(feature));
    const parserName = String(value.parser ?? (language.parser as Record<string, unknown>)?.fixtureParser ?? '');
    if (unsupported || /babel|fixture-parser|custom|typescript-eslint-parser/u.test(parserName)) {
        const reason = unsupported ?? 'custom parser AST';
        exclusions[reason] = (exclusions[reason] ?? 0) + 1;
        excludedCases.push({
            origin: currentSource,
            rule: currentRule,
            reason,
            codeHash: createHash('sha256').update(value.code).digest('hex'),
        });
        return;
    }
    const errors = invalid
        ? typeof value.errors === 'number'
            ? Array.from({ length: value.errors }, () => ({}))
            : value.errors
        : [];
    if (invalid && (!Array.isArray(errors) || !errors.length)) {
        return;
    }
    const sourceType = language.sourceType ?? parser.sourceType ?? (currentRule.startsWith('jsdoc/') ? 'module' : 'script');
    const fixture = {
        sourceRule: currentRule,
        target: currentTarget,
        group: currentGroup,
        origin: currentSource,
        code: value.code,
        options: value.options ?? [],
        settings: value.settings ?? defaults.settings ?? {},
        ecmaVersion: language.ecmaVersion ?? parser.ecmaVersion ?? (currentRule.startsWith('jsdoc/') ? 2022 : 5),
        env: value.env ?? defaults.env ?? {},
        ...(normalizeFilename(value.filename) !== undefined
            ? { filename: normalizeFilename(value.filename) }
            : {}),
        globals: language.globals ?? value.globals ?? defaults.globals ?? {},
        sourceType,
        lang:
            lang.includes('ts')
            || /typescript/u.test(parserName)
            || features.has('ts')
            || features.has('types')
            || (features.has('no-default') && features.has('no-babel'))
                ? currentRule.startsWith('react/')
                  || (parser.ecmaFeatures as Record<string, unknown>)?.jsx
                  || String(value.filename).endsWith('.tsx')
                    ? 'tsx'
                    : 'ts'
                : 'jsx',
        parserOptions: parser,
        supplementalRules: Object.assign(
            {},
            ...Array.from(value.code.matchAll(/\/\*\s*eslint\s+([^]*?)\*\//gu), (match) => DEPENDENCY_REQUIRE('levn').parse('Object', match[1], { Number: true })),
        ),
        errors: Array.isArray(errors)
            ? errors.map((error: unknown) => {
                if (typeof error === 'string') {
                    return { message: error };
                }
                if (error instanceof RegExp || Object.prototype.toString.call(error) === '[object RegExp]') {
                    return { messageRegex: { source: (error as RegExp).source, flags: (error as RegExp).flags } };
                }
                const descriptor = error as Record<string, unknown>;
                return Object.fromEntries(
                    Object.entries(descriptor).filter(([key]) => [
                        'messageId',
                        'message',
                        'data',
                        'line',
                        'column',
                        'endLine',
                        'endColumn',
                        'suggestions',
                    ].includes(key)),
                );
            })
            : [],
        ...(invalid && value.output !== undefined ? { output: value.output === value.code ? null : value.output } : {}),
    };
    const serialized = JSON.stringify(fixture, (_key, serializedValue) => {
        if (Object.prototype.toString.call(serializedValue) === '[object RegExp]') {
            return { regexSource: serializedValue.source, regexFlags: serializedValue.flags };
        }
        return serializedValue;
    });
    const id = createHash('sha256').update(serialized).digest('hex').slice(0, 16);
    capture.push({ id, ...JSON.parse(serialized) });
}

class CaptureTester {
    constructor(private defaults: Record<string, unknown> = {}) {}

    linter = { defineRule: () => {} };

    defineRule(): void {
        this.linter.defineRule();
    }

    run(_name: string, _rule: unknown, cases: Record<string, unknown[]>): void {
        const previous = [currentRule, currentTarget];
        if (_name !== currentRule && catalog.mappings.some((entry) => entry.source === _name)) {
            currentRule = _name;
            currentTarget = catalog.mappings.find((entry) => entry.source === _name)!.target!;
        }
        cases.valid?.flat(Infinity).forEach((item) => save(item, false, this.defaults));
        cases.invalid?.flat(Infinity).forEach((item) => save(item, true, this.defaults));
        [currentRule, currentTarget] = previous as [string, string];
    }
}

/**
 * Read source through a narrow fixture-capture module interface.
 * @param file - Upstream test module.
 * @returns Captured module exports.
 */
function evaluate(file: string): Record<string, unknown> {
    const module = { exports: {} as Record<string, unknown> };
    const source = readFileSync(file, 'utf8');
    const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node24' });
    const parserHelpers = new Proxy(
        { all: (items: unknown) => items },
        {
            get: (target, property) => {
                if (property === '__esModule') {
                    return false;
                }
                if (property === 'disableNewTS') {
                    return (item: unknown) => item;
                }
                if (property === 'skipDueToMultiErrorSorting') {
                    return false;
                }
                return ['all', 'valids', 'invalids'].includes(String(property))
                    ? target.all
                    : String(property).includes('TYPESCRIPT')
                        ? String(property).startsWith('@')
                            ? '@typescript-eslint/parser'
                            : 'typescript-eslint-parser'
                        : 'babel-eslint';
            },
        },
    );
    const captureRun = (cases: Record<string, unknown>) => {
        (cases.valid as unknown[])?.flat(Infinity).forEach((item) => save(item, false, {}, String(cases.lang ?? 'js')));
        (cases.invalid as unknown[])
            ?.flat(Infinity)
            .forEach((item) => save(item, true, {}, String(cases.lang ?? 'js')));
    };
    const requireFixture = (specifier: string): unknown => {
        if (specifier === 'eslint/package.json') {
            return { version: '8.57.1' };
        }
        if (specifier.endsWith('fixture-parser')) {
            return (...names: string[]) => `fixture-parser/${names.join('/')}`;
        }
        if (specifier.startsWith('fixture-parser/')) {
            return { fixtureParser: specifier.includes('typescript') ? 'typescript' : specifier };
        }
        if (specifier.includes('typescript-eslint') || specifier.includes('@babel/eslint-parser')) {
            return {
                parser: { fixtureParser: specifier },
                fixtureParser: specifier,
                parse: () => {},
                parseForESLint: () => {},
            };
        }
        if (specifier.endsWith('babel-eslint/package.json')) {
            return { version: '10.1.0' };
        }
        if (specifier.endsWith('/_utils')) {
            return { unIndent: dedent };
        }
        if (specifier.includes('flat-rule-tester')) {
            return class extends CaptureTester {
                constructor(defaults: Record<string, unknown> = {}) {
                    super({
                        ...defaults,
                        languageOptions: {
                            ecmaVersion: 2022,
                            sourceType: 'module',
                            ...(defaults.languageOptions as object),
                        },
                    });
                }
            };
        }
        if (specifier === 'eslint' || specifier.includes('rule-tester') || specifier.includes('ruleTester')) {
            return specifier === 'eslint'
                || (specifier.includes('/rule-tester') && !specifier.includes('lib/rule-tester'))
                ? { RuleTester: CaptureTester }
                : CaptureTester;
        }
        if (specifier === '#test') {
            return { run: captureRun, $: dedent };
        }
        if (specifier.includes('parsers')) {
            return parserHelpers;
        }
        if (specifier.includes('parserOptionsMapper')) {
            return (value: Record<string, unknown>) => ({
                ...value,
                parserOptions: { ecmaVersion: 2018, ecmaFeatures: { jsx: true }, ...(value.languageOptions as object) },
            });
        }
        if (specifier.includes('getRuleDefiner')) {
            return (tester: CaptureTester) => tester.linter;
        }
        if (specifier.includes('getESLintCoreRule')) {
            return (name: string) => builtinRules.get(name);
        }
        if (specifier === 'tape') {
            return () => {};
        }
        if (specifier.includes('ruleOptionsMapperFactory')) {
            return (ruleOptions: object[] = []) => (value: Record<string, unknown>) => ({
                ...value,
                options: [
                    Object.assign(
                        {},
                        ...((value.options ?? []) as object[]),
                        ...(Array.isArray(ruleOptions) ? ruleOptions : [ruleOptions]),
                    ),
                ],
            });
        }
        if (specifier.endsWith('src/index')) {
            return DEPENDENCY_REQUIRE('eslint-plugin-jsx-a11y');
        }
        if (specifier.includes('getSuggestion')) {
            return DEPENDENCY_REQUIRE('eslint-plugin-jsx-a11y/lib/util/getSuggestion');
        }
        if (specifier.includes('types/dist/ast-spec') || specifier === '@typescript-eslint/utils') {
            return { AST_NODE_TYPES: new Proxy({}, { get: (_target, key) => key }) };
        }
        if (specifier.includes('/rules/') || specifier.startsWith('rules/')) {
            return {};
        }
        if (specifier.includes('dedent')) {
            return dedent;
        }
        if (specifier.startsWith('.')) {
            const path = join(dirname(file), specifier);
            const resolved = [path, `${path}.js`, join(path, 'index.js')].find(existsSync);
            if (resolved) {
                return evaluate(resolved);
            }
        }
        try {
            return DEPENDENCY_REQUIRE(specifier);
        } catch {
            return createRequire(DEPENDENCY_REQUIRE.resolve('eslint-plugin-jsx-a11y'))(specifier);
        }
    };
    Object.assign(requireFixture, { resolve: (specifier: string) => specifier });
    const describe = (_name: string, callback: () => void) => callback();
    runInNewContext(
        code,
        {
            module,
            exports: module.exports,
            require: requireFixture,
            __dirname: dirname(file),
            __filename: file,
            describe,
            it: () => {},
            before: () => {},
            after: () => {},
            process: { version: process.version, versions: process.versions, env: {} },
            console: { log: () => {}, warn: () => {}, error: () => {} },
        },
        { filename: file, timeout: 5000 },
    );
    const assertions = module.exports.default as Record<string, unknown[]> | undefined;
    if (assertions?.valid || assertions?.invalid) {
        assertions.valid?.forEach((item) => save(item, false));
        assertions.invalid?.forEach((item) => save(item, true));
    }
    return module.exports;
}

for (const mapping of catalog.mappings.filter((entry) => entry.target && !entry.source.startsWith('ag/'))) {
    const name = mapping.source.split('/').at(-1) ?? '';
    const target = mapping.target ?? '';
    let files: string[] = [];
    if (!mapping.source.includes('/')) {
        if (target.startsWith('ag-style/')) {
            const styleName = target.split('/')[1] ?? name;
            const directory = join(SOURCE_ROOT, 'eslint-stylistic-5.10.0/packages/eslint-plugin/rules', styleName);
            files = (await readdir(directory).catch(() => []))
                .filter((file) => file.endsWith('.test.ts'))
                .map((file) => join(directory, file));
        } else {
            files = [join(SOURCE_ROOT, 'eslint-8.57.1/tests/lib/rules', `${name}.js`)];
        }
    } else if (mapping.source.startsWith('react/')) {
        files = [join(SOURCE_ROOT, 'eslint-plugin-react-7.37.5/tests/lib/rules', `${name}.js`)];
    } else if (mapping.source.startsWith('jsx-a11y/')) {
        files = [join(SOURCE_ROOT, 'eslint-plugin-jsx-a11y-6.10.2/__tests__/src/rules', `${name}-test.js`)];
    } else if (mapping.source.startsWith('jsdoc/')) {
        const camelName = name.replace(/-([a-z])/gu, (_all, letter: string) => letter.toUpperCase());
        files = [join(SOURCE_ROOT, 'eslint-plugin-jsdoc-64.3.6/test/rules/assertions', `${camelName}.js`)];
    }
    currentRule = mapping.source;
    currentTarget = target;
    currentGroup = /ag-style|ag-jsdoc/u.test(target) ? 'style' : 'native';
    for (const file of files) {
        currentSource = relative(SOURCE_ROOT, file).replaceAll('\\', '/');
        try {
            await evaluate(file);
        } catch (error: unknown) {
            failures[currentSource] = String((error as Error)?.stack ?? error);
        }
    }
}

const seen = new Set<string>();
const unique = capture.filter((item) => {
    const { origin, id, ...identity } = item;
    const key = JSON.stringify([
        identity.sourceRule,
        identity.code,
        identity.options,
        identity.settings,
        identity.globals,
        identity.sourceType,
        identity.lang,
        identity.ecmaVersion,
        identity.env,
        identity.filename,
        identity.parserOptions,
    ]);
    if (seen.has(key)) {
        return false;
    }
    seen.add(key);
    return true;
});
await writeFile('tests/fixtures/upstream.json', `${JSON.stringify(unique, null, 2)}\n`);
await writeFile(
    'tests/fixtures/import-report.json',
    `${JSON.stringify(
        {
            failures,
            exclusions,
            excludedCases,
            count: unique.length,
        },
        null,
        2,
    )}\n`,
);
process.stdout.write(
    `Extracted ${unique.length} unique scenarios; ${Object.keys(failures).length} source adapters need review.\n`,
);

if (Object.keys(failures).length) {
    throw new Error('Upstream fixture capture failed; see tests/fixtures/import-report.json.');
}
