/** @file Parse execution options without leaking them into individual lint engines. */
import { parseMaxMemory } from './memory-budget.js';

export interface LintArguments {
    maxMemMiB?: number;
    profile?: string;
    command?: string;
    args: string[];
    help: boolean;
}

/**
 * Preserve engine arguments while consuming only known wrapper options.
 * @param argumentsList - Arguments forwarded by pnpm or supplied directly.
 * @returns Wrapper settings and literal backend argv.
 */
export function parseLintArguments(argumentsList: readonly string[]): LintArguments {
    const result: LintArguments = { args: [], help: false };
    const seen = new Set<string>();
    let forwardingSeparator = false;
    for (let index = 0; index < argumentsList.length; index += 1) {
        const argument = argumentsList[index]!;
        if (argument === '--') {
            const next = argumentsList[index + 1] ?? '';
            const nextName = next.split('=')[0]!;
            if (!forwardingSeparator && !seen.has(nextName)
                && /^(?:--max-mem|--profile|--command|--help)(?:=|$)/u.test(next)) {
                forwardingSeparator = true;
                continue;
            }
            result.args.push(...argumentsList.slice(index));
            break;
        }
        const equals = argument.indexOf('=');
        const name = equals === -1 ? argument : argument.slice(0, equals);
        if (!['--max-mem', '--profile', '--command', '--help'].includes(name)) {
            result.args.push(argument);
            continue;
        }
        if (seen.has(name)) {
            throw new TypeError(`Duplicate execution option: ${name}`);
        }
        seen.add(name);
        if (name === '--help') {
            if (equals !== -1) {
                throw new TypeError('--help does not take a value.');
            }
            result.help = true;
            continue;
        }
        if (equals === -1) {
            index += 1;
        }
        const value = equals === -1 ? argumentsList[index] : argument.slice(equals + 1);
        if (!value || value.startsWith('--')) {
            throw new TypeError(`Missing value for ${name}.`);
        }
        if (name === '--max-mem') {
            result.maxMemMiB = parseMaxMemory(value);
        } else if (name === '--profile') {
            result.profile = value;
        } else {
            result.command = value;
        }
    }
    return result;
}
