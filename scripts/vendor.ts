/** @file Reproduce isolated rule sources from frozen checkouts and reviewed exact patches. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import lock from '../docs/reference/sources.json' with { type: 'json' };
import recipeData from './vendor-recipes.json' with { type: 'json' };

interface Recipe {
    provider: keyof typeof lock.sources;
    source?: string;
    content?: string;
    guard?: { source: string; sha256: string };
    patches?: { before: string; after: string }[];
}

const root = process.argv[process.argv.indexOf('--source-root') + 1];
if (!process.argv.includes('--source-root') || !root) {
    throw new Error('Usage: pnpm exec tsx scripts/vendor.ts --source-root <directory> [--check]');
}
const outputs = new Map<string, string>();
for (const [target, recipe] of Object.entries(recipeData as Record<string, Recipe>)) {
    const sourceRoot = join(root, lock.sources[recipe.provider].directory);
    if (recipe.guard) {
        const input = await readFile(join(sourceRoot, recipe.guard.source));
        if (createHash('sha256').update(input).digest('hex') !== recipe.guard.sha256) {
            throw new Error(`Review the generated port for ${target}: its upstream input changed.`);
        }
    }
    let content = recipe.source ? await readFile(join(sourceRoot, recipe.source), 'utf8') : recipe.content!;
    for (const patch of recipe.patches ?? []) {
        if (content.split(patch.before).length !== 2) {
            throw new Error(`Review the compatibility patch for ${target}: its context changed.`);
        }
        content = content.replace(patch.before, () => patch.after);
    }
    outputs.set(target, content);
}
// Validate every source and patch before writing any output.
for (const [target, content] of outputs) {
    if (process.argv.includes('--check')) {
        if ((await readFile(target, 'utf8')) !== content) {
            throw new Error(`Stale isolated source: ${target}`);
        }
    } else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
    }
}
process.stdout.write(`Reproduced ${outputs.size} isolated source files.\n`);
