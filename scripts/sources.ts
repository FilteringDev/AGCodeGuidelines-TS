/** @file Check that authored sources remain TypeScript ESM. */
import { checkSources } from './source-policy';

const count = await checkSources(process.cwd());
process.stdout.write(`Verified ${count} TypeScript ESM source files.\n`);
