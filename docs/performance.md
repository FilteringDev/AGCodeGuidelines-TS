# Lint performance acceptance

## Equal-concurrency follow-up

A subsequent 2026-10-15 experiment isolates concurrency from adapter changes.
It uses the same Node22.12.0/pnpm10.33.4/SDK5 installations and8192MiB envelope,
all14 code-lint chains, independent caches and no Nx replay. Eight cases are
interleaved with ten cold and ten warm samples each and three warmups.
All160 measured samples exit0. Results are whole-command medians; types and
Markdown remain outside the timed code-lint scope.

| Case | Concurrency | Cold Median | Warm Median | Maximum Cold RSS | Maximum Warm RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full ESLint | 4 | 16,985ms | 5,143ms | 4993MiB | 2178MiB |
| Current hybrid | 4 | 17,467ms | 5,544ms | 5196MiB | 2625MiB |
| Previous optimized adapter | 4 | 17,259ms | 5,604ms | 5889MiB | 2633MiB |
| Measured reservations | 4 | 17,592ms | 5,609ms | 5945MiB | 2664MiB |
| Full ESLint | 7 | 13,675ms | 4,238ms | 6197MiB | 3239MiB |
| Current hybrid | 7 | 14,311ms | 4,666ms | 6492MiB | 3555MiB |
| Previous optimized adapter | 7 | 13,926ms | 4,642ms | 7116MiB | 3896MiB |
| Measured reservations | 7 | 15,145ms | 4,638ms | 6757MiB | 3539MiB |

At4-way, the optimized adapter is1.2% faster cold but1.1% slower warm than
current hybrid. At7-way it is2.7% faster cold and0.5% faster warm. The cold
interquartile ranges overlap (7-way current14,030-14,414ms versus
optimized13,695-14,113ms); warm ranges also overlap. These are not evidence
of a substantial repeatable same-concurrency speedup. Full ESLint remains
faster than either hybrid at equal concurrency. The earlier mixed4-to7-way
gains below must not be attributed entirely to adapter code improvements or
presented as default-branch speedups.

Three follow-up decisions:

1. **Keep reproducible measurement controls.** Each benchmark variant can set
  isolated environment controls, including separate cache identities, without
  mutating the parent. This is tooling, not a lint-runtime speedup.
2. **Reject discovery probes.** Removing the second ignore check and reusing
  the enumerator's extracted config both changed explicit hidden-path ignore
  behavior in existing regression tests. The original installed-ESLint path
  was restored and all five adapter tests passed. A config cache keyed by
  file path offers no demonstrated benefit: the effective config is already
  queried once per enumerated file and totals about24ms in the trace.
3. **Do not adopt measured reservations as the default speed policy.** They
  increase7-way cold time8.8% over the previous optimized adapter, while
  warm time is essentially unchanged. Maximum cold RSS falls from7116MiB
  to6757MiB and warm RSS from3896MiB to3539MiB, but that tradeoff does not
  justify a default throughput claim.

The reservation experiment uses existing shared admission, not a new scheduler.
One complete cold calibration measures each package's sampled tree RSS;
reservations are rounded up to128MiB from1.25 times that peak plus128MiB.
These snapshot-specific estimates are not portable per-package limits or a
persistent tuning service. In separate single cold stress attempts, fixed
reservations exceed4GiB while measured reservations complete all14 chains at
3848MiB. Both fail explicitly at1/2GiB and complete at8GiB; Lerna aggregates
the measured2GiB resource failure to exit1. This capacity result is not a
minimum-memory guarantee or a repeated speed measurement.

No discovery or scheduling-runtime change is adopted by this follow-up.
Consumer controls and calibrated weights remain rehearsal-only patches, not
committed consumer configuration. Raw samples, all statuses, P25/P75/extrema,
resource reports, calibration, source hashes and exact control manifests are
retained under `.cache/invocation-study/followup/`. No new default-branch
checkout comparison is claimed.

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

## Staged full-migration measurements (tsurlfilter wave)

Staged cold-lane comparisons (N=3-5 per variant, cache disabled per run,
identical file lists both sides, Node 22.12.0, Oxlint 1.82.0, ESLint
8.57.1) of the current hybrid against union migrated Oxlint configs
(typeAware, per-group union coverage, bare specifiers resolved against
workspace dist for measurement). Warm lanes are not reported: the
hybrid's `--cache` flag has no counterpart in the ESLint-only command,
so warm comparisons would measure caching artifacts, not engines.

| Scope | Files | Hybrid cold | Migrated Oxlint cold | Ratio |
| --- | ---: | ---: | ---: | ---: |
| logger | 8 | 1.62-1.71 s | 0.56-0.58 s | ~2.9x |
| adguard-api-mv3 | 13 | 1.81-1.89 s | 0.33-0.34 s | ~5.5x |
| eslint-plugin-logger-context | 5 | 1.47-1.54 s | 0.31-0.32 s | ~4.8x |
| adguard-api | 36 | 2.04-2.10 s | 0.30-0.31 s | ~6.8x |
| tsurlfilter | 162 | ~6.8 s | 0.59-0.60 s | ~11x |
| tswebextension | 287 | 8.62-8.68 s | 0.63-0.66 s | ~13x |
| dnr-rulesets | 41 | 1.53-1.54 s | 0.54-0.56 s | ~2.8x |
| css-tokenizer | 56 | 2.63-2.75 s | 0.52-0.54 s | ~5x |
| agtree | 259 | 9.28-9.49 s | 0.64-0.67 s | ~14x |
| ex-adguard-api | 11 | 1.65-1.66 s | 0.33 s | ~5x |
| ex-adguard-api-mv3 | 13 | 1.64-1.69 s | 0.38-0.39 s | ~4.3x |
| ex-tswebextension-mv2 | 24 | 1.79-1.81 s | 0.36 s | ~5x |
| ex-tswebextension-mv3 | 38 | 1.79-1.83 s | 0.31-0.33 s | ~5.6x |

VPN src (594 files): hybrid ESLint 11.23-11.31 s vs union Oxlint
0.63-0.66 s (~17x). VPN tasks/tests (126 files) and browser
Extension/src plus tools plus tests (941 files linted, 362 rules,
0 diagnostics) verify parity; their staged ratios are pending.
dnr-converter has no staged judgment: its hybrid baseline exits 1
on the pre-existing unbuilt plugin dist, so comparison against a
broken baseline would prove nothing.

These staged signals exceed the 15% T7 bar by an order of magnitude
with no IQR overlap possible at these separations, but they are not
formal T7 judgments: the formal 10x10 interleaved harness per wave
gate still applies before any gate flips on. Parity status per
scope is recorded in the wave cutover commits on the consumer
branch; open adjudications (next-line stacking impossibility,
tsgolint tsc-clean precondition) are recorded there, not waived.


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

A variant may provide `env`, an object of environment names and string values.
These overrides apply only to that variant's child processes; the parent
environment is not mutated. A `null` value removes an inherited variable.
Use separate controls and cache locations for each concurrency or scheduling
case rather than changing the parent environment between samples. Invalid names
and NUL-containing values are rejected before commands run. The manifest is
retained in the report, so **never put credentials or other secrets in `env`**.
These trusted controls do not bypass a command's resource admission or make
different file coverage equivalent.

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
