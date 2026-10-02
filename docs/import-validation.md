# Import Migration Validation

Status: implemented experimental migration, **not rollout-ready**.
Recorded on 2026-10-02. No commits, branches, publication or deployment were made.

## Scope

The migration covers all four repositories under `/workspaces/import`.
The original Git revisions define the inventory, including retired files.

| Repository | Manifests | Original TS Configs |
| --- | ---: | ---: |
| AdGuardVPNExtension | 1 | 2 |
| AdguardBrowserExtension | 1 | 5 |
| Scriptlets | 3 | 3 |
| tsurlfilter | 30 | 47 |
| Total | 35 | 57 |

Every manifest has recorded direct, disposable-consumer or root-aggregate
execution evidence. This includes root tooling, tests, all ten monorepo
packages, four examples, standalone smoke consumers and both Rollup builders.
Inventory coverage does not imply that every gate passed.

Six lint-only TS configurations were retired. Two check-only configurations
were added: VPN's `tsconfig.check.json` and monorepo `tsconfig.tools.json`.
The other compiler configurations include shared options and references;
the 57 original files are not 57 independent executable projects.

## Toolchain

- Development and controlled CI: Node **24.21.0**, pnpm **12.3.4**.
- Production/library Node 22 support is retained separately from tooling.
- Oxlint **1.82.0**, typed service **7.0.2002**.
- Native check: `@typescript/native-preview@7.0.0-dev.20260707.2`, real `tsgo`.
- All targets use identical local snapshots of this repository's three packages.
- Target release-age quarantine remains seven days; build approvals are narrow.

The portable configuration uses TypeScript, both environments, compatibility
policy and the `adguard-projects` profile. Existing project options, aliases,
notice/logger rules, architecture restrictions and justified exceptions were
mapped explicitly. Source-repository directory exemptions were not copied.
Suppression comments were mapped by actual rule ownership, not prefix alone.

Syntax lint, typed lint, native checking and legacy build APIs are separate.
Positive/negative fixtures verify nonempty lint coverage and actual typed-service
project selection, including MV2/MV3. `--tsconfig` alone was not treated as proof.

## Results

### VPN Extension

- Syntax and typed lint each fail with 2,457 errors and 1,430 warnings.
  Syntax covers 723 files; typed configuration adds its own service lane.
- Native checking leaves three application diagnostics: two typed-array DOM
  overload mismatches and deprecated `module` namespace syntax.
- Baseline tests: 1,006 passed, eight failed. Node 24: 997 passed, 17 failed.
  Failure identities changed; this is not simply nine additional failures.
  Recorded causes include AbortSignal mock realms and removed `util.isRegExp`.
- Full builds and bundle-size gates are blocked by missing endpoint/environment
  configuration. Help/transformation probes do not count as complete builds.

### Browser Extension

- Current syntax lint: 755 errors, six warnings, 935 files.
- Typed MV2: 753 errors, six warnings, 867 files.
- Typed MV3: 752 errors, six warnings, 887 files.
- Native MV2/MV3 each report the same two integration-test buffer type errors.
- Tests match the passing baseline: MV2 1,078 passed/72 skipped;
  MV3 1,110 passed/40 skipped.
- Chrome, Chrome MV3 and Firefox builds pass. Browser integration/e2e and
  release signing were not verified by those checks.
- The recorded target snapshots still have active legacy mapping gaps.
  Source now resolves the prefixed `member-delimiter-style` name to its existing
  implementation and provides bounded naming support; targets have not been
  repacked or switched to the new resolver. Full ESLint rule parity is not claimed.

### Scriptlets

- Syntax and typed lint each report 2,607 diagnostics across 356 files.
- Native root and packed-consumer checks pass; 755 Vitest tests pass.
- Build, corelibs postbuild, packed exports, Markdown and test-list checks pass.
- QUnit bundles build, but browser execution is blocked by missing
  Chrome 143.0.7499.192. Building bundles is not a passing QUnit run.
- Source ArrayPattern restrictions and `allowJs`/`checkJs` semantics are retained.

### Monorepo

- Root `lint:all` explicitly traverses all 30 manifests and continues after
  independent failures; ordinary Lerna traversal alone misses consumers.
- Recorded built-static matrix: syntax and typed each six PASS/24 FAIL;
  native seven PASS/16 FAIL/seven N/A. These are that matrix's results, not
  a fresh all-project run after the final packed-consumer preparation.
- All ten package builds pass in the disposable workspace.
- Seven owning unit lanes pass; the browser-inclusive tswebextension lane fails.
  Its separate non-browser suite passes 795 tests across 86 files.
  Only the logger unit baseline slice was captured, so a complete monorepo
  baseline comparison is unavailable.
- Both Rollup builders and all four packed export consumers pass, including
  native/runtime/legacy declaration contracts where provided.
- Smoke/example build attempts total 17 PASS and two BLOCKED: MV3 API needs
  generated filter artifacts; MV3 tswebextension receives HTTP 400 downloading
  filters. Recorded nonzero command exits are retained in the evidence.
- Required `test:prod` commands stop at failing lint gates. Later browser stages
  were not reached; they are not reported as passing.
- A raw logger native-consumer matrix check lacked packed declarations.
  This prerequisite block is not evidence of a Node 22 runtime regression.

## Dependencies And Gaps

Ordinary target lint no longer invokes an internal ESLint engine or config.
Scriptlets has no ESLint-related lock entries. Upstream webpack analysis/types
and `web-ext`/`addons-linter` can still contain ESLint-named dependencies.
The published logger-context ESLint plugin intentionally retains its compatible
product dependencies and development engine; its public API was not redesigned.

VPN has no direct TS5 dependency. Browser retains TS5 for `tools/typescript.ts`
compiler APIs. Scriptlets retains it for declarations and legacy consumer checks.
Monorepo retains it for Rollup plugins, ts-morph, tsd and related API consumers.
This is a TS7 checking trial, not a complete TS7 build-system migration.

The separate compiler-policy audit resolves 53 retained/new configurations:
ten pass and 43 have policy findings, with no resolution blocks. Findings include
missing `noUncheckedIndexedAccess` and existing strict-family/catch exceptions.
These were recorded rather than automatically changing application strictness.

Representative Node 22 imports, lint fixtures and selected consumers ran in
addition to Node 24. Exact patches and scope are in repository summaries;
these probes do not prove every application's entire supported runtime range.
Docker runtime pins, checksums and COPY inputs were reviewed, but Docker CLI
was unavailable. No Docker image build or container execution is claimed.

## Evidence And Reruns

### Source Compatibility Follow-Up

Source-only patches add `resolveRule`, thirteen explicit compatibility identifiers,
option validation, native React hooks registration and syntax-only naming support
for the Browser configuration's variable/function/typeLike formats. Typed aliases
retain their type-service requirement. Unsupported options are reported explicitly.
Preset severities and enabled rules are unchanged; naming is opt-in.

These patches do not alter the historical target results above. Applying them to
targets requires new package snapshots, resolver adoption, suppression conversion
and fresh checks. In particular, 688 of the Browser's 761 syntax diagnostics were
in the four migration-added configuration/helper files; they are unfinished migration
code, not all preexisting application violations. Target helper fixes, native errors,
VPN Node 24 regressions and environment prerequisites remain outside this source patch.

The local [consolidated evidence](../.cache/import-validation/results.json)
contains original revisions, per-manifest/config rows, commands, working
directories, exits, durations, policy audits and repository summaries.
Repository details:

- [VPN summary](../.cache/import-validation/AdGuardVPNExtension/summary.json)
- [Browser summary](../.cache/import-validation/AdguardBrowserExtension/summary.json)
- [Scriptlets summary](../.cache/import-validation/Scriptlets/summary.json)
- [Monorepo summary](../.cache/import-validation/tsurlfilter/summary.json)

Evidence is local ignored data, not included in a fresh Git checkout.
Target `tools/lint-packages` snapshots are explicit installation/Docker inputs.
Archive the evidence separately for review or handoff.

With the pinned runtime and each target's prerequisites available, run the lanes
independently to avoid losing later results to a failing earlier gate:

```sh
pnpm install --frozen-lockfile
pnpm lint:code
pnpm lint:typed
pnpm lint:types
```

Use monorepo `pnpm lint:all` for all manifest lanes. Use the owning test/build
commands in the evidence, including explicit MV variants and packed consumers.
Version-stamping and packing checks must use disposable copies, not source
manifests. Rebuild source packages before rerunning the local report generator:

```sh
node .cache/import-validation/report.mjs
```

Rollout remains blocked on recorded lint/type findings, VPN Node 24 regressions,
active rule gaps and unverified prerequisite-dependent gates. Broad application
fixes, mass autofix, public plugin redesign and TS5 API replacement are outside
this migration's scope.
