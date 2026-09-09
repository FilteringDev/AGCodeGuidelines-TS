/**
 * @file Guard source traceability and meaningful test coverage for the policy.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { catalog, severity } from '../packages/rule-catalog/src/index';
import { customCases } from './custom-cases';
import { gapCases } from './gap-cases';
import upstream from './fixtures/upstream.json' with { type: 'json' };

const helpers = ['react/jsx-uses-react', 'react/jsx-uses-vars'];

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
            .filter((mapping) => severity(mapping.setting) === 0)
            .forEach((mapping) => {
                expect(mapping.implementation).toBe('disabled');
                expect(mapping.target).toBeNull();
            });
        upstream.forEach((fixture) => {
            expect(catalog.mappings.find((mapping) => mapping.source === fixture.sourceRule)?.target).toBe(
                fixture.target,
            );
            expect(fixture.origin).toMatch(/^(?:eslint|eslint-stylistic|eslint-plugin-)/u);
        });
    });
});
