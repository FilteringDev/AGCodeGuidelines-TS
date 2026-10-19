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

### Fixed

- Published JavaScript targets Node 22, and public configuration declarations
  support TypeScript 5 NodeNext consumers.
- JavaScript-provider scope analysis counts identifiers used in class, method
  and property decorators as references, so they are no longer reported unused.
- Compatibility translation keeps `boundaries/*` element, ignore, include, root
  path and dependency-node settings, so translated boundaries rules apply again.
