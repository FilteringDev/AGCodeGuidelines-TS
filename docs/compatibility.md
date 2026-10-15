# Consumer compatibility and acceptance

## Support boundary

Development uses Node `^24.20.0`, pnpm `12.3.4` and TypeScript `7.0.2`.
Packed libraries support Node `>=22.12.0` and exactly Oxlint `1.82.0`.
The minimum-runtime lane installs the real tarballs with Node `22.12.0`,
pnpm `10.33.4`, strict engine/peer checks and TypeScript `5.9.3`. It exercises
public APIs, every provider entry, native lint and NodeNext declarations.
The ordinary packed suite also exercises TS5 declarations and the separately
installed optional `oxlint-tsgolint@7.0.2002` service.

Syntax-only consumers need neither TS7 nor that service. Compiler checks and
existing type-aware ESLint checks retain their owners. No TS upgrade, application
strictness change or removal of an existing check is required.

`compatibility` and `guideline` are policy choices, while `guide` and
`adguard-projects` are profiles. Neither the stricter policy nor the project
profile is implicitly enabled during compatibility translation.

## Explicit ownership

`resolveRule()` and `createConfig()` retain their existing targets and defaults.
`createConfig()` still returns independent, mutable settings and registers all
providers, so callers can add custom rules after construction.

`resolveRuleDetailed()` adds a disposition, cloned original `sourceSetting`,
language and context, alias metadata, and any tested native candidate.
Dispositions are `native`, `javascript`, `type-aware`, `compiler`, `manual`,
`disabled` and `unsupported`. Manual guideline clause IDs can be queried too.
`listRuleOwnership(rules, options)` enumerates exactly the requested rules;
it never activates a preset. `catalog.inventory` enumerates every mapping,
TS replacement and alias. Candidate existence is not proof of parity.

```ts
import { createCompatibilityConfig } from '@agcodeguidelines/oxlint-config';

const result = createCompatibilityConfig({
    language: 'typescript',
    rules: { 'no-debugger': 'warn', 'no-sparse-arrays': 'off' },
    context: { files: ['src/**'], excludedFiles: ['src/generated/**'] },
    ignorePatterns: ['private/**'],
    acceptNativeDifferences: true,
});
```

This translates **one already resolved effective configuration group**, not an
ESLint config hierarchy. Use the consumer's installed ESLint version to resolve
its files, ignores, settings, inherited options, nested resets and flat/legacy
configs before forming disjoint groups. Run the returned config only on that
group's files. Do not concatenate overlapping groups or globally disable an
ESLint rule simply because it transfers in a different group.

The result contains `config`, `ownership` and `fallback`. Preserve fallback
checks in ESLint or the compiler, including warning-level checks. Keep source
off entries in the ownership report. The generated config starts with all
categories off and never substitutes the shared preset for the requested rules.
Language, environments, globals and file/exclusion scopes are explicit. Unknown identifiers, unverified
options and consumer settings fail closed. Exact recorded preset-option tuples
and the existing bounded compatibility schemas can be resolved; schema acceptance
alone does not establish consumer-specific behavioral parity.

Parser options and explicit sourceType assumptions currently remain fallback
obligations, not silently translated guarantees. Consumer-specific settings
remain fallback unless the selected no-options candidate is independent of them.
Typed rules remain fallback unless their separate service is explicitly enabled.
This API is not evidence that a complete consumer config is transferable.

`finalizeProviders(config)` clones an explicit finalized configuration, scans
root and override rules, and selects needed named providers. It rejects unresolved
inheritance. Unnamed string providers remain registered because their namespace
cannot be safely inferred. Re-finalize after adding rules, or keep the existing
factory's all-provider behavior. Provider-local override registrations are not
optimized by this helper; callers must resolve them before finalization.

Oxlint validates even disabled custom rule identifiers. When a whole named
provider is unused, finalization omits its redundant off entries from the runtime
copy so the provider can be absent. It never enables them, and the original
config and source ownership decisions retain their off settings. If an override
enables that provider, the root off mask is retained.

## Native evidence and suppressions

The pinned upstream ESLint fixtures are compared with real `ag-compat` and
Oxlint native processes. All three candidates accept no rule options. The
current corpus has matching diagnostic counts, but not exact diagnostics:

| Source | Native target | Difference requiring explicit acceptance |
| --- | --- | --- |
| `no-debugger` | `eslint/no-debugger` | Message wording |
| `no-duplicate-case` | `eslint/no-duplicate-case` | Messages, labels and ranges |
| `no-sparse-arrays` | `eslint/no-sparse-arrays` | Messages, labels and ranges |

Exact differences are checked in the native parity snapshots. Additional
JS/TS/TSX tests cover warnings, disabled rules and both ESLint/Oxlint suppression
directives, including inline and next-line comments. Safe `--fix` checks confirm
the tested candidates do not introduce an automatic source rewrite. This does
not establish parity for every possible program/parser or unsafe suggestion.
Other inventory candidates remain unverified until their option/context suites
pass. Legacy `ag-compat` exports are retained.

Only `acceptNativeDifferences: true` selects these native candidates. It is an
explicit diagnostic migration decision, not a promise of identical output.
Rewrite transferred `ag-compat/<rule>` suppressions to `eslint/<rule>` after
review; aliases do not rewrite comments. Recheck file, block, inline and next-line
suppression behavior against the exact owner. Never apply a prefix-only rewrite
to untransferred rules. Test filenames with spaces and apostrophes using argument
arrays, without constructing shell command strings.

## Consumer exception matrix

All entries below remain compatibility obligations. Unless independently tested
and explicitly transferred by the consumer, existing ESLint/compiler checks own
them. Mapping availability does not enable a rule or prove option parity.

### VPN / AG-59299

| Boundary | Required retained behavior |
| --- | --- |
| Airbnb/TS/React | Existing options, severities and ownership |
| Source-only returns | Explicit return types with `allowHigherOrderFunctions` |
| Accessibility | Different constructors, methods, properties, accessors and parameter properties |
| Indentation | Decorated `PropertyDefinition` and value exceptions; existing JSX owner |
| Imports | React-like packages before `@adguard/*`; separate styles; side-effect `.pcss`; three-item/120-character newlines |
| Line length | Exact URL, string, template and regexp exceptions |
| JSDoc | No-hyphen parameter/returns/throws/property descriptions; source-only returns exceptions for getters/ReactElement |
| Logger | `contextModuleName: 'vpn'`, `loggerVariableName: 'log'` remain unverified custom options |
| Types and files | Existing typed rules and `tsc --project tsconfig.eslint.json --noEmit`; private/generated/build ignores and staged filtering |

### Browser / AG-59298

| Boundary | Required retained behavior |
| --- | --- |
| Copyright | Explicitly requested `notice/notice` regex, template and replacement; not enabled by mapping |
| Module restrictions | Wildcard exports; MV2/MV3 direct-import checks and test/version-specific exemptions |
| Nested scopes | Background, schema, tools, pages and tests retain distinct JSDoc, severity, JSX/decorator and path settings |
| Logger and styles | `contextModuleName: 'ext'` and filename scope; stylesheet/theme side effects |
| Files and warnings | Root/ESLint ignores, zero-warning contract and both MV TypeScript checks |
| Staged files | ESLint ignore filtering, argv-safe spaces/apostrophes, and only the owner of each file/rule |
| Unrelated gates | Keep tests and existing owners; do not fix unrelated CWS diff-parser failures here |

### Monorepo / AG-59297

| Boundary | Required retained behavior |
| --- | --- |
| Scope | Existing 14 Lerna chains: ten libraries/plugins and four examples; no new builder lint tasks |
| Effective configs | Package-installed ESLint; legacy and dnr-rulesets ESLint9 flat configs; nested `root: true`, extensions, ignores, off/warn/error |
| Logger | `tsurl`, `tsweb`, `dnr-converter`, `tswebexample`; independently published logger plugin API/build/tests unchanged |
| Rules | Package JSDoc and converter `@since`; import grouping/sorting, boundaries, TS settings, smoke/generated exclusions, Markdown and builder scopes |
| Commands | Existing root lint, package `lint:types`/`lint:md`, tests and `test:prod` purposes; affected-package CI behavior |
| Supply chain | Preserve seven-day quarantine; exempt only exact approved shared builds, never a wildcard |
| Docker | Copy every new config/helper into `source-base`; add shared-config regression checks to an existing Docker test path |
| Versions | Preserve normal CI dev-version injection; never commit temporary versions or generated build outputs |

## Review and rollout gates

Read the [performance protocol](performance.md) before making a speed claim.
Historical TS7 experiments in [import-validation](import-validation.md) are not
current compatibility or performance evidence.

Use `pnpm build` followed by
`pnpm exec tsx scripts/stage.ts 0.1.0-review.20261015` to create exact-version
archives and a SHA-256 manifest in a new ignored review directory. Staging uses
disposable package copies and does not edit source manifests or publish.
Use the same archive bytes for packed and consumer validation.

Before each consumer PR changes ownership, retain a per-effective-group report,
validate diagnostics/options/suppressions/files, run unchanged typed/test gates,
update the Docker/staged paths, and pin the reviewed exact package builds.
No integration issue is complete until its consumer CI passes and its owners
resolve remaining gaps, hosting/distribution and any upstream decisions.

Missing native implementations remain documented gaps or existing ESLint/JS
owners. Check the pinned optimized JS API and measure before adapting a provider.
Do not implement an unsupported standalone Rust module. Any new Rust rule needs
Oxlint maintainer agreement and belongs upstream in an existing native plugin.
