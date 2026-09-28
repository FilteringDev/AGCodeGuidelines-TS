/**
 * @file Run each clause's good and bad examples through the complete materialized preset for each policy.
 */
import { createRequire } from 'node:module';

import {
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';

import { createConfig } from '../packages/oxlint-config/src/index';
import { catalog } from '../packages/rule-catalog/src/index';
import { clauseCases, clauseGlobals } from './clause-cases';
import { lintBatch } from './cli';

import type { Enforcement, Policy } from '../packages/rule-catalog/src/index';
import type { ClauseCase } from './clause-cases';
import type { Diagnostic } from './cli';

const REQUIRE = createRequire(import.meta.url);
const HEADER = '/**\n * @file Clause fixture.\n */\n\n';
const POLICIES: Policy[] = ['compatibility', 'guideline'];
const SHARED_FILES = {
    'package.json': '{"name":"clauses","type":"module","dependencies":{"a":"1.0.0","b":"1.0.0","npm-package":"1.0.0"}}',
    'helpers.js': 'export const first = 1;\nexport const second = 2;\nexport const third = 3;\nexport const fourth = 4;\n',
    'bar.js': 'export default 1;\n',
    'src/foo.js': 'export default 1;\n',
    'shapes.ts': 'export interface Shape {\n    area: number;\n}\n\nexport const area = 1;\n',
};

interface Run {
    example: ClauseCase;
    policy: Policy;
    index: number;
}

const runs: Run[] = clauseCases.flatMap((example, index) => (example.policy === 'both' ? POLICIES : [example.policy])
    .map((policy) => ({ example, policy, index })));
const outcomes = new Map<string, Diagnostic[]>();

const key = (run: Run, kind: 'bad' | 'good') => `${run.index}/${run.policy}/${kind}`;
const code = (diagnostic: Diagnostic) => diagnostic.code?.replace(/^([^()]+)\(([^)]+)\)$/u, '$1/$2');
const source = (example: ClauseCase, text: string) => `${example.bare ? '' : HEADER}${text}${example.noFinalNewline ? '' : '\n'}`;

beforeAll(async () => {
    const groups = Object.groupBy(runs, (run) => [
        run.policy,
        run.example.extension ?? 'js',
        run.example.importGroups ?? '',
    ].join('|'));
    for (const [group, members] of Object.entries(groups)) {
        const [policy, extension, importGroups] = group.split('|') as [Policy, string, string];
        const base = createConfig({
            language: ['ts', 'tsx'].includes(extension) ? 'typescript' : 'javascript',
            environment: 'both',
            policy,
            ...(importGroups ? { importGroups: importGroups as 'example' | 'prose' } : {}),
        });
        const config = {
            ...base,
            globals: Object.fromEntries(clauseGlobals.map((name) => [name, 'readonly'])),
            jsPlugins: (base.jsPlugins as { name: string; specifier: string }[])
                .map((provider) => ({ ...provider, specifier: REQUIRE.resolve(provider.specifier) })),
        };
        const files: Record<string, string> = { ...SHARED_FILES };
        const names = new Map<string, string>();
        for (const run of members ?? []) {
            for (const kind of ['bad', 'good'] as const) {
                const text = run.example[kind];
                if (text !== undefined) {
                    const directory = run.example.directory ? `${run.example.directory}/` : '';
                    const name = `${directory}case-${run.index}-${kind}.${extension}`;
                    files[name] = source(run.example, text);
                    names.set(key(run, kind), name);
                }
            }
        }
        const results = await lintBatch(config, files);
        names.forEach((name, id) => outcomes.set(id, results.get(name) ?? []));
    }
}, 300000);

describe('guideline clause examples', () => {
    runs.forEach((run) => {
        const { example, policy } = run;
        const label = `${policy}: ${example.clause} [${example.extension ?? 'js'}${example.importGroups ? `, ${example.importGroups}` : ''}]`;
        if (example.bad !== undefined) {
            it(`${label} ${example.expectMiss ? 'does not report' : 'reports'} the bad example`, () => {
                const reported = outcomes.get(key(run, 'bad'))!.filter((diagnostic) => example.rules.includes(code(diagnostic)!));
                if (example.expectMiss) {
                    expect(reported).toEqual([]);
                } else {
                    expect(reported.length, JSON.stringify(outcomes.get(key(run, 'bad')))).toBeGreaterThan(0);
                }
            });
        }
        if (example.good !== undefined) {
            it(`${label} ${example.expectConflict ? 'reports' : 'accepts'} the good example`, () => {
                const reported = outcomes.get(key(run, 'good'))!.filter((diagnostic) => example.rules.includes(code(diagnostic)!));
                if (example.expectConflict) {
                    expect(reported.length).toBeGreaterThan(0);
                } else {
                    expect(reported, JSON.stringify(reported)).toEqual([]);
                }
            });
        }
    });
});

describe('clause dispositions match executable examples', () => {
    const disposition = (clause: (typeof catalog.clauses)[number], policy: Policy) => (
        policy === 'compatibility' ? clause : clause.guideline
    );
    const covering = (id: string, policy: Policy) => runs.filter(
        (run) => run.example.clause === id && run.policy === policy,
    );
    const enforced: Enforcement[] = ['native', 'javascript', 'custom', 'partial'];

    POLICIES.forEach((policy) => {
        it.each(catalog.clauses.filter((clause) => enforced.includes(disposition(clause, policy).enforcement)))(
            `${policy}: $number $id has a reported bad example`,
            (clause) => {
                const cases = covering(clause.id, policy);
                expect(cases.some(({ example }) => example.bad !== undefined && !example.expectMiss)).toBe(true);
            },
        );

        it.each(catalog.clauses.filter((clause) => ['partial', 'overridden'].includes(disposition(clause, policy).enforcement)))(
            `${policy}: $number $id demonstrates what is not enforced`,
            (clause) => {
                const cases = covering(clause.id, policy);
                expect(cases.some(({ example }) => example.expectMiss || example.expectConflict)).toBe(true);
            },
        );
    });

    it('marks a clause partial or overridden only when an example shows the gap', () => {
        runs.filter(({ example }) => example.expectMiss || example.expectConflict).forEach(({ example, policy }) => {
            const clause = catalog.clauses.find((entry) => entry.id === example.clause)!;
            expect(['partial', 'overridden'], `${policy}: ${example.clause}`)
                .toContain(disposition(clause, policy).enforcement);
        });
    });

    it('covers both import grouping interpretations', () => {
        const variants = runs.filter(({ example }) => example.clause === 'modules--import-grouping')
            .map(({ example }) => example.importGroups);
        expect(variants).toEqual(expect.arrayContaining(['example', 'prose']));
    });
});
