/**
 * @file Emit the JSON entry points used by Oxlint and plain-JSON consumers.
 */
import { writeFile } from 'node:fs/promises';

import { createConfig, node } from '@agcodeguidelines/oxlint-config';

for (const language of ['javascript', 'typescript'] as const) {
    await writeFile(
        `packages/oxlint-config/dist/${language}.json`,
        `${JSON.stringify(createConfig(language), null, 2)}\n`,
    );
}
await writeFile('packages/oxlint-config/dist/node.json', `${JSON.stringify(node, null, 2)}\n`);
