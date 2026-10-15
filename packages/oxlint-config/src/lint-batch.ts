/** @file Bound literal file batches by actual command-line storage rather than file count. */

export interface LintBatchOptions {
    platform?: string;
    fixedArgs?: readonly string[];
    environment?: Readonly<Record<string, string | undefined>>;
    maxBytes?: number;
}

/**
 * Partition files without shell strings, dropped paths or arbitrary hundred-file chunks.
 * @param files - Literal filenames in their original order.
 * @param options - Platform, fixed argv, inherited environment and optional conservative byte ceiling.
 * @returns Argument-length-safe batches, with no empty invocation for an empty file set.
 */
export function batchLintFiles(files: readonly string[], options: LintBatchOptions = {}): string[][] {
    const windows = (options.platform ?? process.platform) === 'win32';
    const maxBytes = options.maxBytes ?? (windows ? 48 * 1024 : 96 * 1024);
    const size = (value: string) => (windows ? (value.length + 1) * 4 : Buffer.byteLength(value, 'utf8') + 1);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
        throw new TypeError('Command-line byte ceiling must be a positive integer.');
    }
    const fixed = (options.fixedArgs ?? []).reduce((sum, argument) => sum + size(argument), 0);
    const environment = Object.entries(options.environment ?? process.env)
        .reduce((sum, [name, value]) => sum + size(`${name}=${value ?? ''}`), 0);
    const capacity = maxBytes - fixed - environment;
    const batches: string[][] = [];
    let batch: string[] = [];
    let used = 0;
    for (const file of files) {
        if (file.includes('\0')) {
            throw new TypeError('A lint filename cannot contain NUL.');
        }
        const bytes = size(file);
        if (bytes > capacity) {
            throw new RangeError('A filename and the inherited environment exceed the safe argv byte ceiling.');
        }
        if (used + bytes > capacity && batch.length) {
            batches.push(batch);
            batch = [];
            used = 0;
        }
        batch.push(file);
        used += bytes;
    }
    if (batch.length) {
        batches.push(batch);
    }
    return batches;
}
