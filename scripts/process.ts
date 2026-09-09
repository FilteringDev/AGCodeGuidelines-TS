/** @file Invoke pnpm consistently from its Node or native entry point on every CI platform. */
import { execFileSync } from 'node:child_process';

import type { ExecFileSyncOptions } from 'node:child_process';

/**
 * Execute literal pnpm arguments, preserving the invoking package manager.
 * @param args - Literal package-manager arguments.
 * @param options - Working directory and subprocess output policy.
 */
export function execPnpm(args: string[], options: ExecFileSyncOptions = {}): void {
    const executable = process.env.npm_execpath ?? 'pnpm';
    if (/\.[cm]?js$/iu.test(executable)) {
        execFileSync(process.execPath, [executable, ...args], options);
    } else {
        execFileSync(executable, args, options);
    }
}
