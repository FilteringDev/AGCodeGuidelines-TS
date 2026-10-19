/**
 * @file Run consumer configuration groups through the Oxlint CLI and pair the results with ESLint's.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSync } from 'oxc-parser';

import type { OxlintConfig } from 'oxlint';

export interface OxlintDiagnostic {
    code?: string;
    filename: string;
    labels?: { span: { line: number; column: number } }[];
}

export interface EslintFinding {
    /** Consumer-relative file. */
    file: string;
    /** Reporting rule, or `null` for a fatal parse error. */
    ruleId: string | null;
    line: number;
    column: number;
}

export interface RuleComparison {
    matched: number;
    eslintOnly: string[];
    oxlintOnly: string[];
}

const DIRECTIVE = /^(\s*eslint-(?:disable|enable|disable-line|disable-next-line))(\s+)(.*?)(\s+--[\s\S]*|\s*)$/su;
const PARSE = 'parse';
/** Diagnostic plugin names that Oxlint prints differently from the configuration plugin name. */
const DISPLAY_PLUGINS: Readonly<Record<string, string>> = { 'react-hooks': 'react' };

export interface OxlintGroupRun {
    /** Built resource-aware lint CLI. */
    cli: string;
    /** Consumer directory; the CLI runs there and file arguments are relative to it. */
    consumer: string;
    /** Where the group configuration is written. */
    configPath: string;
    config: OxlintConfig;
    files: readonly string[];
    env?: NodeJS.ProcessEnv;
}

const GLOB_SPECIAL = /[\\*?[\]{}()!]/gu;

/**
 * Escape a literal path for use as an Oxlint glob pattern.
 * @param path - Literal path.
 * @returns A pattern that selects only that path.
 */
export function escapeGlob(path: string): string {
    return path.replace(GLOB_SPECIAL, '\\$&');
}

/**
 * Anchor consumer files as override patterns. Oxlint resolves relative override patterns against the
 * directory of the configuration file, so relative consumer paths in a configuration stored elsewhere
 * select nothing.
 * @param consumer - Consumer directory the files are relative to.
 * @param files - Consumer-relative file paths.
 * @returns One absolute, escaped pattern per file.
 */
export function fileScopes(consumer: string, files: readonly string[]): string[] {
    return files.map((file) => escapeGlob(resolve(consumer, file)));
}

/**
 * Resolve package plugin specifiers from this repository, so consumers need not install the plugins.
 * @param config - Group configuration.
 * @returns A copy whose object plugin specifiers are absolute paths.
 */
export function withResolvedPlugins(config: OxlintConfig): OxlintConfig {
    return {
        ...config,
        jsPlugins: config.jsPlugins?.map((provider) => (typeof provider === 'string' ? provider : {
            ...provider, specifier: fileURLToPath(import.meta.resolve(provider.specifier)),
        })),
    };
}

/**
 * Write a group configuration and lint the group's files with it.
 * @param run - CLI, consumer, configuration, and files of the group.
 * @returns Diagnostics with file names relative to the consumer.
 * @throws When the CLI produces no JSON report.
 */
export function runOxlintGroup(run: OxlintGroupRun): OxlintDiagnostic[] {
    mkdirSync(dirname(run.configPath), { recursive: true });
    writeFileSync(run.configPath, JSON.stringify(run.config));
    const argv = [run.cli, '-c', run.configPath, '--format', 'json', '--', ...run.files];
    const result = spawnSync(process.execPath, argv, {
        cwd: run.consumer,
        encoding: 'utf8',
        maxBuffer: 1024 ** 3,
        env: run.env ?? process.env,
    });
    if (!result.stdout.trimStart().startsWith('{')) {
        throw new Error(`Oxlint failed for ${run.configPath}: ${result.stdout.slice(0, 2000)}${result.stderr.slice(0, 2000)}`);
    }
    return (JSON.parse(result.stdout) as { diagnostics: OxlintDiagnostic[] }).diagnostics;
}

/**
 * Rename the rules listed in eslint-disable/enable comments to their Oxlint owners.
 * @param filename - File name; its extension selects the parser.
 * @param text - File contents.
 * @param targets - Translated target for each source rule of this file's configuration.
 * @returns The rewritten contents and the number of changed comments.
 */
export function translateSuppressions(
    filename: string,
    text: string,
    targets: ReadonlyMap<string, string>,
): { text: string; changed: number } {
    let output = '';
    let last = 0;
    let changed = 0;
    for (const comment of parseSync(filename, text).comments) {
        const match = DIRECTIVE.exec(comment.value);
        if (!match?.[3]) {
            continue;
        }
        const listed = match[3].split(',').map((rule) => rule.trim());
        if (!listed.some((rule) => targets.has(rule))) {
            continue;
        }
        const rules = listed.map((rule) => targets.get(rule) ?? rule).join(', ');
        const start = comment.start + 2;
        output += `${text.slice(last, start)}${match[1]}${match[2]}${rules}${match[4]}`;
        last = start + comment.value.length;
        changed += 1;
    }
    return changed ? { text: output + text.slice(last), changed } : { text, changed };
}

/**
 * Turn eslint-disable/enable comments into plain comments without moving any text, so a comparison
 * against ESLint's `allowInlineConfig: false` results covers suppressed code with unchanged locations.
 * @param filename - File name; its extension selects the parser.
 * @param text - File contents.
 * @returns The contents with inert directives and the number of changed comments.
 */
export function disableSuppressions(filename: string, text: string): { text: string; changed: number } {
    let output = text;
    let changed = 0;
    for (const comment of parseSync(filename, text).comments) {
        const match = DIRECTIVE.exec(comment.value);
        if (match) {
            // Replace the hyphen of `eslint-` in place; comment offsets are UTF-16 indices into the text.
            const hyphen = comment.start + 2 + match[1]!.indexOf('eslint-') + 'eslint'.length;
            output = `${output.slice(0, hyphen)}_${output.slice(hyphen + 1)}`;
            changed += 1;
        }
    }
    return { text: output, changed };
}

/**
 * Read the translated rule of an Oxlint diagnostic.
 * @param diagnostic - Oxlint diagnostic.
 * @returns `plugin/rule` with the configuration plugin name, or `parse` for diagnostics without a rule.
 */
function diagnosticTarget(diagnostic: OxlintDiagnostic): string {
    const match = /^([^()]+)\((.+)\)$/u.exec(diagnostic.code ?? '');
    if (!match) {
        return PARSE;
    }
    // Oxlint configures the hooks rules under `react/` but reports them as `react-hooks(...)`.
    return `${DISPLAY_PLUGINS[match[1]!] ?? match[1]}/${match[2]}`;
}

/**
 * Drop the ESLint findings of rules that Oxlint does not own in the finding's own configuration group,
 * such as fallback or compiler-owned rules. Ownership is decided per group, so a rule excluded in one
 * group is still compared in the others.
 * @param eslint - ESLint findings with consumer-relative file names.
 * @param excludedByFile - Rules excluded from the comparison in each file's group.
 * @returns Findings that Oxlint is expected to reproduce. Findings without a rule are kept.
 */
export function comparableFindings(
    eslint: readonly EslintFinding[],
    excludedByFile: ReadonlyMap<string, ReadonlySet<string>>,
): EslintFinding[] {
    return eslint.filter(({ file, ruleId }) => !ruleId || !excludedByFile.get(file)?.has(ruleId));
}

/**
 * Pair ESLint findings with Oxlint diagnostics by location and translated rule. Each file is matched
 * through the targets of its own configuration group, because groups may translate a source rule to
 * different targets.
 * @param eslint - ESLint findings of the compared rules.
 * @param oxlint - Oxlint diagnostics with consumer-relative file names.
 * @param targetsByFile - Source-to-target rule map of each file's group.
 * @returns Matched and unmatched findings per source rule.
 */
export function compareFindings(
    eslint: readonly EslintFinding[],
    oxlint: readonly OxlintDiagnostic[],
    targetsByFile: ReadonlyMap<string, ReadonlyMap<string, string>>,
): Record<string, RuleComparison> {
    const pending = new Map<string, number>();
    const unmatched = oxlint.map((diagnostic) => {
        const span = diagnostic.labels?.[0]?.span;
        const target = diagnosticTarget(diagnostic);
        const location = `${diagnostic.filename}:${span?.line}:${span?.column}`;
        const key = `${target} ${location}`;
        pending.set(key, (pending.get(key) ?? 0) + 1);
        return {
            file: diagnostic.filename, target, location, key,
        };
    });
    const rules: Record<string, RuleComparison> = {};
    const entry = (rule: string): RuleComparison => {
        rules[rule] ??= { matched: 0, eslintOnly: [], oxlintOnly: [] };
        return rules[rule];
    };
    for (const finding of eslint) {
        const source = finding.ruleId ?? PARSE;
        const location = `${finding.file}:${finding.line}:${finding.column}`;
        const key = `${targetsByFile.get(finding.file)?.get(source) ?? source} ${location}`;
        const count = pending.get(key) ?? 0;
        if (count) {
            pending.set(key, count - 1);
            entry(source).matched += 1;
        } else {
            entry(source).eslintOnly.push(location);
        }
    }
    for (const diagnostic of unmatched) {
        const count = pending.get(diagnostic.key) ?? 0;
        if (count) {
            pending.set(diagnostic.key, count - 1);
            const targets = targetsByFile.get(diagnostic.file) ?? new Map<string, string>();
            const source = [...targets].find(([, target]) => target === diagnostic.target)?.[0];
            entry(source ?? diagnostic.target).oxlintOnly.push(diagnostic.location);
        }
    }
    return rules;
}
