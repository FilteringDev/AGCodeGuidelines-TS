/**
 * @file Guard source traceability and meaningful test coverage for the policy.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { catalog, resolveRule, severity } from '../packages/rule-catalog/src/index';
import { customCases } from './custom-cases';
import { gapCases } from './gap-cases';

import type { Fixture } from './harness';

const upstream = JSON.parse(
    readFileSync(new URL('./fixtures/upstream.json', import.meta.url), 'utf8'),
) as Fixture[];

const helpers = ['react/jsx-uses-react', 'react/jsx-uses-vars'];

describe('legacy rule resolution', () => {
    it('resolves the delimiter alias without changing preset activation', () => {
        const before = structuredClone(catalog);
        const options = { language: 'typescript', profile: 'adguard-projects' } as const;
        const canonical = resolveRule('member-delimiter-style', options);
        const alias = resolveRule('@typescript-eslint/member-delimiter-style', options);
        expect(alias).toEqual({ ...canonical, source: '@typescript-eslint/member-delimiter-style' });
        expect(alias).toMatchObject({ status: 'resolved', target: 'ag-style/member-delimiter-style' });
        expect(catalog).toEqual(before);
    });

    it('selects TypeScript replacements and preserves disabled rules', () => {
        expect(resolveRule('no-redeclare', { language: 'typescript' })).toMatchObject({
            status: 'resolved', target: 'ag-ts/no-redeclare',
        });
        expect(resolveRule('no-undef', { language: 'typescript' })).toMatchObject({
            status: 'compiler', target: null,
        });
        const disabled = catalog.mappings.find((mapping) => !mapping.scope && severity(mapping.setting) === 0)!;
        expect(resolveRule(disabled.source)).toMatchObject({ status: 'disabled', target: null });
    });

    it('reports unknown names and returns independent settings', () => {
        expect(resolveRule('unknown/missing')).toMatchObject({ status: 'unsupported' });
        const resolved = resolveRule('quotes');
        if (resolved.status === 'resolved' && Array.isArray(resolved.setting)) {
            resolved.setting[1] = 'double';
        }
        expect(resolveRule('quotes')).toMatchObject({ setting: ['error', 'single', { avoidEscape: true }] });
    });

    it('preserves caller options and explicitly rejects unsupported options', () => {
        expect(resolveRule('@typescript-eslint/quotes', { setting: ['warn', 'double', { avoidEscape: true }] }))
            .toMatchObject({ status: 'resolved', target: 'ag-style/quotes', setting: ['warn', 'double', { avoidEscape: true }] });
        expect(resolveRule('@typescript-eslint/member-delimiter-style', { setting: ['error', { unknownOption: true }] }))
            .toMatchObject({ status: 'unsupported' });
        expect(resolveRule('@typescript-eslint/return-await', { setting: ['error', 'in-try-catch'] }))
            .toMatchObject({ status: 'resolved', target: 'typescript/return-await', requiresTypeInfo: true });
        expect(resolveRule('@typescript-eslint/return-await', { setting: ['error', 'invalid'] }))
            .toMatchObject({ status: 'unsupported' });
        expect(resolveRule('@typescript-eslint/return-await', { setting: ['off', 'invalid'] }))
            .toMatchObject({ status: 'disabled', setting: ['off', 'invalid'] });
        expect(resolveRule('@typescript-eslint/member-delimiter-style', { language: 'javascript' }))
            .toMatchObject({ status: 'unsupported' });
        expect(resolveRule('react-hooks/exhaustive-deps', {
            setting: ['error', { enableDangerousAutofixThisMayCauseInfiniteLoops: true }],
        })).toMatchObject({ status: 'unsupported' });
        expect(resolveRule('@typescript-eslint/naming-convention')).toMatchObject({ status: 'unsupported' });
        for (const option of [
            { selector: 'parameter', format: ['camelCase'] },
            { selector: 'variable', format: ['camelCase'], modifiers: ['const'] },
            { selector: 'variable', format: ['camelCase'], types: ['boolean'] },
            { selector: 'variable', format: ['camelCase'], filter: 'skip' },
        ]) {
            expect(resolveRule('@typescript-eslint/naming-convention', { setting: ['error', option] }))
                .toMatchObject({ status: 'unsupported' });
        }
        expect(resolveRule('@typescript-eslint/naming-convention', {
            setting: ['error', { selector: 'variable', format: null }], language: 'javascript',
        })).toMatchObject({ status: 'resolved', target: 'ag-ts/naming-convention', requiresTypeInfo: false });
    });
});

describe('source and scenario inventory', () => {
    it('accounts for every numbered guideline clause with an explicit disposition', () => {
        const source = readFileSync('docs/reference/Javascript.md', 'utf8');
        const anchors = Array.from(source.matchAll(/^- \[\d+\.\d+\]\(#([^)]+)\)/gmu), (match) => match[1]);
        expect(catalog.clauses.map((clause) => clause.id)).toEqual(anchors);
        expect(anchors).toHaveLength(134);
        catalog.clauses.forEach((clause) => {
            expect(clause.reason.trim().length).toBeGreaterThan(0);
            if (['native', 'javascript', 'custom'].includes(clause.enforcement)) {
                expect(clause.rules.length).toBeGreaterThan(0);
            }
        });
    });

    it('pins both reference snapshots by their content hash', () => {
        ['Javascript.md', 'eslintrc.upstream.txt'].forEach((name) => {
            const hash = createHash('sha256')
                .update(readFileSync(`docs/reference/${name}`))
                .digest('hex');
            expect(Object.values(catalog.sources).some((source) => source.includes(hash))).toBe(true);
        });
    });

    it('requires at least 10000 distinct behavioral inputs', () => {
        const identities = upstream.map((fixture) => JSON.stringify([
            fixture.sourceRule,
            fixture.code,
            fixture.options,
            fixture.settings,
            fixture.globals,
            fixture.sourceType,
            fixture.lang,
            fixture.ecmaVersion,
            fixture.env,
            fixture.filename,
            fixture.parserOptions,
        ]));
        expect(new Set(identities).size).toBe(upstream.length);
        expect(upstream.length + customCases.length).toBeGreaterThanOrEqual(10000);
        expect(upstream.filter((fixture) => fixture.group === 'native').length).toBeGreaterThanOrEqual(1200);
        expect(upstream.filter((fixture) => fixture.group === 'style').length).toBeGreaterThanOrEqual(800);
        expect(customCases.length).toBeGreaterThanOrEqual(600);
        expect(
            new Set(customCases.map((fixture) => JSON.stringify([fixture.rule, fixture.code, fixture.lang]))).size,
        ).toBe(customCases.length);
    });

    it.each(catalog.mappings.filter((mapping) => severity(mapping.setting) > 0))(
        '$source has an executable implementation and positive/negative coverage',
        (mapping) => {
            expect(mapping.target).not.toBeNull();
            expect(mapping.implementation).not.toBe('disabled');
            if (helpers.includes(mapping.source)) {
                // These rules mark bindings as used; their effect is tested with no-unused-vars.
                return;
            }
            if (gapCases.some((example) => example.rule === mapping.source)) {
                return;
            }
            const valid = mapping.source.startsWith('ag/')
                ? customCases.filter((example) => `ag/${example.rule}` === mapping.source && example.errors === 0)
                : upstream.filter((example) => example.sourceRule === mapping.source && example.errors.length === 0);
            const invalid = mapping.source.startsWith('ag/')
                ? customCases.filter((example) => `ag/${example.rule}` === mapping.source && example.errors > 0)
                : upstream.filter((example) => example.sourceRule === mapping.source && example.errors.length > 0);
            expect(valid.length).toBeGreaterThan(0);
            expect(invalid.length).toBeGreaterThan(0);
        },
    );

    it('keeps disabled inherited settings disabled and prevents stale fixture targets', () => {
        catalog.mappings
            .filter((mapping) => mapping.scope === undefined && severity(mapping.setting) === 0)
            .forEach((mapping) => {
                expect(mapping.implementation).toBe('disabled');
                expect(mapping.target).toBeNull();
            });
        upstream.forEach((fixture) => {
            // Fixtures target the enabled implementation, which may belong to an opt-in layer.
            const enabled = catalog.mappings.find(
                (mapping) => mapping.source === fixture.sourceRule && mapping.implementation !== 'disabled',
            );
            expect(enabled?.target).toBe(fixture.target);
            expect(fixture.origin).toMatch(/^(?:eslint|eslint-stylistic|eslint-plugin-)/u);
        });
    });
});
