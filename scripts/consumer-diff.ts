/**
 * @file Compare a consumer's ESLint results with its Oxlint compatibility translation, rule by rule.
 *
 * Usage: pnpm exec tsx scripts/consumer-diff.ts <consumer> <report.json> [--ext .js,.ts]
 *        [--rewrite-suppressions] [--type-aware] [targets...]
 * The consumer's own ESLint runs in a child process from its directory; no ESLint is loaded here.
 * --rewrite-suppressions migrates eslint-disable/enable comments in place to the translated rule names.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
    dirname,
    join,
    relative,
    resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSync } from 'oxc-parser';
import { createCompatibilityConfigGroups } from '../packages/oxlint-config/src/index';

import type { RuleMap } from '../packages/rule-catalog/src/index';

interface EslintFile {
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

interface OxlintDiagnostic {
    code?: string;
    filename: string;
    labels?: { span: { line: number; column: number } }[];
}

const COLLECT = `
import { ESLint } from 'eslint';
const [extensions, ...targets] = JSON.parse(process.argv[1]);
const eslint = new ESLint({ cache: false, extensions });
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
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LINT_CLI = join(ROOT, 'packages/oxlint-config/dist/lint-cli.js');
// Consumers being evaluated need not have installed the typed service yet.
const TSGOLINT = join(dirname(fileURLToPath(import.meta.resolve('oxlint-tsgolint/package.json'))), 'bin/tsgolint.js');
const DIRECTIVE = /^(\s*eslint-(?:disable|enable|disable-line|disable-next-line))(\s+)(.*?)(\s+--[\s\S]*|\s*)$/su;

/**
 * Rename the rules listed in eslint-disable/enable comments to their Oxlint owners.
 * @param filename - File whose comments are rewritten in place.
 * @param targets - Translated target for each source rule of this file's configuration.
 * @returns Number of changed comments.
 */
function rewriteSuppressions(filename: string, targets: ReadonlyMap<string, string>): number {
    const text = readFileSync(filename, 'utf8');
    let output = '';
    let last = 0;
    let changed = 0;
    for (const comment of parseSync(filename, text).comments) {
        const match = DIRECTIVE.exec(comment.value);
        if (!match?.[3]) {
            continue;
        }
        const rules = match[3].split(',').map((rule) => rule.trim()).map((rule) => targets.get(rule) ?? rule).join(', ');
        if (rules === match[3]) {
            continue;
        }
        const start = comment.start + 2;
        output += `${text.slice(last, start)}${match[1]}${match[2]}${rules}${match[4]}`;
        last = start + comment.value.length;
        changed += 1;
    }
    if (changed) {
        writeFileSync(filename, output + text.slice(last));
    }
    return changed;
}

const [consumerArgument, reportArgument, ...rest] = process.argv.slice(2);
if (!consumerArgument || !reportArgument) {
    throw new Error('Usage: consumer-diff.ts <consumer> <report.json> [--ext .js,.ts] [targets...]');
}
const consumer = resolve(consumerArgument);
const rewrite = rest.includes('--rewrite-suppressions');
const typeAware = rest.includes('--type-aware');
const options = rest.filter((argument) => !['--rewrite-suppressions', '--type-aware'].includes(argument));
const extIndex = options.indexOf('--ext');
const extensions = extIndex === -1 ? ['.js', '.jsx', '.ts', '.tsx'] : options[extIndex + 1]!.split(',');
const targets = options.filter((_, index) => extIndex === -1 || (index !== extIndex && index !== extIndex + 1));
const collected = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', COLLECT, JSON.stringify([extensions, ...(targets.length ? targets : ['.'])])],
    { cwd: consumer, encoding: 'utf8', maxBuffer: 1024 ** 3 },
);
if (collected.status !== 0) {
    throw new Error(`Consumer ESLint failed: ${collected.stderr.slice(0, 4000)}`);
}
const files = JSON.parse(collected.stdout) as EslintFile[];

const groups = new Map<string, { files: string[]; config: EslintFile['config']; language: 'javascript' | 'typescript' }>();
for (const file of files) {
    const language = /\.[cm]?tsx?$/u.test(file.filePath) ? 'typescript' : 'javascript';
    const key = JSON.stringify([language, file.config]);
    const group = groups.get(key) ?? { files: [], config: file.config, language };
    group.files.push(relative(consumer, file.filePath));
    groups.set(key, group);
}

const directory = join(consumer, '.cache/consumer-diff');
mkdirSync(directory, { recursive: true });
const fallback: Record<string, { reason: string; files: number }> = {};
const compiler: Record<string, { reason: string; files: number }> = {};
const targetsBySource = new Map<string, string>();
const oxlint: OxlintDiagnostic[] = [];
let rewritten = 0;
[...groups.values()].forEach((group, index) => {
    const [result] = createCompatibilityConfigGroups([{
        id: `group-${index}`,
        language: group.language,
        typeAware,
        rules: group.config.rules,
        context: {
            files: group.files,
            env: group.config.env,
            globals: group.config.globals,
            settings: group.config.settings,
            parserOptions: group.config.parserOptions,
        },
    }]);
    for (const decision of result!.fallback) {
        const owners = decision.disposition === 'compiler' ? compiler : fallback;
        const entry = owners[decision.source] ?? { reason: decision.reason ?? decision.disposition, files: 0 };
        entry.files += group.files.length;
        owners[decision.source] = entry;
    }
    const groupTargets = new Map<string, string>();
    for (const decision of result!.ownership) {
        if (decision.status !== 'unsupported' && decision.target) {
            targetsBySource.set(decision.source, decision.target);
            groupTargets.set(decision.source, decision.target);
        }
    }
    if (rewrite) {
        rewritten += group.files.reduce(
            (sum, file) => sum + rewriteSuppressions(join(consumer, file), groupTargets),
            0,
        );
    }
    const config = {
        ...result!.config,
        jsPlugins: result!.config.jsPlugins?.map((provider) => (typeof provider === 'string' ? provider : {
            ...provider, specifier: fileURLToPath(import.meta.resolve(provider.specifier)),
        })),
    };
    const configPath = join(directory, `group-${index}.json`);
    writeFileSync(configPath, JSON.stringify(config));
    const run = spawnSync(process.execPath, [LINT_CLI, '-c', configPath, '--format', 'json', '--', ...group.files], {
        cwd: consumer,
        encoding: 'utf8',
        maxBuffer: 1024 ** 3,
        env: { ...process.env, OXLINT_TSGOLINT_PATH: process.env.OXLINT_TSGOLINT_PATH ?? TSGOLINT },
    });
    if (!run.stdout.trimStart().startsWith('{')) {
        throw new Error(`Oxlint failed for group ${index}: ${run.stdout.slice(0, 2000)}${run.stderr.slice(0, 2000)}`);
    }
    oxlint.push(...(JSON.parse(run.stdout) as { diagnostics: OxlintDiagnostic[] }).diagnostics);
});

const pending = new Map<string, string[]>();
for (const diagnostic of oxlint) {
    const match = /^([^()]+)\((.+)\)$/u.exec(diagnostic.code ?? '');
    const target = match ? `${match[1]}/${match[2]}` : 'parse';
    const span = diagnostic.labels?.[0]?.span;
    pending.set(target, [...pending.get(target) ?? [], `${diagnostic.filename}:${span?.line}:${span?.column}`]);
}
const rules: Record<string, { matched: number; eslintOnly: string[]; oxlintOnly: string[] }> = {};
const entry = (rule: string) => {
    rules[rule] ??= { matched: 0, eslintOnly: [], oxlintOnly: [] };
    return rules[rule];
};
for (const file of files) {
    for (const message of file.messages) {
        const source = message.ruleId ?? 'parse';
        if (Object.hasOwn(fallback, source) || Object.hasOwn(compiler, source)) {
            continue;
        }
        const location = `${relative(consumer, file.filePath)}:${message.line}:${message.column}`;
        const candidates = pending.get(targetsBySource.get(source) ?? source) ?? [];
        const index = candidates.indexOf(location);
        if (index === -1) {
            entry(source).eslintOnly.push(location);
        } else {
            candidates.splice(index, 1);
            entry(source).matched += 1;
        }
    }
}
const sourcesByTarget = new Map(Array.from(targetsBySource, ([source, target]) => [target, source]));
for (const [target, locations] of pending) {
    entry(sourcesByTarget.get(target) ?? target).oxlintOnly.push(...locations);
}
const differing = Object.entries(rules).filter(([, value]) => value.eslintOnly.length || value.oxlintOnly.length);
writeFileSync(resolve(reportArgument), `${JSON.stringify({
    files: files.length, groups: groups.size, fallback, compiler, rules,
}, null, 2)}\n`);
process.stdout.write(`${files.length} files, ${groups.size} groups, ${Object.keys(fallback).length} fallback rules, `
    + `${Object.keys(compiler).length} compiler-owned rules, `
    + `${differing.length} rules with differences${rewrite ? `, ${rewritten} suppression comments rewritten` : ''}\n`);
for (const [rule, value] of differing.sort(([, left], [, right]) => (right.eslintOnly.length + right.oxlintOnly.length)
    - (left.eslintOnly.length + left.oxlintOnly.length))) {
    process.stdout.write(`${value.matched}\t${value.eslintOnly.length}\t${value.oxlintOnly.length}\t${rule}\n`);
}
