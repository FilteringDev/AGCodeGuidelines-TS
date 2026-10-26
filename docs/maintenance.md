# Maintaining the guideline snapshot

Development and consumer runtimes are separate contracts. Build with the pinned
Node24/pnpm12 toolchain; emitted packages target Node22. The explicit minimum
runtime job installs the tarballs with Node22.12/pnpm10.33.4, strict peers/engines
and TS5.9.3, then checks runtime providers, native lint and NodeNext declarations.
Syntax-only consumers need neither TS7 nor the optional typed lint service.
See [compatibility and review staging](compatibility.md) and
[whole-command performance acceptance](performance.md) before migrating consumers.

On Node22.12 images, an old bundled Corepack can lack current pnpm signing keys.
Use the pinned pnpm setup action or a current signature-verifying Corepack;
never disable integrity verification to make the minimum-runtime lane pass.

## Scratch and cache locations

Repository-owned testing and build scratch lives outside the checkout under
`$AG_CACHE_ROOT` (default `/tmp/agcodeguidelines-cache`): upstream source
checkouts, staged review tarballs, packed-runtime inputs, benchmark and
invocation-study artifacts, coverage output (`$AG_COVERAGE_DIR`, default
`/tmp/agcodeguidelines-coverage`), and the per-run consumer-diff configs.
Point tool caches at `/tmp` too (for example `XDG_CACHE_HOME`,
`NPM_CONFIG_CACHE`, `npm_config_store_dir`, `GOMODCACHE`, `GOCACHE`,
`COREPACK_HOME`, `PLAYWRIGHT_BROWSERS_PATH`, `MINIKUBE_HOME`/`KUBECONFIG` —
see the tracked repo `.envrc` for the exact mapping, all under
`/tmp/ag-machine-cache/`; no minikube state is used by this repository.
Exceptions: the shipped
`ag-lint` result cache stays consumer-local (`node_modules/.cache`), and the
composite `tsc -b` incremental state (`vendor` declaration emit,
per-package `.tsbuildinfo`) stays in-repo because committed tsconfig paths
must keep working on the Windows CI leg.

`docs/reference/sources.json` pins the guide commit and six upstream rule/test repositories. Each archive has a SHA-256 digest. `vendor/manifest.json` records the bytes of the frozen guide, inherited sample data, isolated sources, fixture corpus, and port recipes. Normal builds and tests use the committed snapshot and do not fetch upstream source.

The guide's original configuration bytes are retained in `docs/reference/eslintrc.upstream.txt`. The executable port is `docs/reference/eslintrc.ts`. Exact reviewed replacements in `scripts/reference-patches.json` reproduce the typed port, and snapshot checks compare its configuration data with the original sample. The catalog retains the original `eslintrc.cjs` provenance label and upstream hash. A sample change that no longer matches the port must be reviewed before refresh writes snapshots.

Run `pnpm run snapshots:refresh` to download the pinned archives, verify their digests, reproduce the vendor files, recapture Airbnb metadata, generate the catalog, build the packages, and recapture the upstream tests. The command uses `tsx` and does not install or execute an ESLint engine. Run `pnpm run check` afterward. `pnpm run snapshots:refresh --latest-guide` deliberately advances the guide commit to the current upstream branch before performing the same steps.

`pnpm exec tsx scripts/vendor.ts --source-root "$AG_CACHE_ROOT/upstream" --check` independently proves that all isolated files match their sources and reviewed patches (default `/tmp/agcodeguidelines-cache/upstream`). The refresh validates every port before writing vendor files. Exact context replacements fail on missing or ambiguous context. Generated rule registries and the extracted JSDoc helper have source guards that require review when their upstream inputs change.

Recipes may reference a `patchesFile` containing an ordered JSON array of exact `before`/`after` replacements. These replacements run after the recipe's inline patches, and their files are included in the integrity manifest. This keeps larger reviewed ports separate from the source inventory without weakening context checks.

To update a rule-source version, change its version, ref, and directory in the source lock, review the upstream release and dependency requirements, and remove its old archive digest. Run the refresh with `--record-archives` to record the reviewed new archive. Update the source guards, selected rule registry, relative dependency closure, and compatibility patches in `scripts/vendor-recipes.json` as required. Keep generator provenance and importer source directories consistent with the new lock. These updates require a maintainer; the weekly job advances the guide while retaining the reviewed rule-source versions.

Port recipes document the following adaptations:

- Core rules are strict TypeScript ES modules. Their source patches preserve the pinned implementations, including literal regex flag spelling. The standalone JSDoc lookup and indentation helpers retain their upstream source guards. Shared ESTree contracts and narrow external-library adapters describe the legacy API supplied by Oxlint. The execution-order rule ignores references used only in type annotations.
- JSDoc rules and helpers are strict TypeScript ES modules. The shared ES2024 compiler target accepts their existing Unicode-set regular expressions under the required Node 24 runtime. Their option types follow the pinned schemas, and their parser contracts include TypeScript and legacy Babel nodes. Type-parser parent links use a WeakMap. The ports retain handling for Oxc's null optional fields and enumerable ClassBody properties; a metadata fingerprint preserves the original schemas, documentation examples, and recommended configuration.
- React rules and helpers are strict TypeScript ES modules with typed component state, options, and parser nodes. The modern report adapter avoids engine discovery. Metadata and recommended configurations retain their pinned values. A narrow external CommonJS bridge loads the iterator helper entrypoints that are provided as runtime dependencies.
- Import rules and module utilities are strict TypeScript ES modules. Typed resolver results, parser contracts, export maps, and dependency traversal retain the pinned rule behavior and metadata. The private Oxc resolver and comment reader live in `vendor/import/compat`; they remain included in adapter coverage. Export-map cache keys reuse each immutable settings and language-options object's serialization instead of serializing them on every lookup. External CommonJS bridges load consumer-selected parsers, resolvers, and optional package metadata.

The TypeScript adapters separately preserve scope metadata, explicit global directives, legacy context methods, and incremental code-path segment observations. All these paths are tested through Oxlint. Build-time dependencies are bundled into the plugin; declared runtime dependencies remain external. The build rejects engine imports and emits third-party notices from the actual bundle inputs.

The importer records unsupported grammar/parser capabilities in `tests/fixtures/import-report.json`, including a source rule, source file, code hash, and reason for every exclusion. Exclusions are selected from parser metadata and grammar capabilities, never from whether a lint assertion passes. Count-only assertions preserve the upstream diagnostic count. Any fixture-capture failure fails the command. New auxiliary rules must be represented in the harness rather than silently dropping their diagnostics or fixes.

The weekly GitHub workflow opens a **signed draft PR**, runs acceptance checks, and explicitly dispatches the full Linux/Windows/macOS matrix for the update branch. It never merges or publishes. Repository Actions settings must allow workflow-created pull requests. A failed refresh or check remains visible as a failed workflow, and any resulting draft must be reviewed before merge.

Review the generated rule catalog, effective sample options and disabled rules, fixture changes, exclusions, source/patch hashes, license notices, and all platform checks. Use `pnpm run snapshots:record` only after intentionally reviewing a snapshot change; normal checks reject drift.

Local commits use `git commit -S`. For commits made with LLM agent assistance, add a `Co-authored-by: Agent Name <agent-email>` trailer using the actual agent's documented attribution name and email. Separate the trailer from the commit message body with a blank line. Do not invent an email or attribute another agent's work to Codex.

Examples for the corresponding agents:

```text
Co-authored-by: Codex <codex@openai.com>
Co-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>
```

Include only the trailer for each agent that actually assisted with the commit. Commits without LLM assistance, including ordinary automated snapshot updates, do not include an LLM co-author trailer.

Published packages are prepared with `pnpm pack`; maintainers initiate publication by publishing a GitHub Release as described below.

All 540 JavaScript sources from the migration baseline now have TypeScript ports: 308 core files, 44 JSDoc files, 133 React files, 54 import files, and the reference configuration. Emitted JavaScript in package `dist` directories remains the consumer runtime format. Upstream JavaScript filenames in provenance, patch inputs, and fixture strings remain unchanged.

`pnpm run source:check` scans authored source directories and root source configuration files, including untracked files. It rejects JavaScript source files, CommonJS TypeScript modules, unbound CommonJS module operations, explicit `any`, unchecked type suppressions, and ambient wildcard shims for local sources. The AST check permits exact external package declarations and distinguishes fixture strings and VM capture objects from executable CommonJS modules. `scripts/source-policy.ts` documents each external `createRequire` boundary and rejects literal local paths loaded through those bridges. Dynamic external loader inputs remain explicit review boundaries.

`pnpm check` runs the source guard, build, strict project and tool type checks, the complete Oxlint configuration, catalog and integrity checks, coverage tests, and Git whitespace checks. Vendor TypeScript and external declarations have no blanket lint exclusions. Strict compiler options and coverage thresholds remain in force; do not replace type contracts with unchecked files or permissive ambient module shims.

The existing development overrides permit sequential `for...of` traversal and early `continue` in the scope, context, and dependency parser adapters, where mutable graph traversal is required. Parser nodes are annotated in place. Internal application helpers retain named exports where already configured. All vendor families follow the repository's TypeScript import extension policy and full lint rules. Test-capture classes model upstream APIs. These development settings do not change the published presets.

## npm releases

`.github/workflows/publish.yml` runs when a GitHub Release is published. It checks out the release tag, installs the frozen dependencies, runs `pnpm run check`, and rejects generated-file drift before preparing any release artifacts. Review the normal cross-platform Check workflow before publishing a release; the Publish workflow independently runs checks on Ubuntu, not the full platform matrix.

Use a SemVer tag such as `v1.2.3` for a regular release or `v1.2.3-rc.1` for a prerelease. The GitHub Release's prerelease flag must match the tag. Build metadata (`+...`) is rejected to avoid npm version normalization collisions. All three public packages receive the same version through `TypescriptPrime/bump-packagejson-version`, pinned to the reviewed `1.1.9` commit. The action installs its own dependencies at runtime, so the commit pin does not freeze that dependency resolution. Version changes are made only in the runner: the private root version, committed package versions, and dependency lockfile remain unchanged, and the workflow never commits or pushes.

After updating versions, the workflow rebuilds and reruns the packed-consumer tests. It prepares all packages with `pnpm pack`, validates the archive manifests and required files, and performs `npm publish --dry-run`. Packing converts the config's `workspace:*` plugin dependency to the exact release version. Publication uses the npm CLI, not `pnpm publish`, in this order:

1. `@agcodeguidelines/oxlint-plugin`
2. `@agcodeguidelines/rule-catalog`
3. `@agcodeguidelines/oxlint-config`

Regular releases use `latest`; prereleases use `next`. Only these public packages are published. A shared concurrency group prevents simultaneous publication, and an active run is never canceled by a newer release. GitHub concurrency retains only one pending run; publish releases one at a time and confirm each completes before starting the next.

### Trusted publisher setup

For each package, configure a GitHub Actions trusted publisher in its npm settings:

- Organization or user: `FilteringDev`
- Repository: `AGCodeGuidelines-TS`
- Workflow filename: `publish.yml` (not the full path)
- Environment name: leave empty; this workflow does not use a GitHub environment
- Allow direct `npm publish`; stage-only permission is not sufficient

The workflow uses a GitHub-hosted runner, `id-token: write`, Node from `.node-version`, and npm `11.21.0` (trusted publishing requires npm >=11.5.1 and Node >=22.14.0). It does not need an `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret. The public package manifests identify this repository and their workspace directories. npm automatically attaches provenance to OIDC publications from this public repository; no separate provenance token is needed.

A new trusted publisher configuration must complete its first successful publish within two days; otherwise delete and recreate it. If a package does not yet exist and its trusted publisher cannot be configured, an authorized maintainer must bootstrap it manually with `pnpm pack` and an authenticated npm CLI before registering the trusted publisher. Use a new release version afterward. Do not add a long-lived token fallback to the workflow. After confirming OIDC publication works, npm recommends requiring two-factor authentication and disallowing traditional publishing tokens.

See [npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/) for setup and troubleshooting. Dry runs and `npm whoami` do not validate OIDC publishing permission; the first real release is the authentication and provenance acceptance check.

### Failed or partial releases

The workflow checks all three packages for an existing release version before the first publish. An existing version stops the run; registry/authentication/network failures other than a package-not-found response also stop the run. npm versions cannot be overwritten, and three publish operations are not atomic.

If a run fails, inspect the workflow log and the registry versions and dist-tags for all three packages before retrying. If none were published, rerun the failed workflow after fixing the cause. If any were published, do not blindly rerun: the duplicate-version guard will stop it. Prefer fixing the cause and publishing a new version for all three packages. If completing the original version is necessary, an authorized maintainer must reproduce the tagged build and version updates, validate the packed artifacts, and manually publish only the missing packages with the original `latest` or `next` tag. Never republish an existing version or move dist-tags without review.

## Read-only consumer rehearsals

External projects under `/references/outside` are reference evidence, not working directories. Never install, build, lint, fix, or run tests there. On Linux or macOS with `rsync` installed, prepare independent copies with:

```sh
pnpm exec tsx scripts/mirrors.ts prepare
pnpm exec tsx scripts/mirrors.ts verify /tmp/agcodeguidelines-migration-<run-id>
```

`prepare` prints a unique directory directly under `/tmp`, containing `baseline/` and `candidate/` copies of all four projects, plus `reports/`, `artifacts/`, and `cache/`. Copies include hidden settings, lockfiles, and resources, but exclude `.git` and `node_modules`. Files are copied without hardlinks and made owner-writable. Internal symlinks are remapped into each copy; links escaping the project or entering excluded directories are rejected. Source content hashes, modes, and link targets are recorded in `reports/source-manifest.json` and verified after copying and on demand. This detects changes; it is not a sandbox that prevents arbitrary consumer scripts from writing elsewhere.

Before running commands, review absolute paths, local dependencies, lifecycle scripts, Git hooks, and generated-output locations. Use the project's supported Node and package-manager versions, disable Git-hook installation, and begin with `--ignore-scripts` until dependency lifecycle scripts have been reviewed. Set the command's working directory explicitly to the chosen mirror and place stores, downloads, browser profiles, and caches below the run directory. Do not share `node_modules` between copies. Capture source revision information read-only; builds that require `.git` need independent metadata or a documented version fixture, never a link back to the source checkout.

Install the original frozen lockfile in `baseline`. Install packed candidate packages from `artifacts` in `candidate`, not workspace links. Record commands, versions, diagnostics, and exit statuses in `reports`; distinguish baseline failures from migration regressions. Re-run `verify` after experiments. No copy-back, commit, publication, or deployment to the reference projects is part of a rehearsal. Cleanup must name only the specific generated run directory after reports are retained and processes stop. Mirror tests require `/tmp` and `rsync` and are skipped on Windows; package tests retain the existing cross-platform coverage.
