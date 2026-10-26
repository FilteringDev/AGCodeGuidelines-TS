/** @file Verify consumer group configurations stored outside the consumer root still select their files. */
import {
    realpath,
    mkdir,
    mkdtemp,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
    join,
    resolve,
} from 'node:path';

import { describe, expect, it } from 'vitest';

import { createCompatibilityConfigGroups } from '../packages/oxlint-config/src/index';
import {
    comparableFindings,
    compareFindings,
    disableSuppressions,
    escapeGlob,
    fileScopes,
    runOxlintGroup,
    translateSuppressions,
    withResolvedPlugins,
} from '../scripts/consumer-oxlint';

const CLI = resolve('packages/oxlint-config/dist/lint-cli.js');
const SOURCE = 'export function run(): void {\n    debugger;\n}\n';

/**
 * Lint consumer files with a `no-debugger` group whose configuration lives in a cache directory.
 * @param consumer - Consumer directory.
 * @param scopes - Override file patterns of the group.
 * @param files - Consumer-relative files passed to the CLI.
 * @returns Locations reported by Oxlint.
 */
function lintGroup(consumer: string, scopes: string[], files: string[]): string[] {
    const [group] = createCompatibilityConfigGroups([{
        id: 'group-0',
        language: 'typescript',
        rules: { 'no-debugger': 'error' },
        context: { files: scopes },
    }]);
    return runOxlintGroup({
        cli: CLI,
        consumer,
        configPath: join(consumer, 'consumer-diff/group-0.json'),
        config: withResolvedPlugins(group!.config),
        files,
    }).map((diagnostic) => {
        const span = diagnostic.labels?.[0]?.span;
        return `${diagnostic.code}@${diagnostic.filename}:${span?.line}:${span?.column}`;
    });
}

describe('consumer Oxlint groups', () => {
    it('escapes glob syntax in literal paths', () => {
        expect(escapeGlob('/a/(g)/[id].{ts}')).toBe('/a/\\(g\\)/\\[id\\].\\{ts\\}');
        const expected = escapeGlob(join('/consumer', 'src', 'a.ts'));
        expect(fileScopes('/consumer', ['src/a.ts'])).toEqual([expected]);
    });

    it('selects exactly the group files from a nested configuration at ESLint locations', async () => {
        const consumer = await realpath(await mkdtemp(join(tmpdir(), 'ag-consumer-oxlint-')));
        try {
            await mkdir(join(consumer, 'src/(group)'), { recursive: true });
            const files = ['src/a.ts', 'src/(group)/[id].ts'];
            await Promise.all([...files, 'src/id.ts'].map((file) => writeFile(join(consumer, file), SOURCE)));

            // Oxlint resolves relative override patterns against the configuration directory.
            expect(lintGroup(consumer, files, files)).toEqual([]);
            expect(lintGroup(consumer, fileScopes(consumer, files), [...files, 'src/id.ts']).sort()).toEqual([
                'ag-compat(no-debugger)@src/(group)/[id].ts:2:5',
                'ag-compat(no-debugger)@src/a.ts:2:5',
            ]);
        } finally {
            await rm(consumer, { recursive: true, force: true });
        }
    });

    it('matches each file through the rule targets of its own group', () => {
        const source = '@typescript-eslint/dot-notation';
        const targetsByFile = new Map([
            ['a.ts', new Map([[source, 'typescript/dot-notation']])],
            ['b.js', new Map([[source, 'ag-compat/dot-notation']])],
        ]);
        const diagnostic = (code: string, filename: string, line: number) => ({
            code, filename, labels: [{ span: { line, column: 1 } }],
        });
        expect(compareFindings(
            [
                {
                    file: 'a.ts', ruleId: source, line: 1, column: 1,
                },
                {
                    file: 'b.js', ruleId: source, line: 1, column: 1,
                },
                {
                    file: 'b.js', ruleId: source, line: 2, column: 1,
                },
                {
                    file: 'b.js', ruleId: null, line: 3, column: 1,
                },
            ],
            [
                diagnostic('typescript(dot-notation)', 'a.ts', 1),
                diagnostic('ag-compat(dot-notation)', 'b.js', 1),
                diagnostic('ag-compat(dot-notation)', 'b.js', 4),
                diagnostic('typescript(dot-notation)', 'b.js', 2),
            ],
            targetsByFile,
        )).toEqual({
            [source]: { matched: 2, eslintOnly: ['b.js:2:1'], oxlintOnly: ['b.js:4:1'] },
            parse: { matched: 0, eslintOnly: ['b.js:3:1'], oxlintOnly: [] },
            'typescript/dot-notation': { matched: 0, eslintOnly: [], oxlintOnly: ['b.js:2:1'] },
        });
    });

    it('matches hooks diagnostics that Oxlint reports under the react-hooks display name', () => {
        const source = 'react-hooks/exhaustive-deps';
        const targetsByFile = new Map([['a.tsx', new Map([[source, 'react/exhaustive-deps']])]]);
        expect(compareFindings(
            [{
                file: 'a.tsx', ruleId: source, line: 3, column: 8,
            }],
            [{ code: 'react-hooks(exhaustive-deps)', filename: 'a.tsx', labels: [{ span: { line: 3, column: 8 } }] }],
            targetsByFile,
        )).toEqual({ [source]: { matched: 1, eslintOnly: [], oxlintOnly: [] } });
    });

    it('translates suppression comments to the target rule names', () => {
        const targets = new Map([['no-console', 'ag-compat/no-console'], ['no-var', 'eslint/no-var']]);
        const text = [
            '/* eslint-disable no-console */',
            '// eslint-disable-next-line no-var, vars-on-top -- legacy global',
            'var a = 1; // eslint-disable-line no-console',
            '// eslint-disable-next-line no-debugger',
            '',
        ].join('\n');
        expect(translateSuppressions('a.js', text, targets)).toEqual({
            text: [
                '/* eslint-disable ag-compat/no-console */',
                '// eslint-disable-next-line eslint/no-var, vars-on-top -- legacy global',
                'var a = 1; // eslint-disable-line ag-compat/no-console',
                '// eslint-disable-next-line no-debugger',
                '',
            ].join('\n'),
            changed: 3,
        });
        expect(translateSuppressions('a.js', 'debugger;\n', targets)).toEqual({ text: 'debugger;\n', changed: 0 });
    });

    it('excludes fallback rules only in the groups that fall back', () => {
        const rule = '@typescript-eslint/explicit-function-return-type';
        const finding = (file: string, ruleId: string | null, line: number) => ({
            file, ruleId, line, column: 1,
        });
        const findings = [finding('a.js', rule, 1), finding('b.ts', rule, 1), finding('a.js', null, 2)];
        expect(comparableFindings(findings, new Map([['a.js', new Set([rule])], ['b.ts', new Set<string>()]])))
            .toEqual(findings.slice(1));
    });

    it('neutralizes suppression comments without moving text', () => {
        const text = 'const s = "é😀"; /* eslint-disable no-console */\nvar a; // eslint-disable-line no-var -- why\n'
            + '// eslint is great\n';
        const result = disableSuppressions('a.js', text);
        expect(result).toEqual({
            text: 'const s = "é😀"; /* eslint_disable no-console */\nvar a; // eslint_disable-line no-var -- why\n'
                + '// eslint is great\n',
            changed: 2,
        });
        expect(result.text).toHaveLength(text.length);
    });
});
