/**
 * @file Attribute Oxlint JavaScript-provider time to rules; preload with `node --import`.
 *
 * Set `AG_TRACE_PLUGIN_DIST` to the installed plugin `dist`, `AG_TRACE_OXLINT_RUNTIME` to the executing
 * Oxlint's `dist/lint.js`, and `AG_LINT_TRACE_DIR` to the output directory.
 * Tracing adds timer overhead to every visitor call; use it for ranking, never for timing comparisons.
 */
import {
    mkdirSync,
    readdirSync,
    realpathSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Visitor = Record<string, ((...args: unknown[]) => unknown) | undefined>;
interface TracedRule {
    create?: (context: unknown) => Visitor;
    createOnce?: (context: unknown) => Visitor;
}
interface Totals {
    createMs: number;
    visitMs: number;
    creates: number;
    visits: number;
}
interface TracedPlugin {
    meta?: { name?: string };
    rules?: Record<string, TracedRule>;
}

const distribution = process.env.AG_TRACE_PLUGIN_DIST;
const runtime = process.env.AG_TRACE_OXLINT_RUNTIME;
const output = process.env.AG_LINT_TRACE_DIR;
if (!distribution || !runtime || !output) {
    throw new Error('AG_TRACE_PLUGIN_DIST, AG_TRACE_OXLINT_RUNTIME and AG_LINT_TRACE_DIR are required.');
}
// Oxlint's global WeakMap resets per-file sourceCode keys; providers evaluated first would keep stale entries.
await import(pathToFileURL(realpathSync(runtime)).href);
const totals = new Map<string, Totals>();

/**
 * Time every visitor function under one rule key.
 * @param visitor - Visitor returned by the rule.
 * @param entry - Accumulated totals for the rule.
 * @returns The same selectors with timed handlers.
 */
function timeVisitor(visitor: Visitor, entry: Totals): Visitor {
    return Object.fromEntries(Object.entries(visitor).map(([selector, handler]) => [
        selector,
        typeof handler === 'function'
            ? function timed(this: unknown, ...args: unknown[]) {
                const started = performance.now();
                try {
                    return handler.apply(this, args);
                } finally {
                    entry.visitMs += performance.now() - started;
                    entry.visits += 1;
                }
            }
            : handler,
    ]));
}

const root = realpathSync(distribution);
for (const file of readdirSync(root).filter((name) => name.endsWith('.js'))) {
    // Oxlint imports providers through pnpm symlinks; real paths share this module instance.
    const module = await import(pathToFileURL(join(root, file)).href) as { default?: TracedPlugin };
    const plugin = module.default;
    if (!plugin?.rules || !plugin.meta?.name) {
        continue;
    }
    for (const [name, rule] of Object.entries(plugin.rules)) {
        const entry: Totals = {
            createMs: 0,
            visitMs: 0,
            creates: 0,
            visits: 0,
        };
        totals.set(`${plugin.meta.name}/${name}`, entry);
        for (const key of ['create', 'createOnce'] as const) {
            const original = rule[key];
            if (typeof original !== 'function') {
                continue;
            }
            rule[key] = (context: unknown) => {
                const started = performance.now();
                const visitor = original.call(rule, context);
                entry.createMs += performance.now() - started;
                entry.creates += 1;
                return timeVisitor(visitor, entry);
            };
        }
    }
}

process.on('exit', () => {
    mkdirSync(output, { recursive: true });
    const rules = Object.fromEntries([...totals].filter(([, entry]) => entry.creates)
        .sort(([, left], [, right]) => (right.createMs + right.visitMs) - (left.createMs + left.visitMs)));
    writeFileSync(join(output, `rules-${process.pid}.json`), `${JSON.stringify({ cpu: process.cpuUsage(), rules }, null, 2)}\n`);
});
