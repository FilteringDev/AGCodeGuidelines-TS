# Maintaining the guideline snapshot

`docs/reference/sources.json` pins the guide commit and six upstream rule/test repositories. Each archive has a SHA-256 digest. `vendor/manifest.json` records the bytes of the frozen guide, inherited sample data, isolated sources, fixture corpus, and port recipes. Normal builds and tests use the committed snapshot and do not fetch upstream source.

Run `pnpm run snapshots:refresh` to download the pinned archives, verify their digests, reproduce the vendor files, recapture Airbnb metadata, generate the catalog, build the packages, and recapture the upstream tests. The command uses `tsx` and does not install or execute an ESLint engine. Run `pnpm run check` afterward. `pnpm run snapshots:refresh --latest-guide` deliberately advances the guide commit to the current upstream branch before performing the same steps.

`pnpm exec tsx scripts/vendor.ts --source-root .cache/upstream --check` independently proves that all isolated files match their sources and reviewed patches. The refresh validates every port before writing vendor files. Exact context replacements fail on missing or ambiguous context. Generated rule registries and the extracted JSDoc helper have source guards that require review when their upstream inputs change.

To update a rule-source version, change its version, ref, and directory in the source lock, review the upstream release and dependency requirements, and remove its old archive digest. Run the refresh with `--record-archives` to record the reviewed new archive. Update the source guards, selected rule registry, relative dependency closure, and compatibility patches in `scripts/vendor-recipes.json` as required. Keep generator provenance and importer source directories consistent with the new lock. These updates require a maintainer; the weekly job advances the guide while retaining the reviewed rule-source versions.

Port recipes document the following adaptations:

- Core rules retain the pinned implementations. The regex constructor fix preserves literal flag spelling. The standalone JSDoc lookup helper is extracted from its original class.
- JSDoc handles Oxc's null optional fields and enumerable ClassBody properties.
- React reports through the modern message contract without discovering an engine installation.
- Import rules use isolated module utilities, Oxc dependency parsing and TypeScript resolution, and explicit CommonJS/ESM interoperability.

The TypeScript adapters separately preserve scope metadata, explicit global directives, legacy context methods, and incremental code-path segment observations. All these paths are tested through Oxlint. Build-time dependencies are bundled into the plugin; the build rejects engine imports and emits third-party notices from the actual bundle inputs.

The importer records unsupported grammar/parser capabilities in `tests/fixtures/import-report.json`, including a source rule, source file, code hash, and reason for every exclusion. Exclusions are selected from parser metadata and grammar capabilities, never from whether a lint assertion passes. Count-only assertions preserve the upstream diagnostic count. Any fixture-capture failure fails the command. New auxiliary rules must be represented in the harness rather than silently dropping their diagnostics or fixes.

The weekly GitHub workflow opens a **signed draft PR**, runs acceptance checks, and explicitly dispatches the full Linux/Windows/macOS matrix for the update branch. It never merges or publishes. Repository Actions settings must allow workflow-created pull requests. A failed refresh or check remains visible as a failed workflow, and any resulting draft must be reviewed before merge.

Review the generated rule catalog, effective sample options and disabled rules, fixture changes, exclusions, source/patch hashes, license notices, and all platform checks. Use `pnpm run snapshots:record` only after intentionally reviewing a snapshot change; normal checks reject drift.

Local commits use `git commit -S` and include `Co-authored-by: Codex <codex@openai.com>`. Published packages are prepared with `pnpm pack`; publication is a separate maintainer action.

The repository's own Oxlint overrides permit sequential `for...of` traversal and early `continue` in the scope, context, parser, and comment adapters, where mutable graph traversal is required. Parser nodes are annotated in place. Internal helpers retain named exports, and vendor imports keep explicit JavaScript extensions. Test-capture classes model upstream APIs. These narrowly scoped development exceptions do not change the published presets.
