/** @file Guard reproducible source transformations and reference configuration parity. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import sample from '../docs/reference/eslintrc';
import { patchSource } from '../scripts/ports';
import { portReference, verifyReference } from '../scripts/reference';

describe('reviewed source ports', () => {
    it('applies patches in order and preserves replacement metacharacters literally', () => {
        expect(patchSource('first', [
            { before: 'first', after: 'second' },
            { before: 'second', after: '$& $$ $`' },
        ], 'example')).toBe('$& $$ $`');
    });

    it.each(['', 'missing', 'same same'])('rejects empty, missing, or ambiguous context in %j', (source) => {
        expect(() => patchSource(source, [{ before: source ? 'same' : '', after: 'value' }], 'example'))
            .toThrow('Review the compatibility patch for example');
    });

    it('reproduces the typed reference from the exact upstream bytes', () => {
        const raw = readFileSync('docs/reference/eslintrc.upstream.txt', 'utf8');
        expect(portReference(raw)).toBe(readFileSync('docs/reference/eslintrc.ts', 'utf8'));
        expect(() => verifyReference(raw, sample)).not.toThrow();
        expect(() => portReference(raw.replace("'no-console': 'error'", "'no-console': 'off'")))
            .toThrow('context changed');
    });

    it('rejects semantic drift even when the typed configuration remains valid', () => {
        const raw = readFileSync('docs/reference/eslintrc.upstream.txt', 'utf8');
        expect(() => verifyReference(raw, { ...sample, env: { browser: false } })).toThrow('differs');
    });

    it('evaluates reference data without access to module loading', () => {
        expect(() => verifyReference('module.exports = require("eslint");', sample)).toThrow('require');
    });
});
