# Lint performance acceptance

## Current evidence

The initial consumer PR integrations transferred only `no-debugger`,
`no-duplicate-case` and `no-sparse-arrays` through `ag-compat`. Their recorded
single warm samples were slower, not statistically reliable speed measurements:

| Consumer | ESLint-only | Hybrid |
| --- | ---: | ---: |
| VPN | 1,180 ms | 2,355 ms |
| Browser | 1,297 ms | 3,030 ms |
| tsurlfilter logger only | 937 ms | 1,832 ms |

These are task-brief results for build `0.1.0-build.11600659`, not reruns of the
new code. No complete representative-consumer performance result is claimed.
The local reference checkouts have neither installed dependencies nor the PR
hybrid integration. The benchmark harness unit test measures synthetic child
processes only and is not adoption evidence.

Native-only requested configurations now omit JavaScript providers; existing
mutable presets intentionally keep their old registration behavior. This
removes one possible cost, not the second ESLint parse or config discovery.
The three native candidates also have recorded diagnostic differences. Benefits
are explicit ownership and bounded startup work; costs include migration,
diagnostic differences and a remaining complete fallback pass. No speedup or
production rollout is accepted on these changes alone.

## Reproducible protocol

Prepare disposable baseline/candidate copies using the existing mirror tooling
or equivalent isolated workspaces. Do not install into reference worktrees.
Pin the revision, exact reviewed tarballs/checksums, Node, pnpm, ESLint versions,
Oxlint `1.82.0`, worker counts and container CPU/memory limits. Keep all ignore,
extension, nested config, warning and parser semantics. Capture effective file
and config hashes and the ownership/fallback report before timing.

Compare three variants:

1. `eslint`: the complete original code-lint command.
2. `native`: only independently verified transferred native rules, explicitly
   labelled as a reduced-coverage control. Also measure the equivalent ESLint
   subset when attributing native rule-execution cost.
3. `hybrid`: the intended complete native-plus-ESLint fallback command,
   including file/config discovery and both tool invocations. Move only owners
   whose actual effective options and scopes passed compatibility checks.

Run `pnpm exec tsx scripts/benchmark.ts manifest.json results.json`. The manifest
has this shape; command paths are intentionally illustrative, not shipped
consumer wrappers:

```json
{
  "cwd": "/absolute/path/to/disposable-consumer",
  "coldDefinition": "Fresh process, lint cache disabled; host page cache uncontrolled",
  "warmDefinition": "Three priming runs with isolated ESLint cache; host page cache uncontrolled",
  "iterations": 10,
  "warmups": 3,
  "variants": {
    "eslint": {
      "cold": ["pnpm", "lint:code", "--no-cache"],
      "warm": ["pnpm", "lint:code"],
      "coverage": "Complete original effective code-lint configuration"
    },
    "native": {
      "cold": ["pnpm", "exec", "oxlint", "--config", "native.json", "src"],
      "warm": ["pnpm", "exec", "oxlint", "--config", "native.json", "src"],
      "coverage": "Transferred native subset only, not full lint"
    },
    "hybrid": {
      "cold": ["pnpm", "lint:hybrid", "--no-cache"],
      "warm": ["pnpm", "lint:hybrid"],
      "coverage": "Same full coverage as eslint, independently checked"
    }
  }
}
```

Use actual script argument behavior; not every `lint:code` forwards arguments.
Manifest commands are trusted literal argv arrays, never shell strings. Any
required setup/config discovery must be inside the timed command, not precomputed
only for the candidate. By default a nonzero exit aborts measurement. A dirty
baseline may explicitly set `expectedExitCodes: [0, 1]`, but its diagnostics must
be reviewed; allowing an exit code is not a successful correctness gate.

The harness interleaves variant order deterministically, runs at least ten
measured repetitions per cache lane and three warmups per warm variant, and
retains every wall-clock sample, stdout/stderr, status, manifest hash, revision,
environment, median, P25/P75 and extrema. It includes process/pnpm startup and
all child work. It does not clear filesystem caches or claim filesystem-cold
conditions. A fresh container still shares host page cache. Never disable host
security controls or drop global caches to improve the numbers.

Use a full large TypeScript monorepo and at least one extension; the delivery
table should include both extension PRs. For ext-tsurlfilter, cover all 14
existing lint chains with aggregate and per-package results, not just logger.
Do not substitute runtime Vitest benchmarks or introduce lint for builder
directories. Retain typecheck timings separately; their owners and commands
must not be weakened to make code lint faster.

## Attribution and decision

Measure config-only startup, zero-provider versus required-provider startup,
native versus equivalent ESLint subsets, and discovery/fallback costs as
separate experiments. Use OS/Node CPU profiles where possible to distinguish JS
initialization, config resolution, duplicate parsing, type-aware work and rule
execution. Profiles are attribution evidence, not subtraction-based guesses.

Report raw results and median/spread for each representative consumer. Review
paired differences and repeat runs when variation overlaps the claimed gain.
Accept performance-oriented rollout only when equivalent coverage improves
beyond observed noise. If hybrid stays slower, explicitly document the added
time and the correctness/coverage benefit; acceptance requires the consumer
owner's decision. Do not call native-only subset speed a complete lint speedup.
