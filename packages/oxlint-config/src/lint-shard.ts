/** @file Split one Oxlint invocation across processes, each with its own JavaScript-plugin thread. */

export type ShardFormat = 'json' | 'unix';

export interface ShardPlan {
    format: ShardFormat;
    quiet: boolean;
    silent: boolean;
    denyWarnings: boolean;
    maxWarnings?: number;
    /** Options repeated for discovery and every shard, without targets or report options. */
    options: string[];
    /** Original targets; empty keeps Oxlint's working-directory default. */
    targets: string[];
}

export interface ShardDiagnostic {
    filename?: string;
    severity?: string;
    message?: string;
    code?: string;
    labels?: { span?: { offset?: number; line?: number; column?: number } }[];
    [key: string]: unknown;
}

export interface ShardOutput {
    diagnostics: ShardDiagnostic[];
    number_of_files: number;
    number_of_rules: number;
}

const VALUE_OPTIONS = new Set([
    '-c',
    '--config',
    '--tsconfig',
    '-A',
    '--allow',
    '-W',
    '--warn',
    '-D',
    '--deny',
    '--ignore-path',
    '--ignore-pattern',
    '--report-unused-disable-directives-severity',
]);
const FLAG_OPTIONS = new Set([
    '--disable-unicorn-plugin',
    '--disable-oxc-plugin',
    '--disable-typescript-plugin',
    '--import-plugin',
    '--react-plugin',
    '--jsdoc-plugin',
    '--jest-plugin',
    '--vitest-plugin',
    '--jsx-a11y-plugin',
    '--nextjs-plugin',
    '--react-perf-plugin',
    '--promise-plugin',
    '--node-plugin',
    '--vue-plugin',
    '--no-ignore',
    '--report-unused-disable-directives',
    '--disable-nested-config',
    '--no-error-on-unmatched-pattern',
]);

/**
 * Accept only report formats and options whose merged result is reproduced exactly.
 * @param args - Oxlint arguments after wrapper options were removed.
 * @returns A shard plan, or undefined when the invocation must stay in one process.
 */
export function planSharding(args: readonly string[]): ShardPlan | undefined {
    const plan: ShardPlan = {
        format: 'unix',
        quiet: false,
        silent: false,
        denyWarnings: false,
        options: [],
        targets: [],
    };
    let format: string | undefined;
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index]!;
        if (argument === '--') {
            plan.targets.push(...args.slice(index + 1));
            break;
        }
        if (!argument.startsWith('-') || argument === '-') {
            plan.targets.push(argument);
            continue;
        }
        const equals = argument.startsWith('--') ? argument.indexOf('=') : -1;
        const name = equals === -1 ? argument : argument.slice(0, equals);
        const inline = equals === -1 ? undefined : argument.slice(equals + 1);
        if (FLAG_OPTIONS.has(name) && inline === undefined) {
            plan.options.push(name);
        } else if (['--quiet', '--silent', '--deny-warnings'].includes(name) && inline === undefined) {
            plan.quiet ||= name === '--quiet';
            plan.silent ||= name === '--silent';
            plan.denyWarnings ||= name === '--deny-warnings';
        } else if (VALUE_OPTIONS.has(name) || ['-f', '--format', '--max-warnings', '--threads'].includes(name)) {
            const value = inline ?? args[index + 1];
            if (value === undefined) {
                return undefined;
            }
            if (inline === undefined) {
                index += 1;
            }
            if (name === '-f' || name === '--format') {
                format = value;
            } else if (name === '--max-warnings') {
                if (!/^\d+$/u.test(value)) {
                    return undefined;
                }
                plan.maxWarnings = Number(value);
            } else if (name !== '--threads') {
                plan.options.push(name, value);
            }
        } else {
            return undefined;
        }
    }
    if (format !== 'json' && format !== 'unix') {
        return undefined;
    }
    plan.format = format;
    return plan;
}

/**
 * Balance files by size, largest first, onto the currently lightest shard.
 * @param files - Discovered files in Oxlint's order.
 * @param sizes - Byte size of each file.
 * @param count - Number of shards.
 * @returns Nonempty shards keeping the discovered order within each shard.
 */
export function assignShards(files: readonly string[], sizes: readonly number[], count: number): string[][] {
    const loads = Array.from({ length: count }, () => ({ bytes: 0, indices: [] as number[] }));
    const order = files.map((_, index) => index).sort((left, right) => sizes[right]! - sizes[left]! || left - right);
    for (const index of order) {
        const lightest = loads.reduce((best, load) => (load.bytes < best.bytes ? load : best));
        lightest.bytes += sizes[index]!;
        lightest.indices.push(index);
    }
    return loads.filter((load) => load.indices.length)
        .map((load) => load.indices.sort((left, right) => left - right).map((index) => files[index]!));
}

/**
 * Serialize with Oxlint's JSON reporter spacing.
 * @param value - Parsed report value.
 * @returns Text equal to Oxlint's serialization of the same value.
 */
function oxlintJson(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(oxlintJson).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${oxlintJson(item)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

/**
 * Merge shard reports and reproduce one Oxlint report and exit status.
 * @param plan - Report options of the original invocation.
 * @param outputs - Parsed JSON reports of every shard.
 * @param elapsedSeconds - Wall time of the sharded lint.
 * @returns Report text and Oxlint's lint exit status.
 */
export function renderShards(
    plan: ShardPlan,
    outputs: readonly ShardOutput[],
    elapsedSeconds: number,
): { text: string; status: number } {
    const all = outputs.flatMap((output) => output.diagnostics)
        .map((diagnostic, index) => ({ diagnostic, index }))
        .sort((left, right) => (left.diagnostic.filename ?? '').localeCompare(right.diagnostic.filename ?? '')
            || (left.diagnostic.labels?.[0]?.span?.offset ?? 0) - (right.diagnostic.labels?.[0]?.span?.offset ?? 0)
            || left.index - right.index)
        .map(({ diagnostic }) => diagnostic);
    const errors = all.filter((diagnostic) => diagnostic.severity === 'error').length;
    const warnings = all.filter((diagnostic) => diagnostic.severity === 'warning').length;
    const status = errors > 0
        || (plan.denyWarnings && warnings > 0)
        || (plan.maxWarnings !== undefined && warnings > plan.maxWarnings) ? 1 : 0;
    if (plan.silent) {
        return { text: '', status };
    }
    const shown = plan.quiet ? all.filter((diagnostic) => diagnostic.severity !== 'warning') : all;
    if (plan.format === 'json') {
        const files = outputs.reduce((sum, output) => sum + output.number_of_files, 0);
        const rules = Math.max(0, ...outputs.map((output) => output.number_of_rules));
        const indent = ' '.repeat(14);
        return {
            text: `{ "diagnostics": [${shown.map(oxlintJson).join(',\n')}],\n`
                + `${indent}"number_of_files": ${files},\n`
                + `${indent}"number_of_rules": ${rules},\n`
                + `${indent}"threads_count": ${outputs.length},\n`
                + `${indent}"start_time": ${elapsedSeconds}\n`
                + `${' '.repeat(12)}}\n${' '.repeat(12)}`,
            status,
        };
    }
    if (!shown.length) {
        return { text: '', status };
    }
    const lines = shown.map((diagnostic) => {
        const span = diagnostic.labels?.[0]?.span;
        const severity = (diagnostic.severity ?? '').replace(/^./u, (first) => first.toUpperCase());
        const code = diagnostic.code ? `/${diagnostic.code}` : '';
        return `${diagnostic.filename}:${span?.line ?? 0}:${span?.column ?? 0}: ${diagnostic.message} [${severity}${code}]\n`;
    });
    return {
        text: `${lines.join('')}\n${shown.length} problem${shown.length === 1 ? '' : 's'}\n`,
        status,
    };
}
