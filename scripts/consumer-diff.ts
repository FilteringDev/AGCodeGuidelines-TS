/**
 * @file Compare a consumer's ESLint results with its Oxlint compatibility translation, rule by rule.
 *
 * Usage: pnpm exec tsx scripts/consumer-diff.ts <consumer> <report.json> [--ext .js,.ts]
 *        [--rewrite-suppressions | --no-inline-config] [--type-aware] [targets...]
 * The consumer's own ESLint runs in a child process from its directory; no ESLint is loaded here.
 * Oxlint runs with eslint-disable/enable comments translated to the target rule names, as a migration
 * leaves them; the comments are restored afterwards unless --rewrite-suppressions keeps them.
 * --no-inline-config ignores suppression comments on both sides, so suppressed code is compared too.
 */
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import {
    dirname,
    join,
    relative,
    resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCompatibilityConfigGroups } from '../packages/oxlint-config/src/index';
import cacheRoot from './cache-root';
import { collectEslint, languageOf, typescriptEslintMajor } from './consumer-eslint';
import {
    comparableFindings,
    compareFindings,
    disableSuppressions,
    fileScopes,
    runOxlintGroup,
    translateSuppressions,
    withResolvedPlugins,
} from './consumer-oxlint';

import type { EslintFile } from './consumer-eslint';
import type { OxlintDiagnostic } from './consumer-oxlint';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LINT_CLI = join(ROOT, 'packages/oxlint-config/dist/lint-cli.js');
// Consumers being evaluated need not have installed the typed service yet.
const TSGOLINT = join(dirname(fileURLToPath(import.meta.resolve('oxlint-tsgolint/package.json'))), 'bin/tsgolint.js');

const [consumerArgument, reportArgument, ...rest] = process.argv.slice(2);
if (!consumerArgument || !reportArgument) {
    throw new Error('Usage: consumer-diff.ts <consumer> <report.json> [--ext .js,.ts] [targets...]');
}
const consumer = resolve(consumerArgument);
const FLAGS = ['--rewrite-suppressions', '--no-inline-config', '--type-aware'];
const rewrite = rest.includes('--rewrite-suppressions');
const inlineConfig = !rest.includes('--no-inline-config');
const typeAware = rest.includes('--type-aware');
if (rewrite && !inlineConfig) {
    throw new Error('--rewrite-suppressions needs the suppression comments that --no-inline-config ignores.');
}
const options = rest.filter((argument) => !FLAGS.includes(argument));
const extIndex = options.indexOf('--ext');
const extensions = extIndex === -1 ? ['.js', '.jsx', '.ts', '.tsx'] : options[extIndex + 1]!.split(',');
const targets = options.filter((_, index) => extIndex === -1 || (index !== extIndex && index !== extIndex + 1));
const files = collectEslint(consumer, extensions, targets, inlineConfig);
const major = typescriptEslintMajor(consumer);
const versionSettings = major === undefined ? {} : { agTypeScriptEslint: major };

interface ConsumerGroup {
    /** Consumer-relative files sharing one effective configuration. */
    files: string[];
    config: EslintFile['config'];
    language: 'javascript' | 'typescript';
}

const groups = new Map<string, ConsumerGroup>();
for (const file of files) {
    const language = languageOf(file.filePath);
    const key = JSON.stringify([language, file.config]);
    const group = groups.get(key) ?? { files: [], config: file.config, language };
    group.files.push(relative(consumer, file.filePath));
    groups.set(key, group);
}

mkdirSync(cacheRoot('consumer-diff'), { recursive: true });
const directory = mkdtempSync(join(cacheRoot('consumer-diff'), 'run-'));
const fallback: Record<string, { reason: string; files: number }> = {};
const compiler: Record<string, { reason: string; files: number }> = {};
const targetsByFile = new Map<string, ReadonlyMap<string, string>>();
// Fallback and compiler ownership is decided per group, so it only excludes ESLint findings in that group's files.
const excludedByFile = new Map<string, ReadonlySet<string>>();
const originals = new Map<string, string>();
const oxlint: OxlintDiagnostic[] = [];
let rewritten = 0;

/**
 * Translate or, without inline configuration, neutralize the suppression comments of a group's files
 * in place, remembering the original contents.
 * @param groupFiles - Consumer-relative files of the group.
 * @param groupTargets - Translated target for each source rule of the group.
 * @returns Number of changed comments.
 */
function translateGroupSuppressions(groupFiles: readonly string[], groupTargets: ReadonlyMap<string, string>): number {
    let changed = 0;
    for (const file of groupFiles) {
        const filename = join(consumer, file);
        const original = readFileSync(filename, 'utf8');
        const translated = inlineConfig
            ? translateSuppressions(filename, original, groupTargets)
            : disableSuppressions(filename, original);
        if (translated.changed) {
            originals.set(filename, original);
            writeFileSync(filename, translated.text);
            changed += translated.changed;
        }
    }
    return changed;
}

/**
 * Translate, lint, and compare one configuration group.
 * @param group - Files and effective ESLint configuration shared by the group.
 * @param index - Group number used for its configuration file name.
 */
function lintGroup(group: ConsumerGroup, index: number): void {
    const [result] = createCompatibilityConfigGroups([{
        id: `group-${index}`,
        language: group.language,
        typeAware,
        rules: group.config.rules,
        context: {
            files: fileScopes(consumer, group.files),
            env: group.config.env,
            globals: group.config.globals,
            settings: { ...group.config.settings, ...versionSettings },
            parserOptions: group.config.parserOptions,
        },
    }]);
    const excluded = new Set<string>();
    for (const decision of result!.fallback) {
        const owners = decision.disposition === 'compiler' ? compiler : fallback;
        const entry = owners[decision.source] ?? { reason: decision.reason ?? decision.disposition, files: 0 };
        entry.files += group.files.length;
        owners[decision.source] = entry;
        excluded.add(decision.source);
    }
    const groupTargets = new Map<string, string>();
    for (const decision of result!.ownership) {
        if (decision.status !== 'unsupported' && decision.target) {
            groupTargets.set(decision.source, decision.target);
        }
    }
    for (const file of group.files) {
        targetsByFile.set(file, groupTargets);
        excludedByFile.set(file, excluded);
    }
    rewritten += translateGroupSuppressions(group.files, groupTargets);
    const diagnostics = runOxlintGroup({
        cli: LINT_CLI,
        consumer,
        configPath: join(directory, `group-${index}.json`),
        config: withResolvedPlugins(result!.config),
        files: group.files,
        env: { ...process.env, OXLINT_TSGOLINT_PATH: process.env.OXLINT_TSGOLINT_PATH ?? TSGOLINT },
    });
    const owned = new Set(group.files);
    const translated = files.filter((file) => owned.has(relative(consumer, file.filePath)))
        .flatMap((file) => file.messages)
        .filter((message) => message.ruleId && groupTargets.has(message.ruleId)).length;
    if (translated && !diagnostics.length) {
        // A configuration whose file scopes select nothing reports nothing and hides every difference.
        process.stderr.write(`Warning: group ${index} has ${translated} translated ESLint findings but no Oxlint `
            + 'diagnostics; check that its file scopes select its files.\n');
    }
    oxlint.push(...diagnostics);
}

try {
    [...groups.values()].forEach(lintGroup);
} finally {
    if (!rewrite) {
        for (const [filename, original] of originals) {
            writeFileSync(filename, original);
        }
    }
}

const findings = comparableFindings(files.flatMap((file) => file.messages.map((message) => ({
    file: relative(consumer, file.filePath), ruleId: message.ruleId, line: message.line, column: message.column,
}))), excludedByFile);
const rules = compareFindings(findings, oxlint, targetsByFile);
const differing = Object.entries(rules).filter(([, value]) => value.eslintOnly.length || value.oxlintOnly.length);
writeFileSync(resolve(reportArgument), `${JSON.stringify({
    files: files.length, groups: groups.size, fallback, compiler, rules,
}, null, 2)}\n`);
process.stdout.write(`${files.length} files, ${groups.size} groups, ${Object.keys(fallback).length} fallback rules, `
    + `${Object.keys(compiler).length} compiler-owned rules, `
    + `${differing.length} rules with differences, ${rewritten} suppression comments `
    + `${rewrite ? 'rewritten' : 'translated for the run'}\n`);
for (const [rule, value] of differing.sort(([, left], [, right]) => (right.eslintOnly.length + right.oxlintOnly.length)
    - (left.eslintOnly.length + left.oxlintOnly.length))) {
    process.stdout.write(`${value.matched}\t${value.eslintOnly.length}\t${value.oxlintOnly.length}\t${rule}\n`);
}
