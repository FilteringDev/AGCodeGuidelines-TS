/**
 * @file Resolve the frozen source configuration and generate traceable mappings.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, relative } from 'node:path';
import sample from '../docs/reference/eslintrc';
import { verifyReference } from './reference';
import builtinRules from '../vendor/core/lib/rules/index';
import { severity } from '../packages/rule-catalog/src/index';

import type {
    Catalog, Clause, Mapping, RuleMap, RuleSetting,
} from '../packages/rule-catalog/src/index';

interface LegacyConfig {
    extends?: readonly string[];
    rules?: RuleMap;
    settings?: Record<string, unknown>;
    env?: Record<string, boolean>;
}

interface Provider {
    rules: Record<string, unknown>;
    configs: Record<string, LegacyConfig>;
}

const PLUGIN_REQUIRE = createRequire(new URL('../packages/oxlint-plugin/package.json', import.meta.url));
const loadPlugin = async (name: string): Promise<Provider> => {
    const loaded = await import(PLUGIN_REQUIRE.resolve(name));
    return loaded.default ?? loaded;
};
const style = await loadPlugin('@stylistic/eslint-plugin');
const jsdoc = (await import('../vendor/jsdoc/index')).default as unknown as Provider;
const react = (await import('../vendor/react/index')).default as unknown as Provider;
const accessibility = await loadPlugin('eslint-plugin-jsx-a11y');
const imports = (await import('../vendor/import/index')).default as unknown as Provider;
const nativeList = JSON.parse(
    execFileSync(
        process.execPath,
        [
            'node_modules/oxlint/bin/oxlint',
            '--config',
            'scripts/inventory.oxlintrc.json',
            '--rules',
            '--format',
            'json',
        ],
        {
            encoding: 'utf8',
        },
    ),
) as { scope: string; value: string }[];
const native = new Set(nativeList.map(({ scope, value }) => `${scope.replaceAll('_', '-')}/${value}`));
const origins: Record<string, string> = {};
const baseline: RuleMap = {};
const settings: Record<string, unknown> = {};
const env: Record<string, boolean> = {};
const hashes: Record<string, string> = {};

/**
 * Hash baseline inputs so dependency and source changes are reviewable.
 * @param name - Stable source identifier.
 * @param content - Exact input bytes or serialized baseline data.
 */
function hash(name: string, content: string): void {
    hashes[name] = createHash('sha256').update(content).digest('hex');
}

/**
 * Apply a configuration after its ancestors, preserving disabled settings.
 * @param config - Legacy configuration data.
 * @param origin - Stable provenance label.
 */
function apply(config: LegacyConfig, origin: string): void {
    Object.assign(settings, config.settings);
    Object.assign(env, config.env);
    Object.entries(config.rules ?? {}).forEach(([name, setting]) => {
        const previous = baseline[name];
        // ESLint preserves inherited options when a child changes severity only.
        baseline[name] = Array.isArray(previous) && (!Array.isArray(setting) || setting.length === 1)
            ? [Array.isArray(setting) ? setting[0] : setting, ...previous.slice(1)]
            : setting;
        origins[name] = origin;
    });
}

const airbnbText = await readFile('docs/reference/airbnb.json', 'utf8');
const airbnb = JSON.parse(airbnbText) as LegacyConfig;
apply(airbnb, 'airbnb@19.0.4/base@15.0.0');
hash('airbnb.json', airbnbText);
apply(jsdoc.configs.recommended ?? {}, 'jsdoc@64.3.6/recommended');
hash('jsdoc@64.3.6/recommended', JSON.stringify(jsdoc.configs.recommended));
const sampleText = await readFile('docs/reference/eslintrc.upstream.txt', 'utf8');
const guideText = await readFile('docs/reference/Javascript.md', 'utf8');
hash('Javascript.md', guideText);
hash('eslintrc.cjs', sampleText);
verifyReference(sampleText, sample);
apply(sample, 'eslintrc.cjs');

const additions: RuleMap = {
    'jsdoc/require-file-overview': 'error',
    'jsdoc/require-description': 'error',
    'jsdoc/require-description-complete-sentence': 'error',
    'jsdoc/require-hyphen-before-param-description': ['error', 'never'],
    'jsdoc/require-throws': 'error',
    'jsdoc/sort-tags': 'error',
    'unicorn/prefer-node-protocol': 'error',
    'unicorn/no-this-assignment': 'error',
    'ag/no-accessors': 'error',
    'ag/no-direct-reexport': 'error',
    'ag/no-prototype-mutation': 'error',
    'ag/no-default-side-effects': 'error',
    'ag/prefer-array-from-map': 'error',
    'ag/require-docblock': 'error',
};

const extraClauses: Record<string, string[]> = {
    'types--primitives': [],
    'references--block-scope': ['no-undef'],
    'arrays--mapping': ['ag/prefer-array-from-map'],
    'strings--line-length': ['max-len', 'no-useless-concat'],
    'functions--arguments-shadow': ['no-shadow-restricted-names'],
    'es6-default-parameters': ['no-param-reassign'],
    'functions--default-side-effects': ['ag/no-default-side-effects'],
    'constructors--use-class': ['ag/no-prototype-mutation'],
    'constructors--extends': ['ag/no-prototype-mutation'],
    'modules--use-them': ['import/no-commonjs', 'import/no-amd'],
    'modules--no-wildcard': ['import/no-namespace'],
    'modules--no-export-from-import': ['ag/no-direct-reexport'],
    'modules--prefer-named-export': ['import/prefer-default-export'],
    'modules--import-node-protocol': ['unicorn/prefer-node-protocol'],
    'properties--bracket': ['dot-notation'],
    'control-statements': ['operator-linebreak'],
    'control-statement--value-selection': ['no-unused-expressions'],
    'comments--multiline': ['ag/require-docblock'],
    'comments--singleline': ['line-comment-position', 'lines-around-comment'],
    'comments-jsdoc': [
        'jsdoc/require-file-overview',
        'jsdoc/require-description',
        'jsdoc/require-description-complete-sentence',
        'jsdoc/require-hyphen-before-param-description',
        'jsdoc/require-throws',
        'jsdoc/sort-tags',
    ],
    'whitespace--after-blocks': ['padding-line-between-statements'],
    'coercion--comment-deviations': ['no-bitwise'],
    'naming--self-this': ['unicorn/no-this-assignment'],
    'accessors--no-getters-setters': ['ag/no-accessors'],
    'typescript--enum-naming-conventions': ['ag/enum-name'],
    'typescript--caught-error-type': ['ag/unknown-catch'],
};

const manual: Record<string, string> = {
    'types--primitives': 'Educational semantics; supported browser targets must be selected by the consumer.',
    'types--complex': 'Educational explanation of reference values.',
    'es6-array-spreads': 'Recognizing arbitrary copying algorithms requires semantic intent; reviewed manually.',
    'arrays--from-iterable':
        'An unknown JavaScript value may be array-like rather than iterable; no speculative rewrite.',
    'arrays--from-array-like': 'Whether an arbitrary runtime value is array-like requires runtime information.',
    'destructuring--object-over-array':
        'Distinguishing multiple return values from an intentional array API requires review.',
    'constructors--chaining': 'Method chaining is optional API design guidance.',
    'variables--define-where-used': 'A reasonable declaration location is a human judgment.',
    'hoisting--about': 'Educational explanation of hoisting and temporal dead zones.',
    'hoisting--anon-expressions': 'Educational explanation of anonymous function hoisting.',
    'hoisting--named-expresions': 'Educational explanation of named function expression hoisting.',
    'hoisting--declarations': 'Educational explanation of function declaration hoisting.',
    'comparison--if': 'Educational explanation of boolean coercion.',
    'comparison--shortcuts': 'Requires semantic types for arbitrary JavaScript expressions; review manually.',
    'comparison--moreinfo': 'Further-reading reference, not a code requirement.',
    'comments--actionitems': 'TODO/FIXME classify work urgency; the author annotation is explicitly optional.',
    'coercion--explicit': 'Determining where a semantic conversion belongs requires review.',
    'coercion--bitwise': 'Educational warning about bitwise numeric range.',
    'naming--PascalCase-singleton': 'Identifying a singleton or function library requires API-level intent.',
    'naming--Acronyms-and-Initialisms': 'Recognizing domain acronyms requires a project vocabulary.',
    'naming--constants':
        'The guide distinguishes semantic constants from ordinary const bindings without defining a boundary.',
    'accessors--not-required': 'Accessor functions are explicitly optional.',
    'accessors--boolean-prefix': 'Boolean API intent cannot be inferred reliably for arbitrary JavaScript methods.',
    'accessors--consistent': 'Consistency of get/set APIs is a design-review requirement.',
};

const clauseMatches = [...guideText.matchAll(/^- \[(\d+\.\d+)\]\(#([^)]+)\)(.*)$/gmu)];
const clauses: Clause[] = clauseMatches.map((match, index) => {
    const start = match.index;
    const end = clauseMatches[index + 1]?.index ?? guideText.length;
    const body = guideText.slice(start, end);
    const id = match[2] ?? '';
    const links = Array.from(
        body.matchAll(
            /\[`([^`]+)`\]\((?:https:\/\/eslint\.org\/docs\/[^)]*|https:\/\/github\.com\/[^)]*eslint[^)]*)\)/gu,
        ),
        (link) => link[1] ?? '',
    );
    const linked = [...new Set(extraClauses[id] ?? links)];
    return {
        id,
        number: match[1] ?? '',
        text: (match[3] ?? '').trim(),
        line: guideText.slice(0, start).split('\n').length,
        rules: linked,
        enforcement: 'manual',
        reason: manual[id] ?? '',
    };
});

const guideOptions: RuleMap = {
    'no-const-assign': 'error',
    'no-var': 'error',
    'no-restricted-properties': ['error', { object: 'Math', property: 'pow', message: 'Use the ** operator.' }],
    'padding-line-between-statements': ['error', { blankLine: 'always', prev: 'block-like', next: '*' }],
};
clauses.forEach((clause) => clause.rules.forEach((rule) => {
    if (baseline[rule] === undefined && additions[rule] === undefined && !rule.startsWith('ag/')) {
        additions[rule] = guideOptions[rule] ?? 'error';
    }
}));

const mappings: Mapping[] = [];
const rules: RuleMap = {};

/**
 * Choose a concrete provider, refusing to silently drop an enabled setting.
 * @param source - Original rule identifier.
 * @param originalSetting - Resolved setting.
 * @param origin - Source of the setting.
 */
function mapRule(source: string, originalSetting: RuleSetting, origin: string): void {
    let setting = originalSetting;
    if (source === 'import/no-cycle' && Array.isArray(setting)) {
        const options = { ...setting[1] };
        if (options.maxDepth === '∞') {
            delete options.maxDepth;
        }
        setting = [setting[0], options];
    }
    const level = Array.isArray(setting) ? setting[0] : setting;
    if (level === 'off' || level === 0) {
        mappings.push({
            source,
            target: null,
            setting,
            implementation: 'disabled',
            origin,
        });
        return;
    }
    let target: string | null = null;
    let implementation: Mapping['implementation'] = 'javascript';
    if (source.startsWith('ag/')) {
        target = source;
        implementation = 'custom';
    } else if (builtinRules.has(source)) {
        target = `ag-compat/${source}`;
    } else if (source.startsWith('jsdoc/') && jsdoc.rules[source.slice(6)]) {
        target = `ag-jsdoc/${source.slice(6)}`;
    } else if (source.startsWith('react/') && react.rules[source.slice(6)]) {
        target = `ag-react/${source.slice(6)}`;
    } else if (source.startsWith('jsx-a11y/') && accessibility.rules[source.slice(9)]) {
        target = `ag-a11y/${source.slice(9)}`;
    } else if (source.startsWith('import/') && imports.rules[source.slice(7)]) {
        target = `ag-import/${source.slice(7)}`;
    } else if (style.rules[source]) {
        target = `ag-style/${source}`;
    } else if (native.has(source)) {
        target = source;
        implementation = 'native';
    }
    if (!target) {
        throw new Error(`No implementation for enabled rule ${source}`);
    }
    if (rules[target] !== undefined && JSON.stringify(rules[target]) !== JSON.stringify(setting)) {
        // Directive spacing and block spacing are independent constraints of one rule.
        if (target === 'ag-style/padding-line-between-statements') {
            setting = [level, ...(rules[target] as unknown[]).slice(1), ...(setting as unknown[]).slice(1)];
        } else {
            throw new Error(`Conflicting provider mapping for ${source}: ${target}`);
        }
    }
    rules[target] = setting;
    mappings.push({
        source,
        target,
        setting,
        implementation,
        origin,
    });
}

Object.entries(baseline).forEach(([name, setting]) => mapRule(name, setting, origins[name] ?? 'baseline'));
Object.entries(additions).forEach(([name, setting]) => {
    if (baseline[name] === undefined || severity(baseline[name]) === 0) {
        delete baseline[name];
        const existing = mappings.findIndex((mapping) => mapping.source === name);
        if (existing !== -1) {
            mappings.splice(existing, 1);
        }
        mapRule(name, setting, 'Javascript.md');
    }
});
for (let index = mappings.length - 1; index >= 0; index -= 1) {
    const mapping = mappings[index]!;
    if (mapping.implementation === 'disabled' && rules[mapping.source] !== undefined) {
        mappings.splice(index, 1);
    }
}

clauses.forEach((clause) => {
    if (clause.id.startsWith('typescript--tsconfig')) {
        clause.enforcement = 'compiler';
        clause.reason = 'Enforced by shared tsconfig settings and compiler integration tests.';
    } else if (clause.id === 'typescript--enum-naming-conventions') {
        clause.enforcement = 'custom';
        clause.reason = 'Enum and member casing is enforced. Singular English names require review; values are unrestricted.';
    } else if (clause.id === 'typescript--caught-error-type') {
        clause.enforcement = 'custom';
        clause.reason = 'Explicit any is rejected; unannotated catches use unknown through strict compiler settings.';
    } else if (clause.rules.length > 0) {
        const matched = mappings.filter((mapping) => clause.rules.includes(mapping.source));
        const disabled = matched.filter((mapping) => mapping.implementation === 'disabled');
        const active = matched.filter((mapping) => mapping.implementation !== 'disabled');
        if (
            disabled.length > 0
            || clause.id === 'modules--prefer-named-export'
            || clause.id === 'strings--line-length'
            || clause.id === 'coercion--comment-deviations'
        ) {
            clause.enforcement = 'overridden';
            clause.reason = `Sample precedence: ${clause.rules.join(', ')} retains its inherited/explicit options and severity.`;
        } else if (active.length > 0) {
            clause.enforcement = active.some((mapping) => mapping.implementation === 'custom')
                ? 'custom'
                : active.some((mapping) => mapping.implementation === 'javascript')
                    ? 'javascript'
                    : 'native';
            clause.reason
                ||= 'Configured rule enforces the linked syntactic requirement; semantic intent remains reviewable.';
        }
    }
    if (!clause.reason) {
        throw new Error(`Unclassified source clause: ${clause.id}`);
    }
});

const catalog: Catalog = {
    sources: hashes,
    baseline,
    settings,
    env,
    mappings,
    clauses,
    rules,
};
const report = [
    '# Guideline coverage',
    '',
    'Generated by `pnpm catalog:generate`. Sample settings and inherited disabled rules take precedence over prose.',
    '',
    '| Clause | Enforcement | Rules | Interpretation |',
    '| --- | --- | --- | --- |',
    ...clauses.map(
        (clause) => `| [${clause.number} ${clause.id}](reference/Javascript.md#${clause.id})`
            + ` | ${clause.enforcement} | ${clause.rules.map((rule) => `\`${rule}\``).join(', ')}`
            + ` | ${clause.reason.replaceAll('|', '\\|')} |`,
    ),
    '',
    '## Resolved rule mappings',
    '',
    '| Source rule | Oxlint rule | Provider | Setting | Origin |',
    '| --- | --- | --- | --- | --- |',
    ...mappings.map(
        (mapping) => `| ${mapping.source} | ${mapping.target ?? 'disabled'} | ${mapping.implementation}`
            + ` | \`${JSON.stringify(mapping.setting).replaceAll('|', '\\|')}\` | ${mapping.origin} |`,
    ),
    '',
].join('\n');

for (const [file, content] of [
    ['packages/rule-catalog/src/catalog.json', `${JSON.stringify(catalog, null, 2)}\n`],
    ['docs/coverage.md', report],
] as const) {
    if (process.argv.includes('--check')) {
        if ((await readFile(file, 'utf8')) !== content) {
            throw new Error(`Generated file is stale: ${relative(process.cwd(), file)}`);
        }
    } else {
        await writeFile(file, content);
    }
}
process.stdout.write(
    `Catalog: ${clauses.length} clauses; ${Object.keys(rules).length} enabled rules; ${basename(import.meta.filename)}\n`,
);
