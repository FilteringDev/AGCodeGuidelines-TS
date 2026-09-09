/** @file Bundle portable ESM packages and emit TypeScript 7 declarations. */
import {
    copyFile, mkdir, readFile, readdir, rm, writeFile,
} from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { execPnpm } from './process';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['rule-catalog', 'oxlint-plugin', 'oxlint-config']) {
    const directory = `${ROOT}packages/${name}`;
    const entries = (await readdir(`${directory}/src`))
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
        .filter((file) => name === 'oxlint-plugin' || file === 'index.ts' || file === 'cli.ts');
    await rm(`${directory}/dist`, { recursive: true, force: true });
    await mkdir(`${directory}/dist`, { recursive: true });
    const result = await build({
        entryPoints: entries.map((file) => `${directory}/src/${file}`),
        outdir: `${directory}/dist`,
        bundle: true,
        splitting: true,
        external: ['@oxlint/plugins', 'oxlint', 'oxc-parser', 'oxc-resolver'],
        platform: 'node',
        format: 'esm',
        target: 'node24',
        sourcemap: true,
        metafile: true,
        banner: {
            js: "import { createRequire as __createRequire } from 'node:module'; import { fileURLToPath as __fileURLToPath } from 'node:url'; import { dirname as __dirnameOf } from 'node:path'; const require = __createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __dirnameOf(__filename);",
        },
        alias: { '@agcodeguidelines/rule-catalog': `${ROOT}packages/rule-catalog/src/index.ts` },
        plugins: [
            {
                name: 'forbid-eslint-engine',
                setup(api) {
                    api.onLoad({ filter: /@stylistic[/\\].*[/\\]vendor\.js$/ }, async ({ path }) => ({
                        contents: (await readFile(path, 'utf8'))
                            .replaceAll(
                                '__require("@eslint-community/eslint-utils")',
                                'require("@eslint-community/eslint-utils")',
                            )
                            .replaceAll('__require("@typescript-eslint/types")', 'require("@typescript-eslint/types")'),
                        loader: 'js',
                        resolveDir: dirname(path),
                    }));
                    api.onResolve({ filter: /^eslint(?:\/|$)/ }, ({ path }) => ({
                        errors: [{ text: `ESLint engine imports are forbidden: ${path}` }],
                    }));
                },
            },
        ],
    });
    await writeFile(`${directory}/dist/build-meta.json`, JSON.stringify(result.metafile));
    await copyFile(`${ROOT}LICENSE`, `${directory}/LICENSE`);
}
execPnpm(['exec', 'tsc', '-b', '--force'], { cwd: ROOT, stdio: 'inherit' });
execPnpm(['exec', 'tsx', 'scripts/write-configs.ts'], { cwd: ROOT, stdio: 'inherit' });
execPnpm(['exec', 'tsx', 'scripts/notices.ts'], { cwd: ROOT, stdio: 'inherit' });
