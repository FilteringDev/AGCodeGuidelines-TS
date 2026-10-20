# Changelog

## Unreleased

### Added

- Resource-aware lint execution with `--max-mem` in MiB, default eighty-percent
  observable availability, shared child admission and optional JSON profiles.
- Literal argv batching and bounded asynchronous lint task supervision with
  explicit resource failures, cancellation cleanup and preserved engine status.

- Explicit rule ownership and fallback reports, including native candidate
  evidence and preserved consumer settings and file scopes.
- Requested-rule compatibility configurations and opt-in provider selection,
  without changing the existing mutable presets or legacy rule identifiers.
- Scoped compatibility groups and validated aliases to existing frozen core
  and JavaScript provider implementations, including separate TypeScript style
  aliases when both source rules are active.

### Changed

- JavaScript-provider rules share one per-file compatibility layer instead of
  rebuilding it for every rule, reducing full-preset lint time by about 27% on
  the measured consumers with identical diagnostics.
- Import rules reuse export-map cache-key serializations per file, removing a
  further 11-16% of full-preset lint time on the measured consumers.
- `ag-lint` splits large `--format json`/`unix` runs across Oxlint processes, each
  with its own JavaScript-plugin thread, and merges one identical report.
- `ag-lint --cache` reuses diagnostics of unchanged files with ESLint cache
  semantics, keyed by the resolved root configuration and tool versions.
- `ag-lint` overlaps file discovery with print-config instead of running
  them sequentially, and skips per-run temp setup on full cache hits.
- `finalizeProviders` keeps override-level disables that narrow a rule
  enabled in another layer, preserving scope narrowing.

### Fixed

- Published JavaScript targets Node 22, and public configuration declarations
  support TypeScript 5 NodeNext consumers.
- JavaScript-provider scope analysis counts identifiers used in class, method
  and property decorators as references, so they are no longer reported unused.
- The `typescript` import resolver reads the configured `project` tsconfig files
  or the nearest `tsconfig.json` without following project references, so
  `ag-import/order` and other import rules classify aliases as the pinned resolver
  does. Glob `project` entries keep translated import rules as fallback.
- Compatibility translation keeps `boundaries/*` element, ignore, include, root
  path and dependency-node settings, so translated boundaries rules apply again.
- `ag-ts-style` rules check the syntax their typescript-eslint sources check:
  they no longer report function types, auto-accessors, `satisfies`, dynamic
  imports, import attributes or parenthesized types those sources accept, and
  they report interface, type-literal and enum braces for `block-spacing` and
  `brace-style`. The translated `block-spacing` alias now has an implementation.
- `ag-ts/naming-convention` no longer checks `infer` type parameters and
  mapped-type keys, matching typescript-eslint.
- In TypeScript files without imports or exports, configured globals no longer
  turn top-level declarations of the same name into globals when `sourceType` is
  `module`, so `no-redeclare` accepts `declare const` beside a configured global.
- Compatibility translation keeps the pinned core `indent` and `key-spacing`
  rules for consumer-supplied TypeScript settings, so they no longer report
  interface members and index signatures the former configuration accepted.
- `ag-ts-style/indent` no longer checks type-argument lists, which
  typescript-eslint leaves unchecked. When `ignoredNodes` lists
  `TSTypeParameterInstantiation`, the rule still ignores the tokens of those
  lists.
- TypeScript `class-methods-use-this` counts `this` in default parameters, as
  ESLint and typescript-eslint do, through the new
  `ag-ts/class-methods-use-this`. `@typescript-eslint/class-methods-use-this`
  settings translate to it, including `ignoreOverrideMethods` and
  `ignoreClassesThatImplementAnInterface`.
