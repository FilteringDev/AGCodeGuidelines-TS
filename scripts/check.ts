/**
 * @file Execute the complete repository acceptance checks.
 */
import { execFileSync } from 'node:child_process';
import { execPnpm } from './process';

for (const task of ['build', 'typecheck', 'lint', 'catalog:check', 'snapshots:check', 'test:coverage']) {
    execPnpm(['run', task], { stdio: 'inherit' });
}
execFileSync('git', ['diff', '--check'], { stdio: 'inherit' });
execFileSync('git', ['diff', '--cached', '--check'], { stdio: 'inherit' });
