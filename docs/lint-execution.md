# Resource-aware lint execution

The `ag-lint` executable and `@agcodeguidelines/oxlint-config/runner` subpath
provide execution control without changing `createConfig()`, the configuration
generator CLI, presets or rule ownership. Syntax-only execution needs neither
an ESLint engine dependency nor the optional typed service.

## Invocation

```sh
pnpm run lint -- --max-mem 8192
pnpm run lint -- --max-mem=2048 --threads=1 --profile "${AG_CACHE_ROOT:-/tmp/agcodeguidelines-cache}/lint-profile.json"
pnpm exec ag-lint --max-mem 8192 --command node tasks/lint.mjs
```

`--max-mem` accepts a positive integer in **MiB**. Missing, duplicate, fractional,
negative, unsafe or unit-suffixed values are rejected. The wrapper consumes its
own flags, including pnpm's forwarding separator; they are not sent to Oxlint,
ESLint, Lerna or the compiler. A later literal `--` preserves option-looking
filenames. The default backend is the installed supported Oxlint Node CLI;
there is no hardcoded private Rust binary path.

Full root lint still uses the existing config and zero-warning contract.
`lint:fix` is unchanged; parallel autofix is not introduced.

## Budget policy

At startup the wrapper computes effective observable availability from guest
`MemAvailable`, meaningful platform/Node hints, and visible cgroup ancestor
limits and their own current usage. It handles cgroup v1/v2 and namespace mount
mapping, unlimited sentinels and soft `memory.high` pressure. Swap is not extra
RAM budget. CPU admission also considers the visible quota and affinity count.

The automatic budget is the floor of **80% of effective available bytes**, in
whole MiB. This is capacity for useful work, not a request to preallocate memory
until the machine is 80% occupied. Explicit `--max-mem` replaces the automatic
fraction and can be larger or smaller, but cannot exceed an observable hard
ceiling. It does not reserve physical memory from other applications; current
pressure can still prevent admission or terminate the run with a resource error.

The budget belongs to the **whole supervised command**, including its engines,
workers, orchestration and caches. It is not assigned independently to each
package or Node worker. Root commands create a temporary authenticated local
coordinator. Participating package wrappers share reservations; nested work
reuses its current package permit. Child options cannot raise the parent cap.
Session sockets and permits are reclaimed at command completion/disconnection.
Credentials are not included in profile JSON.

Thread reservations are conservative startup estimates, not per-thread hard
limits. One useful small native task can run with a smaller reservation under
active monitoring. A very large JS-provider profile may need more memory even
with one thread; insufficient limits must fail rather than silently omit checks.

Visible VM RAM and container limits are honored. A guest cannot infer hidden
physical-host constraints. Trusted launchers may provide
`AG_LINT_HOST_LIMIT_MIB` and `AG_LINT_HOST_AVAILABLE_MIB`; without them the report
states the visibility gap rather than probing outside its namespace.

## Enforcement and failures

Linux reports `monitored-process-tree`: the supervisor observes descendant RSS
across Linux worker threads, restricts new work and terminates owned work on
budget excess. This is **best-effort monitoring, not a portable kernel-enforced
hard RSS limit**. Sampling can overshoot transiently and shared pages can be
counted more than once. V8 old-space is not used as a substitute for total
Node/native/process-tree memory. Existing pnpm/bootstrap memory before the
supervisor starts is already reflected in available-memory observations, but is
not claimed as an exact owned process-tree measurement.

On other platforms the report says `admission-only`; it does not pretend that
parent RSS includes every child. Use an external OS/container memory scope when
a strict physical bound is required. Rootless container tests use actual kernel
cgroup limits in addition to the wrapper's monitored budget.

The wrapper preserves engine exit statuses, including lint violations (`1`).
Invocation/spawn errors use `2`, resource/admission failures use `3`, and signals
retain conventional statuses such as SIGINT `130`, SIGKILL `137` and SIGTERM
`143`. Queued tasks have bounded idle-pressure admission waits, not an endless
queue. Legitimate active work does not cause a false queue timeout. Cancellation
terminates known owned process groups/descendants with escalation; Linux PID
start identities protect against killing a reused PID. This is not a sandbox
for adversarial programs that deliberately escape process ownership.

## Process sharding

Oxlint runs JavaScript plugins on one thread per process, so a full JavaScript-provider
configuration is bound by that thread. With `--format json` or `--format unix`, `ag-lint`
lists the files with Oxlint's own `--debug=files`, balances them by size across processes
(at least 128 files each, at most the resource-aware thread count), runs each with
`--threads=1 --format=json`, and renders one merged report. Diagnostics, `--quiet`,
`--silent`, `--deny-warnings`, `--max-warnings` and exit status match a single process;
only diagnostic order is normalized to filename and offset. Each shard is a supervised
task with a 1024 MiB reservation under the same budget. Other formats, fixes, typed
linting, unknown options and nested invocations keep one process.

On the measured consumers the full adguard-projects preset dropped from 11.8s to 4.8s
(VPN, 5 shards) and from 16.5s to 5.7s (browser, 7 shards); sampled tree peaks were
3.1 and 5.4 GiB within an automatic budget.

## Result cache

`--cache` (optionally `--cache-location path`, default
`node_modules/.cache/ag-lint/results.json`) stores each discovered file's diagnostics
under the SHA-256 of its content. The whole cache is keyed by Oxlint's `--print-config`
output for the shared options, the Oxlint and configuration package versions, and those
options. Only changed files are linted, through the same sharded JSON pipeline, and the
cached and fresh diagnostics form one report. It needs `--format json` or `unix` in a
top-level run; otherwise a warning is printed and the run is uncached.

Like ESLint's cache, an entry does not depend on other files that a rule reads
(import resolution, cycles, exports) or on nested configuration files and plugin code
outside the printed root configuration. Clear the cache after such changes. Warm runs
with no changed files took 0.73s on both measured consumers.

## Profiling

`--profile path.json` records the selected budget and sources, visibility
warnings, sampled peak tree memory, engine resolution/execution timings, exit
status and coordinator counts. Startup before module entry is not mislabelled
as measured function time. Native child time is opaque initialization plus
execution; Node CPU profiles alone cannot explain all native work.

The monorepo pilot separately records engine load, enumeration, effective-config
calculation, grouping, fallback lint, native config I/O and spawn counts through
`AG_LINT_TRACE_DIR`. Equivalent fallback overrides reuse an ESLint instance;
ESLint still resolves each file's complete original config. Exact equivalent
native runtime configs coalesce into argv-byte-safe batches. No arbitrary
hundred-file split, dropped path, shell quoting or changed ignore policy is
used to manufacture speed. Config memoization is read-only.

`scripts/benchmark.ts` keeps the previous manifest compatible and also accepts
two or more safely named variants. `artifactsDirectory` streams complete raw
stdout/stderr into artifacts instead of retaining large diagnostic buffers.
Each variant may declare `resourceProfile` to attach its completed resource
report to each sample. Separate tracing-on attribution runs from tracing-off
timing comparisons. Full coverage, source/dependency parity and resource limits
must match before claiming a speedup; a native subset is only a control.

## Verified limits and progress

Focused tests cover default80%, explicit overrides, nested cgroup headroom,
soft pressure, sentinels, parser forwarding, impossible work, pressure recovery,
long active tasks, cancellation, coordinator loss, child budget expansion,
spawn/SIGKILL failure and cleanup of a detached child ignoring SIGTERM.
Packed tarball tests exercise the public bin/subpath, TS5 declarations and
pnpm symlink entry detection. No blanket lint or coverage exemptions are added.

Rootless Node22.12 containers with kernel limits512/1024/2048MiB complete the
native fixture with automatic startup budgets around399/809/1628MiB and sampled
owned peaks around55MiB. An explicit value one MiB over each hard ceiling is
rejected before engine startup. These small-fixture results are not evidence
that a full legacy JS-provider configuration fits512MiB or1GiB.

Paired single-run consumer stress attempts at1/2/4/8GiB are separate from the
repeated timing study. With the result cache disabled, VPN fails explicitly
at1GiB; at2GiB the current route fails and optimized completes in this sample;
both complete at4/8GiB. The monorepo fails explicitly at1/2/4GiB and completes
all14 chains at8GiB. Both optimized automatic80% lanes complete. These are
observations, not minimum-memory guarantees: sampled RSS and current pressure
vary. Cache-enabled stress attempts are not guaranteed primed after earlier
failed or cache-disabled attempts. The1GiB monorepo root now rejects before
starting Lerna rather than repeating a package admission timeout. Adapters
report resource errors without an unhandled stack; external orchestrators such
as Lerna can still aggregate a child's resource exit into their own exit1.

The final packed-runtime check executes the installed `ag-lint` bin with an
explicit512MiB budget and verifies its JSON report on Node22.12.0,
pnpm10.33.4 and TypeScript5.9.3. The shared acceptance gate passes45,513 tests;
VPN full lint/type checks and1,017 tests pass (one throttle timing failure
passed both isolated and full-suite retries), and all14 monorepo full lint
chains pass. Browser's public5.x ruleset test profile passes lint/type checks,
but retains ten CWS diff-parser test failures; it does not validate private6.x
ruleset compatibility.

Consumer pilots and public ruleset substitutions are provisional local tests;
absolute local tarball overrides are not a CI-ready distribution mechanism.
Use exact approved package builds before publication/rollout. See
[performance acceptance](performance.md) for the whole-command protocol and
[consumer compatibility](compatibility.md) for unchanged fallback obligations.
