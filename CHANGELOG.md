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

### Fixed

- Published JavaScript targets Node 22, and public configuration declarations
  support TypeScript 5 NodeNext consumers.
