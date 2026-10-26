/**
 * @file Vitest projects share one explicit Node environment and coverage policy.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
        exclude: ['tests/fixtures/**'],
        environment: 'node',
        maxWorkers: 2,
        pool: 'forks',
        testTimeout: 30000,
        hookTimeout: 180000,
        reporters: ['default'],
        coverage: {
            provider: 'v8',
            reportsDirectory: process.env.AG_COVERAGE_DIR ?? join(tmpdir(), 'agcodeguidelines-coverage'),
            reportOnFailure: true,
            include: ['packages/*/src/**/*.ts', 'vendor/import/compat/**/*.ts'],
            exclude: ['**/*.d.ts'],
            reporter: ['text', 'json', 'html'],
            thresholds: {
                lines: 95,
                statements: 95,
                functions: 95,
                branches: 90,
            },
        },
    },
});
