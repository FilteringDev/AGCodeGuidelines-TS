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
retained under `$AG_CACHE_ROOT/invocation-study/followup/` (default
`/tmp/agcodeguidelines-cache/invocation-study/followup/`). No new default-branch
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
`$AG_CACHE_ROOT/invocation-study/final/` (default
`/tmp/agcodeguidelines-cache/invocation-study/final/`). The earlier VPN run with shared caches was
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

## Formal full-migration judgments (10x10 interleaved harness)

Formal 40-sample judgments (10 cold plus 10 warm per variant,
3 warmups, deterministic interleave, raw artifacts retained;
Node 22.12.0, Oxlint 1.82.0, ESLint 8.57.1) of the current hybrid
against union migrated Oxlint configs (typeAware, per-group union
coverage, lint-cli cache gate on migrated warm lanes). Medians in
milliseconds with measured interquartile ranges; every lane below
clears the 15% bar with non-overlapping IQRs.

| Scope | Cold hybrid | Cold migrated | Cold gain | Warm hybrid | Warm migrated | Warm gain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| logger | 1647 (1645-1652) | 553 (548-555) | 66% | 863 (853-868) | 548 (545-552) | 37% |
| adguard-api-mv3 | 1739 (1737-1749) | 562 (556-570) | 68% | 860 (855-864) | 565 (559-568) | 34% |
| eslint-plugin-logger-context | 1640 (1625-1669) | 542 (537-547) | 67% | 851 (846-856) | 538 (535-548) | 37% |
| adguard-api | 2212 (2190-2230) | 1119 (1097-1123) | 49% | 892 (889-907) | 347 (346-354) | 61% |
| dnr-rulesets | 1653 (1635-1658) | 329 (326-332) | 80% | 1014 (1005-1021) | 335 (333-337) | 67% |
| css-tokenizer | 2876 (2850-2897) | 360 (360-364) | 87% | 996 (992-1003) | 361 (355-367) | 64% |
| tsurlfilter | 7464 (7393-7483) | 360 (358-364) | 95% | 1170 (1163-1180) | 361 (360-365) | 69% |
| tswebextension | 9272 (9226-9295) | 364 (362-365) | 96% | 1435 (1431-1440) | 366 (363-369) | 74% |
| agtree | 10169 (10135-10255) | 368 (365-373) | 96% | 1148 (1137-1153) | 365 (360-368) | 68% |
| ex-adguard-api | 1828 (1807-1839) | 358 (356-361) | 80% | 841 (839-850) | 356 (354-357) | 58% |
| ex-adguard-api-mv3 | 1882 (1857-1885) | 363 (360-367) | 81% | 850 (846-856) | 357 (351-362) | 58% |
| ex-tswebextension-mv2 | 1937 (1917-1941) | 339 (334-348) | 83% | 776 (771-781) | 339 (337-349) | 56% |
| ex-tswebextension-mv3 | staged only | staged only | staged | staged only | staged only | staged |
| VPN src | 11668 (11484-11742) | 610 (597-619) | 95% | 853 (844-858) | 598 (593-620) | 30% |
| VPN tasks/tests | 5298 (5282-5340) | 602 (591-607) | 89% | 801 (793-807) | 603 (597-622) | 25% |
| Browser | 28154 (27640-28198) | 684 (675-695) | 98% | 952 (950-954) | 649 (640-652) | 32% |

Warm lanes run cache-gated on both sides (hybrid `--cache`,
migrated lint-cli `--cache`); an uncached migrated warm lane was
measured 24% slower than hybrid on adguard-api and is not the
gated configuration. dnr-converter and ex-tswebextension-mv3
keep staged-only status: their hybrid baselines exit 1 on the
pre-existing unbuilt plugin dist. Parity status per scope is
recorded in the wave cutover commits; open adjudications
(next-line stacking impossibility, tsgolint tsc-clean
precondition) are recorded there, not waived.

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
