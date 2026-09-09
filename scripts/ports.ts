/** @file Apply reviewed source transformations without accepting ambiguous upstream changes. */
export interface SourcePatch {
    before: string;
    after: string;
}

/**
 * Apply exact replacements in their reviewed order.
 * @param source - Original source text.
 * @param patches - Reviewed transformations.
 * @param target - Output identity used in diagnostics.
 * @returns The transformed source.
 */
export function patchSource(source: string, patches: readonly SourcePatch[], target: string): string {
    return patches.reduce((content, patch) => {
        if (!patch.before || content.split(patch.before).length !== 2) {
            throw new Error(`Review the compatibility patch for ${target}: its context changed.`);
        }
        return content.replace(patch.before, () => patch.after);
    }, source);
}
