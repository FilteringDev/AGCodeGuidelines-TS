/**
 * @file Resolve the frozen source configuration and generate traceable mappings.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import sample from '../docs/reference/eslintrc';
import { verifyReference } from './reference';
import builtinRules from '../vendor/core/lib/rules/index';
import { severity } from '../packages/rule-catalog/src/index';

import type {
    Catalog,
    Clause,
    Disposition,
    ImportGroups,
    Mapping,
    Policy,
    RuleMap,
    RuleSetting,
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
    const loaded = await import(pathToFileURL(PLUGIN_REQUIRE.resolve(name)).href);
    return loaded.default ?? loaded;
};
const style = await loadPlugin('@stylistic/eslint-plugin');
const jsdoc = (await import('../vendor/jsdoc/index')).default as unknown as Provider;
const react = (await import('../vendor/react/index')).default as unknown as Provider;
const accessibility = await loadPlugin('eslint-plugin-jsx-a11y');
const imports = (await import('../vendor/import/index')).default as unknown as Provider;
const newlines = (await import('../vendor/import-newlines/index')).default as unknown as Provider;
const boundaries = (await import('../vendor/boundaries/index')).default as unknown as Provider;
const notice = (await import('../vendor/notice/index')).default as unknown as Provider;
const logger = (await import('../vendor/logger-context/index')).default as unknown as Provider;
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
) as { scope: string; value: string; type_aware: boolean }[];
const native = new Set(nativeList.map(({ scope, value }) => `${scope.replaceAll('_', '-')}/${value}`));
const typedNative = new Set(nativeList.filter((rule) => rule.type_aware)
    .map(({ scope, value }) => `${scope.replaceAll('_', '-')}/${value}`));
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

type Scope = 'base' | NonNullable<Mapping['scope']>;

/**
 * Read inherited rule options without the severity.
 * @param name - Source rule identifier.
 * @returns Options from the resolved sample configuration.
 */
function inheritedOptions(name: string): unknown[] {
    const setting = baseline[name];
    return Array.isArray(setting) ? setting.slice(1) : [];
}

// Requirements stated by the guide that the sample configuration does not configure.
const guideAdditions: RuleMap = {
    'jsdoc/require-file-overview': 'error',
    'sort-imports': ['error', {
        ignoreCase: true,
        ignoreDeclarationSort: true,
        ignoreMemberSort: false,
        memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
    }],
    'unicorn/prefer-node-protocol': 'error',
    'unicorn/no-this-assignment': 'error',
    'ag/no-accessors': 'error',
    'ag/no-direct-reexport': 'error',
    'ag/no-prototype-mutation': 'error',
    'ag/no-default-side-effects': 'error',
    'ag/prefer-array-from-map': 'error',
    'ag/require-docblock': 'error',
};
const guideTypeScriptAdditions: RuleMap = {
    'ag/enum-name': 'error',
    'ag/unknown-catch': 'error',
};

// The opt-in guideline policy resolves documented conflicts between guide prose and the sample in favor of prose.
const importOrder = (groups: unknown[], options: object = {}): RuleSetting => ['error', {
    groups,
    'newlines-between': 'always',
    alphabetize: { order: 'asc', caseInsensitive: true },
    ...options,
}];
const importGroups: Record<ImportGroups, RuleSetting> = {
    // The guide's example keeps built-in and package imports in one block, built-in imports first.
    // Project aliases ("internal") are not npm packages; they follow them, as in the "most far" to "most close" order.
    example: importOrder([['builtin', 'external'], 'internal', 'parent', ['sibling', 'index']], {
        pathGroups: [
            { pattern: 'node:*', group: 'external', position: 'before' },
            { pattern: 'node:*/**', group: 'external', position: 'before' },
        ],
        pathGroupsExcludedImportTypes: [],
        distinctGroup: false,
    }),
    // The guide's prose separates every listed category.
    prose: importOrder(['builtin', 'external', 'internal', 'parent', ['sibling', 'index']]),
};
// Tool directives are not comments that describe code (clause 17.2).
const COMMENT_DIRECTIVES = '^\\s*(?:oxlint-|@ts-)';
const guidelineAdditions: RuleMap = {
    'import/no-commonjs': 'error',
    'import/no-namespace': 'error',
    'import/prefer-default-export': 'off',
    'import/no-default-export': 'error',
    'import/order': importGroups.example,
    'line-comment-position': ['error', {
        ...(inheritedOptions('line-comment-position')[0] as object),
        ignorePattern: COMMENT_DIRECTIVES,
    }],
    // Clause 17.2 governs single-line comments; block comments keep their inherited freedom.
    'lines-around-comment': ['error', {
        beforeBlockComment: false,
        beforeLineComment: true,
        allowBlockStart: true,
        allowObjectStart: true,
        allowArrayStart: true,
        allowClassStart: true,
        ignorePattern: COMMENT_DIRECTIVES,
    }],
    'prefer-destructuring': ['error', {
        ...(inheritedOptions('prefer-destructuring')[0] as object),
        VariableDeclarator: { array: true, object: true },
    }, ...inheritedOptions('prefer-destructuring').slice(1)],
    'react/jsx-indent': ['error', 4],
    'react/jsx-indent-props': ['error', 4],
    'newline-per-chained-call': ['error', { ignoreChainWithDepth: 2 }],
    // Case labels are not statements; the clause 14.5 example puts braced cases back to back.
    'padding-line-between-statements': ['error',
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'any', prev: '*', next: ['case', 'default'] }],
    'id-length': ['error', { min: 2, properties: 'never' }],
    'max-len': ['error', {
        ...(inheritedOptions('max-len')[0] as object),
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
    }],
    'ag/no-multiline-string-concat': 'error',
    'ag/multiline-condition-layout': 'error',
    'ag/require-docblock': ['error', { lineCommentRuns: true }],
    'ag/constant-name': 'error',
    'ag/prefer-array-from': 'error',
    'ag/prefer-template-over-join': 'error',
    'ag/no-arguments': 'error',
    'ag/no-prototype-mutation': ['error', { calls: true }],
    'ag/docblock-spacing': 'error',
    // The prose has no exemptions: "Never mutate parameters" and "Use === and !==".
    'no-param-reassign': ['error', { props: true }],
    eqeqeq: ['error', 'always'],
    'no-implicit-coercion': ['error', ...inheritedOptions('no-implicit-coercion')],
    'import/no-duplicates': ['error', { 'prefer-inline': true }],
    // No clause asks for named function expressions; the guide's own examples use anonymous ones.
    'func-names': 'off',
};
const guidelineTypeScriptAdditions: RuleMap = {
    '@typescript-eslint/no-require-imports': 'error',
};

// Rules used by AdGuard projects that the guide does not require; opt-in through the adguard-projects profile.
const projectAdditions: RuleMap = {
    'jsdoc/require-description': 'error',
    'jsdoc/require-description-complete-sentence': 'error',
    'jsdoc/require-hyphen-before-param-description': ['error', 'never'],
    'jsdoc/require-throws': 'error',
    'jsdoc/sort-tags': 'error',
    'no-restricted-imports': ['error', {
        patterns: [{
            group: ['**/*-mv2', '**/*-mv3'],
            message: 'Do not import directly from MV2/MV3 implementations. Use the appropriate alias or index file instead.',
        }],
    }],
    'import/no-unassigned-import': ['error', { allow: ['**/*.pcss'] }],
    'import-newlines/enforce': ['error', { items: 3, 'max-len': 120 }],
    'boundaries/element-types': ['error', {
        default: 'allow',
        rules: [{
            from: 'test-folder',
            disallow: ['src-index'],
            message: 'Do not import directly from src/. Use specific submodules like src/utils instead.',
        }],
    }],
    'notice/notice': 'off',
    '@adguard/logger-context/require-logger-context': ['error', { contextModuleName: 'ext' }],
};
const projectTypeScriptAdditions: RuleMap = {
    'member-delimiter-style': 'error',
    '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    '@typescript-eslint/consistent-type-exports': 'error',
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/explicit-member-accessibility': ['error', {
        accessibility: 'explicit',
        overrides: {
            accessors: 'explicit',
            constructors: 'no-public',
            methods: 'explicit',
            properties: 'off',
            parameterProperties: 'explicit',
        },
    }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-var-requires': 'error',
    '@typescript-eslint/ban-ts-comment': 'error',
    '@typescript-eslint/dot-notation': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
};
const projectSettings: Record<string, unknown> = {
    // Default boundary elements (consumers override via settings).
    'boundaries/elements': [
        { type: 'src-index', pattern: 'src/index.ts', mode: 'file' },
        { type: 'test-folder', pattern: 'test', mode: 'folder' },
    ],
};

/**
 * Replace the options of a rule setting while keeping its severity.
 * @param setting - Original setting.
 * @param update - Derives new options from the original options.
 * @returns Setting with derived options.
 */
function withOptions(setting: RuleSetting, update: (options: unknown[]) => unknown[]): RuleSetting {
    return Array.isArray(setting) ? [setting[0], ...update(setting.slice(1))] : [setting, ...update([])];
}

interface Equivalent {
    target: string | null;
    reason: string;
    adapt?: (setting: RuleSetting) => RuleSetting;
}

const TYPESCRIPT_EXTENSIONS = {
    ts: 'never',
    tsx: 'never',
    mts: 'never',
    cts: 'never',
};

// "In TypeScript we use the same rules as in JavaScript": each entry selects a TypeScript-aware
// implementation of the same rule and options. Entries are limited to rules whose pinned JavaScript
// implementation reports valid TypeScript or ignores TypeScript syntax (see tests/typescript-preset.test.ts).
const TYPESCRIPT_EQUIVALENTS: Record<string, Equivalent> = {
    'no-undef': { target: null, reason: 'The TypeScript compiler reports unresolved names, including ambient types.' },
    'no-unused-vars': {
        target: 'eslint/no-unused-vars',
        reason: 'Understands type-only usage, signatures, and parameter properties.',
        adapt: (setting) => withOptions(setting, ([options]) => [{ caughtErrors: 'none', ...(options as object) }]),
    },
    'no-shadow': { target: 'eslint/no-shadow', reason: 'Ignores type-space parameters in signatures.' },
    'no-useless-constructor': {
        target: 'eslint/no-useless-constructor',
        reason: 'Keeps constructors that declare parameter properties or accessibility.',
    },
    'no-empty-function': {
        target: 'eslint/no-empty-function',
        reason: 'Understands parameter-property constructors and overload signatures.',
    },
    'no-dupe-class-members': { target: 'eslint/no-dupe-class-members', reason: 'Accepts method overload signatures.' },
    'class-methods-use-this': {
        target: 'eslint/class-methods-use-this',
        reason: 'Exempts override methods, which a base class requires to be instance methods.',
        adapt: (setting) => withOptions(setting, ([options]) => [{
            ...(options as object),
            ignoreOverrideMethods: true,
        }]),
    },
    'space-before-function-paren': {
        target: 'ag-style/space-before-function-paren',
        reason: 'Checks overload signatures, ambient functions, and abstract methods.',
    },
    'keyword-spacing': { target: 'ag-style/keyword-spacing', reason: 'Checks `as` and `satisfies`.' },
    'brace-style': { target: 'ag-style/brace-style', reason: 'Checks namespace bodies.' },
    'no-redeclare': {
        target: 'ag-ts/no-redeclare',
        reason: 'Accepts overloads and declaration merges that TypeScript permits.',
    },
    'no-array-constructor': {
        target: 'eslint/no-array-constructor',
        reason: 'Accepts explicitly typed constructors such as `new Array<string>()`.',
    },
    'default-param-last': { target: 'eslint/default-param-last', reason: 'Treats optional parameters like defaults.' },
    'no-use-before-define': {
        target: 'eslint/no-use-before-define',
        reason: 'Ignores type-only references such as `typeof` queries.',
    },
    indent: { target: 'ag-style/indent', reason: 'Indents interfaces, enums, and type annotations.' },
    'comma-dangle': {
        target: 'ag-style/comma-dangle',
        reason: 'Also checks enums, type parameters, and tuples with the array setting, as airbnb-typescript does.',
        adapt: (setting) => withOptions(setting, ([options]) => {
            const base = typeof options === 'string'
                ? Object.fromEntries(['arrays', 'objects', 'imports', 'exports', 'functions'].map((key) => [key, options]))
                : (options as Record<string, unknown>);
            return [{
                ...base,
                enums: base.arrays,
                generics: base.arrays,
                tuples: base.arrays,
            }];
        }),
    },
    'comma-spacing': {
        target: 'ag-style/comma-spacing',
        reason: 'Checks type arguments and accepts the TSX `<T,>` form.',
    },
    'key-spacing': { target: 'ag-style/key-spacing', reason: 'Checks interface and type literal members.' },
    'lines-between-class-members': {
        target: 'ag-style/lines-between-class-members',
        reason: 'Accepts adjacent overload signatures.',
    },
    'object-curly-spacing': { target: 'ag-style/object-curly-spacing', reason: 'Checks type literals.' },
    semi: { target: 'ag-style/semi', reason: 'Checks type aliases, ambient declarations, and abstract members.' },
    'space-before-blocks': {
        target: 'ag-style/space-before-blocks',
        reason: 'Checks interface, enum, and module bodies.',
    },
    'space-infix-ops': {
        target: 'ag-style/space-infix-ops',
        reason: 'Checks union and intersection types and enum initializers.',
    },
    'lines-around-comment': {
        target: 'ag-style/lines-around-comment',
        reason: 'Treats interface, type literal, enum, and namespace bodies like blocks.',
        adapt: (setting) => withOptions(setting, ([options]) => {
            const allow = (options ?? {}) as Record<string, unknown>;
            return [{
                ...allow,
                allowInterfaceStart: allow.allowBlockStart,
                allowTypeStart: allow.allowBlockStart,
                allowEnumStart: allow.allowBlockStart,
                allowModuleStart: allow.allowBlockStart,
            }];
        }),
    },
    'import/extensions': {
        target: 'ag-import/extensions',
        reason: 'TypeScript module specifiers omit TypeScript extensions as well.',
        adapt: (setting) => withOptions(setting, ([mode, options]) => [
            mode,
            { ...(options as object), ...TYPESCRIPT_EXTENSIONS },
        ]),
    },
    'import/no-extraneous-dependencies': {
        target: 'ag-import/no-extraneous-dependencies',
        reason: 'Adds TypeScript variants of the development file globs, as airbnb-typescript does.',
        adapt: (setting) => withOptions(setting, ([options]) => {
            const { devDependencies } = options as { devDependencies: string[] };
            return [{
                ...(options as object),
                devDependencies: devDependencies.flatMap((glob) => {
                    const typed = glob.replace(/\bjs(x?)\b/gu, 'ts$1');
                    return typed === glob ? [glob] : [glob, typed];
                }),
            }];
        }),
    },
    'react/jsx-filename-extension': {
        target: 'ag-react/jsx-filename-extension',
        reason: 'Allows JSX in .tsx files.',
        adapt: (setting) => withOptions(setting, () => [{ extensions: ['.jsx', '.tsx'] }]),
    },
    'jsdoc/check-tag-names': {
        target: 'ag-jsdoc/check-tag-names',
        reason: 'Uses TypeScript tag semantics.',
        adapt: (setting) => withOptions(setting, () => [{ typed: true }]),
    },
    'jsdoc/no-types': {
        target: 'ag-jsdoc/no-types',
        reason: 'Types come from TypeScript annotations rather than duplicated JSDoc types.',
        adapt: () => 'error',
    },
    ...Object.fromEntries([
        'jsdoc/require-param-type',
        'jsdoc/require-property-type',
        'jsdoc/require-returns-type',
        'jsdoc/require-next-type',
        'jsdoc/require-yields-type',
        'jsdoc/require-throws-type',
        'jsdoc/no-undefined-types',
    ].map((name) => [name, { target: null, reason: 'Types come from TypeScript annotations.' }])),
};

const typescriptPlugin = await import('../packages/oxlint-plugin/src/typescript');
const typescriptTargets = new Set([
    ...native,
    ...Object.keys(style.rules).map((name) => `ag-style/${name}`),
    ...Object.keys(typescriptPlugin.rules).map((name) => `ag-ts/${name}`),
]);

const extraClauses: Record<string, string[]> = {
    'types--primitives': [],
    'references--prefer-const': ['prefer-const', 'no-const-assign', 'no-var'],
    'references--block-scope': ['no-undef'],
    'arrays--mapping': ['ag/prefer-array-from-map'],
    'strings--line-length': ['max-len', 'no-useless-concat', 'no-multi-str'],
    'functions--in-blocks': ['no-loop-func', 'no-inner-declarations'],
    'functions--arguments-shadow': ['no-shadow-restricted-names'],
    'es6-default-parameters': ['no-param-reassign'],
    'functions--default-side-effects': ['ag/no-default-side-effects'],
    'constructors--use-class': ['ag/no-prototype-mutation'],
    'constructors--extends': ['ag/no-prototype-mutation'],
    'modules--use-them': ['import/no-commonjs', 'import/no-amd'],
    'modules--no-wildcard': ['import/no-namespace'],
    'modules--no-export-from-import': ['ag/no-direct-reexport'],
    'modules--no-duplicate-imports': ['no-duplicate-imports', 'import/no-duplicates'],
    'modules--prefer-named-export': ['import/prefer-default-export'],
    'modules--import-node-protocol': ['unicorn/prefer-node-protocol'],
    'modules--import-member-order': ['sort-imports'],
    'properties--bracket': ['dot-notation'],
    'control-statements': ['operator-linebreak'],
    'control-statement--value-selection': ['no-unused-expressions'],
    'comments--multiline': ['ag/require-docblock'],
    'comments--singleline': ['line-comment-position', 'lines-around-comment'],
    'comments-jsdoc': ['jsdoc/require-file-overview'],
    'whitespace--spaces': ['indent', 'react/jsx-indent', 'react/jsx-indent-props'],
    'whitespace--after-blocks': ['padding-line-between-statements'],
    'coercion--comment-deviations': ['no-bitwise'],
    'naming--self-this': ['unicorn/no-this-assignment'],
    'accessors--no-getters-setters': ['ag/no-accessors'],
    'typescript--enum-naming-conventions': ['ag/enum-name'],
    'typescript--caught-error-type': ['ag/unknown-catch'],
};

// Rules that the guideline policy adds to a clause's compatibility rules.
const guidelineClauses: Record<string, string[]> = {
    'arrays--from-array-like': ['ag/prefer-array-from'],
    'strings--line-length': ['max-len', 'no-multi-str', 'ag/no-multiline-string-concat'],
    'es6-template-literals': ['prefer-template', 'template-curly-spacing', 'ag/prefer-template-over-join'],
    'es6-rest': ['prefer-rest-params', 'ag/no-arguments'],
    'modules--use-them': ['import/no-commonjs', 'import/no-amd', '@typescript-eslint/no-require-imports'],
    'modules--prefer-named-export': ['import/no-default-export'],
    'control-statements': ['operator-linebreak', 'ag/multiline-condition-layout'],
    'comments--spaces': ['spaced-comment', 'ag/docblock-spacing'],
    'coercion--strings': ['no-new-wrappers', 'no-implicit-coercion'],
    'coercion--numbers': ['radix', 'no-new-wrappers', 'no-implicit-coercion'],
    'naming--constants': ['ag/constant-name'],
};

const manual: Record<string, string> = {
    'types--primitives': 'Educational semantics; supported browser targets must be selected by the consumer.',
    'types--complex': 'Educational explanation of reference values.',
    'es6-array-spreads': 'Recognizing arbitrary copying algorithms requires semantic intent; reviewed manually.',
    'arrays--from-iterable':
        'An unknown JavaScript value may be array-like rather than iterable; no speculative rewrite.',
    'arrays--from-array-like':
        'Array.from for array-like values is not checked by the sample; the guideline policy reports '
        + '`Array.prototype.slice.call(value)`.',
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

// Clauses whose linked rules are active but do not enforce every stated requirement.
const partial: Record<Policy, Record<string, string>> = {
    compatibility: {
        'objects--rest-spread':
            'prefer-object-spread reports `Object.assign` whose first argument is an object literal; mutating '
            + '`Object.assign(target, ...)` and omitting properties with `delete` instead of rest syntax remain '
            + 'reviewable.',
        'functions--default-side-effects':
            'ag/no-default-side-effects reports assignments, updates, and `delete` in default values; side '
            + 'effects of calls are not analyzed.',
        'functions--spread-vs-apply':
            'prefer-spread reports `fn.apply(receiver, args)`; constructor application through '
            + '`Function.prototype.bind.apply` remains reviewable.',
        'naming--camelCase':
            'camelcase reports underscores; the capitalization of functions and instances remains reviewable.',
        'es6-template-literals':
            'prefer-template reports concatenation; building strings with `[...].join()` is reported only by the '
            + 'guideline policy.',
        'es6-rest':
            'prefer-rest-params allows property access such as `arguments.length`; the guideline policy reports '
            + 'it.',
        'functions--mutate-params':
            'Inherited no-param-reassign exempts parameters such as `acc`, `e`, and `res` and cannot see '
            + 'mutation through method calls; the guideline policy removes the exemptions.',
        'constructors--use-class':
            'ag/no-prototype-mutation reports assignments to prototypes; the guideline policy also reports '
            + '`Object.assign` or `Object.defineProperty` on a prototype. Plain constructor functions remain '
            + 'reviewable.',
        'constructors--extends':
            'ag/no-prototype-mutation reports prototype assignments; the guideline policy also reports '
            + '`Object.setPrototypeOf` and `inherits`. Other manual inheritance remains reviewable.',
        'comparison--eqeqeq':
            'Inherited eqeqeq allows `== null` and `!= null`; the guideline policy does not.',
        'comments--spaces':
            'spaced-comment checks the comment opener; text directly after the `*` of a JSDoc line is reported '
            + 'only by the guideline policy.',
        'coercion--strings':
            'no-new-wrappers rejects `new String()`; Airbnb disables no-implicit-coercion, which the guideline '
            + 'policy enables for `\'\' + value`.',
        'coercion--numbers':
            'radix and no-new-wrappers are enforced; Airbnb disables no-implicit-coercion, which the guideline '
            + 'policy enables for `+value`.',
        'destructuring--array':
            'Inherited prefer-destructuring checks assignments but not declarations such as `const first = arr[0]`; '
            + 'the guideline policy checks both.',
        'modules--import-grouping':
            'Inherited import/order places built-in, package, and internal imports first, but does not require blank '
            + 'lines between groups or separate parent from sibling imports; use the guideline policy.',
        'comments--multiline':
            'Multiline /* */ blocks are rejected; runs of // line comments (the clause example) are rejected only by '
            + 'the guideline policy.',
        'control-statements':
            'operator-linebreak puts logical operators first; starting the condition on its own line is enforced by '
            + 'the guideline policy.',
        'whitespace--spaces':
            'indent requires four spaces; inherited react/jsx-indent and react/jsx-indent-props require two-space '
            + 'JSX, which the guideline policy changes to four.',
        'whitespace--chains':
            'Inherited newline-per-chained-call allows four calls on one line; the guideline policy allows two.',
    },
    guideline: {
        'objects--rest-spread':
            'prefer-object-spread reports `Object.assign` whose first argument is an object literal; mutating '
            + '`Object.assign(target, ...)` and omitting properties with `delete` instead of rest syntax remain '
            + 'reviewable.',
        'functions--default-side-effects':
            'ag/no-default-side-effects reports assignments, updates, and `delete` in default values; side '
            + 'effects of calls are not analyzed.',
        'functions--spread-vs-apply':
            'prefer-spread reports `fn.apply(receiver, args)`; constructor application through '
            + '`Function.prototype.bind.apply` remains reviewable.',
        'naming--camelCase':
            'camelcase reports underscores; the capitalization of functions and instances remains reviewable.',
        'functions--mutate-params':
            'no-param-reassign reports property writes to any parameter; mutation through method calls such as '
            + '`list.push()` remains reviewable.',
        'constructors--use-class':
            'ag/no-prototype-mutation reports prototype writes, including `Object.assign` and '
            + '`Object.defineProperty` on a prototype; plain constructor functions remain reviewable.',
        'constructors--extends':
            'ag/no-prototype-mutation reports prototype writes, `Object.setPrototypeOf`, and `inherits`; other '
            + 'manual inheritance remains reviewable.',
        'modules--use-them':
            'import/no-commonjs rejects `require` and `module.exports`, and typescript/no-require-imports '
            + 'rejects `import x = require()`; TypeScript `export =` remains reviewable.',
        'control-statements':
            'ag/multiline-condition-layout checks multiline conditions; whether a single-line condition is too '
            + 'long to read remains reviewable.',
        'comments--singleline':
            'line-comment-position and lines-around-comment place `//` comments; single-line `/* */` comments '
            + 'remain reviewable.',
        'whitespace--chains':
            'newline-per-chained-call breaks chains longer than two calls; the clause\'s own d3 example keeps '
            + '`.enter().append()` on one line, which the rule rejects.',
        'whitespace--max-len':
            'max-len exempts strings and template literals, but it exempts the whole line that contains one, so '
            + 'long code on such a line is not reported.',
        'whitespace--after-blocks':
            'padding-line-between-statements requires a blank line after block-like statements; blank lines between '
            + 'multiline members of object and array literals remain reviewable.',
        'naming--constants':
            'ag/constant-name requires UPPER_SNAKE_CASE for module-level const bindings initialized with primitive '
            + 'literals; other semantic constants remain reviewable.',
    },
};

// Clauses whose explanation is more specific than the enforcement category.
const reasons: Record<Policy, Record<string, string>> = {
    compatibility: {
        'modules--no-duplicate-imports':
            'Airbnb disables no-duplicate-imports in favor of import/no-duplicates, which enforces the clause.',
        'modules--import-order':
            'Inherited import/order options do not alphabetize; the guideline policy orders imports by path.',
        'comments-jsdoc': 'The recommended eslint-plugin-jsdoc configuration plus jsdoc/require-file-overview.',
        'strings--line-length':
            'The sample max-len has no ignoreStrings, so the clause\'s good example (a long single-line string) is '
            + 'rejected while strings broken with concatenation pass; backslash continuations are rejected by '
            + 'no-multi-str. The guideline policy enforces the clause.',
        'whitespace--max-len':
            'The sample max-len does not exempt long strings as the clause notes; the guideline policy does.',
        'whitespace--block-spacing':
            'block-spacing requires spaces inside single-line blocks; the sample brace-style (allowSingleLine: false, '
            + 'clause 15.1) rejects single-line blocks, including this clause\'s good example.',
        'commas--dangling':
            'comma-dangle requires trailing commas in multiline lists; like upstream, it also requires one after a '
            + 'trailing spread argument, which the clause\'s last example omits.',
        'coercion--comment-deviations':
            'no-bitwise reports every bitwise operation; a justified deviation is a directive that names the '
            + 'implementation, e.g. `// oxlint-disable-next-line ag-compat/no-bitwise -- reason`.',
        'typescript--enum-naming-conventions':
            'Enum and member casing is enforced. Singular English names require review; values are unrestricted.',
        'typescript--caught-error-type':
            'Explicit any is rejected on every catch binding; unannotated catches are unknown under the shared '
            + 'strict compiler settings.',
    },
    guideline: {
        'modules--no-duplicate-imports':
            'import/no-duplicates with prefer-inline also merges type-only and value imports of one path.',
        'modules--import-grouping':
            'import/order requires blank lines between groups. `importGroups: example` follows the clause example '
            + '(built-in imports first, then packages, in one block); `prose` separates every listed category.',
        'modules--import-order': 'import/order alphabetizes imports by path within each group.',
        'modules--prefer-named-export':
            'import/prefer-default-export is disabled and import/no-default-export rejects default exports.',
        'strings--line-length':
            'max-len ignores strings and template literals; ag/no-multiline-string-concat rejects strings broken '
            + 'across lines with concatenation.',
        'whitespace--max-len': 'max-len exempts strings and template literals, as the clause notes.',
    },
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
        guideline: { rules: [...new Set(guidelineClauses[id] ?? linked)], enforcement: 'manual', reason: '' },
    };
});

const known = new Set([
    ...Object.keys(baseline),
    ...Object.keys(guideAdditions),
    ...Object.keys(guideTypeScriptAdditions),
    ...Object.keys(guidelineAdditions),
    ...Object.keys(guidelineTypeScriptAdditions),
]);
clauses.forEach((clause) => [...clause.rules, ...clause.guideline.rules].forEach((rule) => {
    if (!known.has(rule)) {
        throw new Error(`Clause ${clause.id} links unmapped rule ${rule}`);
    }
}));

const mappings: Mapping[] = [];
const layers: Record<Scope, { rules: RuleMap; typescriptRules: RuleMap }> = {
    base: { rules: {}, typescriptRules: {} },
    guideline: { rules: {}, typescriptRules: {} },
    'adguard-projects': { rules: {}, typescriptRules: {} },
};

/**
 * Choose the concrete provider for a source rule.
 * @param source - Original rule identifier.
 * @returns Target rule and implementation kind.
 */
function resolveTarget(source: string): { target: string; implementation: Mapping['implementation'] } {
    if (source.startsWith('ag/')) {
        return { target: source, implementation: 'custom' };
    }
    const prefixes: [string, Provider | null, string][] = [
        ['jsdoc/', jsdoc, 'ag-jsdoc/'],
        ['react/', react, 'ag-react/'],
        ['jsx-a11y/', accessibility, 'ag-a11y/'],
        ['import/', imports, 'ag-import/'],
        ['import-newlines/', newlines, 'ag-newlines/'],
        ['boundaries/', boundaries, 'ag-boundaries/'],
        ['notice/', notice, 'ag-notice/'],
        ['@adguard/logger-context/', logger, 'ag-logger/'],
    ];
    if (builtinRules.has(source)) {
        return { target: `ag-compat/${source}`, implementation: 'javascript' };
    }
    for (const [prefix, provider, namespace] of prefixes) {
        const name = source.slice(prefix.length);
        if (source.startsWith(prefix) && provider?.rules[name]) {
            return { target: `${namespace}${name}`, implementation: 'javascript' };
        }
    }
    if (source.startsWith('@typescript-eslint/') && native.has(`typescript/${source.slice('@typescript-eslint/'.length)}`)) {
        return { target: `typescript/${source.slice('@typescript-eslint/'.length)}`, implementation: 'native' };
    }
    if (style.rules[source]) {
        return { target: `ag-style/${source}`, implementation: 'javascript' };
    }
    if (native.has(source)) {
        return { target: source, implementation: 'native' };
    }
    throw new Error(`No implementation for rule ${source}`);
}

/**
 * Record a source rule in one configuration layer, refusing to silently drop an enabled setting.
 * @param source - Original rule identifier.
 * @param originalSetting - Resolved setting.
 * @param origin - Source of the setting.
 * @param scope - Configuration layer.
 * @param language - Restrict the rule to TypeScript files.
 */
function mapRule(
    source: string,
    originalSetting: RuleSetting,
    origin: string,
    scope: Scope,
    language?: 'typescript',
): void {
    let setting = originalSetting;
    if (source === 'import/no-cycle' && Array.isArray(setting)) {
        const options = { ...setting[1] };
        if (options.maxDepth === '∞') {
            delete options.maxDepth;
        }
        setting = [setting[0], options];
    }
    const disabled = severity(setting) === 0;
    const scoped = scope === 'base' ? {} : { scope };
    if (disabled && scope === 'base') {
        mappings.push({
            source, target: null, setting, implementation: 'disabled', origin,
        });
    } else {
        const { target, implementation } = resolveTarget(source);
        const layer = layers[scope];
        const rules = language === 'typescript' ? layer.typescriptRules : layer.rules;
        if (rules[target] !== undefined && JSON.stringify(rules[target]) !== JSON.stringify(setting)) {
            throw new Error(`Conflicting provider mapping for ${source}: ${target}`);
        }
        rules[target] = setting;
        mappings.push({
            source,
            target,
            setting,
            implementation: disabled ? 'disabled' : implementation,
            origin,
            ...scoped,
            ...(language ? { language } : {}),
            ...(typedNative.has(target) ? { requiresTypeInfo: true } : {}),
        });
    }
    const equivalent = TYPESCRIPT_EQUIVALENTS[source];
    if (equivalent && !language) {
        const mapping = mappings.at(-1)!;
        if (equivalent.target !== null && !typescriptTargets.has(equivalent.target)
            && equivalent.target !== resolveTarget(source).target) {
            throw new Error(`Missing TypeScript implementation ${equivalent.target} for ${source}`);
        }
        const typed = equivalent.adapt ? equivalent.adapt(setting) : setting;
        const typedSetting = equivalent.target === null || (disabled && !equivalent.adapt) ? 'off' : typed;
        mapping.typescript = {
            target: equivalent.target,
            setting: typedSetting,
            implementation: equivalent.target === null || severity(typedSetting) === 0
                ? 'disabled'
                : equivalent.target.startsWith('eslint/') ? 'native' : 'javascript',
            reason: equivalent.reason,
        };
        const layer = layers[scope].typescriptRules;
        if (mapping.target && mapping.target !== equivalent.target) {
            layer[mapping.target] = 'off';
        }
        // A rule disabled in JavaScript needs no TypeScript entry unless the equivalent enables it.
        if (equivalent.target && (mapping.target !== null || severity(typedSetting) > 0)) {
            layer[equivalent.target] = typedSetting;
        }
    }
}

Object.entries(guideAdditions).forEach(([name]) => {
    if (baseline[name] !== undefined && severity(baseline[name]) > 0) {
        throw new Error(`Guide addition ${name} would replace an enabled sample setting`);
    }
    delete baseline[name];
});
Object.entries(baseline).forEach(([name, setting]) => mapRule(name, setting, origins[name] ?? 'baseline', 'base'));
Object.entries(guideAdditions).forEach(([name, setting]) => mapRule(name, setting, 'Javascript.md', 'base'));
Object.entries(guideTypeScriptAdditions).forEach(([name, setting]) => {
    mapRule(name, setting, 'Javascript.md', 'base', 'typescript');
});
Object.entries(guidelineAdditions).forEach(([name, setting]) => {
    mapRule(name, setting, 'Javascript.md', 'guideline');
});
Object.entries(guidelineTypeScriptAdditions).forEach(([name, setting]) => {
    mapRule(name, setting, 'Javascript.md', 'guideline', 'typescript');
});
Object.entries(projectAdditions).forEach(([name, setting]) => {
    mapRule(name, setting, 'adguard-projects', 'adguard-projects');
});
Object.entries(projectTypeScriptAdditions).forEach(([name, setting]) => {
    mapRule(name, setting, 'adguard-projects', 'adguard-projects', 'typescript');
});
Object.keys(TYPESCRIPT_EQUIVALENTS).forEach((source) => {
    if (!mappings.some((mapping) => mapping.source === source)) {
        throw new Error(`TypeScript equivalent for unmapped rule ${source}`);
    }
});

/**
 * Classify a clause for one policy from the rules active in that policy.
 * @param clause - Guideline clause.
 * @param disposition - Rules linked for this policy.
 * @param policy - Policy being described.
 * @returns Enforcement and explanation.
 */
function classify(clause: Clause, disposition: Disposition, policy: Policy): Disposition {
    const { rules } = disposition;
    if (clause.id.startsWith('typescript--tsconfig')) {
        return {
            rules,
            enforcement: 'compiler',
            reason: 'Enforced by the shared tsconfig and verified with `ag-oxlint-config --check-tsconfig`.',
        };
    }
    const active = rules.map((rule) => {
        const candidates = mappings.filter((mapping) => mapping.source === rule
            && (mapping.scope === undefined || (policy === 'guideline' && mapping.scope === 'guideline')));
        return candidates.at(-1);
    });
    const enabled = active.filter((mapping) => mapping && mapping.implementation !== 'disabled');
    const override = reasons[policy][clause.id]
        ?? (policy === 'guideline' ? reasons.compatibility[clause.id] : undefined);
    if (rules.length === 0 || enabled.length === 0) {
        if (rules.length > 0) {
            return {
                rules,
                enforcement: 'overridden',
                reason: override ?? `Sample precedence: ${rules.join(', ')} retains its inherited/explicit options and severity.`,
            };
        }
        return { rules, enforcement: 'manual', reason: manual[clause.id] ?? '' };
    }
    const partialReason = partial[policy][clause.id];
    if (partialReason) {
        return { rules, enforcement: 'partial', reason: partialReason };
    }
    // The comment-deviation clause is satisfied by a justified directive; the others lose to sample options.
    const forced = clause.id === 'coercion--comment-deviations' || (policy === 'compatibility'
        && ['modules--prefer-named-export', 'strings--line-length', 'modules--import-order', 'whitespace--max-len']
            .includes(clause.id));
    if (forced || (enabled.length < rules.length && !override)) {
        return {
            rules,
            enforcement: 'overridden',
            reason: override ?? `Sample precedence: ${rules.join(', ')} retains its inherited/explicit options and severity.`,
        };
    }
    const kinds = enabled.map((mapping) => mapping!.implementation);
    return {
        rules,
        enforcement: kinds.includes('custom') ? 'custom' : kinds.includes('javascript') ? 'javascript' : 'native',
        reason: override ?? 'Configured rule enforces the linked syntactic requirement; semantic intent remains reviewable.',
    };
}

clauses.forEach((clause) => {
    const compatibility = classify(clause, clause, 'compatibility');
    Object.assign(clause, compatibility);
    clause.guideline = classify(clause, clause.guideline, 'guideline');
    [compatibility, clause.guideline].forEach((disposition) => {
        if (!disposition.reason) {
            throw new Error(`Unclassified source clause: ${clause.id}`);
        }
    });
});

const catalog: Catalog = {
    sources: hashes,
    baseline,
    settings,
    env,
    mappings,
    clauses,
    rules: layers.base.rules,
    typescriptRules: layers.base.typescriptRules,
    policies: {
        guideline: { ...layers.guideline, settings: {}, importGroups },
    },
    profiles: {
        'adguard-projects': { ...layers['adguard-projects'], settings: projectSettings },
    },
};

const cell = (text: string) => text.replaceAll('|', '\\|');
const ruleList = (rules: string[]) => rules.map((rule) => `\`${rule}\``).join(', ');
const scopeLabel = (mapping: Mapping) => mapping.scope ?? (mapping.language === 'typescript' ? 'base (TypeScript)' : 'base');
const report = [
    '# Guideline coverage',
    '',
    'Generated by `pnpm catalog:generate`. The default `compatibility` policy gives the sample configuration and its '
    + 'inherited disabled rules precedence over prose. The opt-in `guideline` policy enforces the prose where the two '
    + 'conflict. `partial` marks clauses whose rules enforce only part of the stated requirement.',
    '',
    '| Clause | Compatibility | Guideline | Rules | Interpretation |',
    '| --- | --- | --- | --- | --- |',
    ...clauses.map((clause) => {
        const sameRules = JSON.stringify(clause.rules) === JSON.stringify(clause.guideline.rules);
        const guidelineRules = `guideline: ${ruleList(clause.guideline.rules)}`;
        const rules = sameRules ? ruleList(clause.rules) : [ruleList(clause.rules), guidelineRules].filter(Boolean).join('; ');
        const interpretation = clause.reason === clause.guideline.reason
            ? clause.reason
            : `${clause.reason} Guideline: ${clause.guideline.reason}`;
        return `| [${clause.number} ${clause.id}](reference/Javascript.md#${clause.id})`
            + ` | ${clause.enforcement} | ${clause.guideline.enforcement} | ${rules} | ${cell(interpretation)} |`;
    }),
    '',
    '## Resolved rule mappings',
    '',
    'Scope `base` is always active, `guideline` is added by `policy: \'guideline\'`, and `adguard-projects` by '
    + '`profile: \'adguard-projects\'`. The TypeScript column names the implementation used for TypeScript files when it '
    + 'differs from the JavaScript one.',
    '',
    '| Source rule | Oxlint rule | Provider | Setting | Origin | Scope | TypeScript | Type information |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...mappings.map(
        (mapping) => `| ${mapping.source} | ${mapping.target ?? 'disabled'} | ${mapping.implementation}`
            + ` | \`${cell(JSON.stringify(mapping.setting))}\` | ${mapping.origin} | ${scopeLabel(mapping)}`
            + ` | ${mapping.typescript ? `${mapping.typescript.target ?? 'disabled'}: ${cell(mapping.typescript.reason)}` : ''}`
            + ` | ${mapping.requiresTypeInfo ? 'opt-in required' : ''} |`,
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
    `Catalog: ${clauses.length} clauses; ${Object.keys(catalog.rules).length} enabled rules; generate.ts\n`,
);
