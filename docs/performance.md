# Lint performance acceptance

## Resource-aware pilot measurements

An isolated Linux guest comparison on 2026-10-15 used Node22.12.0,
pnpm10.33.4, Oxlint1.82.0 and the same exact
`0.1.0-review.20261015.5` SDK tarballs in paired disposable installations.
Every variant ran under the same8192MiB monitored process-tree envelope.
Ten cold and ten warm samples per variant were interleaved, with three warmups
and separate result caches. Cold disables ESLint's result cache; host page cache
is uncontrolled. Builds and tests did not run concurrently with measurement.

Times below are whole **code-lint** commands, including orchestration, discovery
and engine startup, not native-only subsets. Type checking and Markdown owners
passed separate full-lint gates, but are not included in these timings.
The monorepo includes all14 original code chains (12 targets and two API
examples), without adding builder lint. Its ESLint/current baselines explicitly
use four-way concurrency; the optimized route selects seven at this budget.
Four is a controlled comparison setting, **not Lerna's installed default**.
These numbers do not establish a repeated-sample gain over default concurrency.

| Consumer / Cache | Full ESLint Median | Current Hybrid Median | Optimized Median | Optimized P25-P75 | Change vs Current |
| --- | ---: | ---: | ---: | ---: | ---: |
| VPN cold | 12,803ms | 13,036ms | 12,785ms | 12,717-12,886ms | -1.9% |
| VPN warm | 1,135ms | 1,344ms | 1,075ms | 1,072-1,083ms | -20.0% |
| Monorepo cold | 17,883ms | 18,473ms | 14,728ms | 14,491-14,926ms | -20.3% |
| Monorepo warm | 5,354ms | 5,796ms | 4,814ms | 4,755-4,878ms | -16.9% |

VPN cold is essentially equal to full ESLint, with overlapping distributions;
it is not a substantial cold-start improvement. VPN warm improves5.2% over
full ESLint in this run. Monorepo improvements over its four-way full ESLint
baseline are17.6% cold and10.1% warm. The added resource controls and complete
fallback work remain in the timed command.

The monorepo trades memory for throughput. Maximum sampled tree RSS across
the ten cold samples rises from5362MiB (current) to7161MiB (optimized);
warm peaks rise from2817MiB to4043MiB. VPN cold peaks are2226/2168MiB and
warm peaks469/415MiB, respectively. RSS summation can double-count shared
pages and sampling can miss transients; these are not kernel memory peaks.

Separate tracing runs cover1083 files across the same14 packages in both
monorepo lanes. Effective groups remain16; native child launches fall from19
to13. Summed discovery time is approximately7.0s/7.1s and fallback time40.4s
in each lane: discovery was not eliminated. These overlapping package times
must not be summed as exclusive wall time. Native initialization plus execution
totals857ms/628ms; it is not an isolated measurement of rule cost.

Startup controls on one valid fixture measured approximately9.8ms for Node,
136.6ms for pnpm-exec plus Node,26.1ms for native Oxlint and127.8ms with the
JS compatibility provider (cold medians). These are separate initialization
controls, not full-coverage speedups inferred by subtracting medians.
An additional actual-default monorepo cold smoke completed in45.4s (ESLint)
and46.8s (current hybrid) under8192MiB. These are single supervised-task times,
not a substitute for the repeated four-way comparison above.

Raw manifests, all samples, min/max and P25/P75, full stdout/stderr and per-sample
resource profiles are retained locally under
`.cache/invocation-study/final/`. The earlier VPN run with shared caches was
discarded from acceptance, not combined with these samples. Original consumer
checkouts were not changed. Absolute local tarball overrides remain test-only
and must not be committed or used as a release mechanism.

## Historical evidence

The initial consumer PR integrations transferred only `no-debugger`,
`no-duplicate-case` and `no-sparse-arrays` through `ag-compat`. Their recorded
single warm samples were slower, not statistically reliable speed measurements:

| Consumer | ESLint-only | Hybrid |
| --- | ---: | ---: |
| VPN | 1,180 ms | 2,355 ms |
| Browser | 1,297 ms | 3,030 ms |
| tsurlfilter logger only | 937 ms | 1,832 ms |

These are task-brief results for build `0.1.0-build.11600659`, not reruns of the
new code. The resource-aware measurements above are a separate experiment,
not a reinterpretation of these samples. The benchmark harness unit test
measures synthetic child processes only and is not adoption evidence.

Native-only requested configurations now omit JavaScript providers; existing
mutable presets intentionally keep their old registration behavior. This
removes one possible cost, not the second ESLint parse or config discovery.
The three native candidates also have recorded diagnostic differences. Benefits
are explicit ownership and bounded startup work; costs include migration,
diagnostic differences and a remaining complete fallback pass. No speedup or
production rollout is accepted on these historical changes alone.

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
