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

### Fixed

- Published JavaScript targets Node 22, and public configuration declarations
  support TypeScript 5 NodeNext consumers.
