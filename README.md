# AdGuard guidelines for Oxlint

An Oxlint-only implementation of the pinned [AdGuard JavaScript guidelines](docs/reference/Javascript.md), including the complete inherited Airbnb and JSDoc sample configuration. The sample configuration takes precedence when it conflicts with prose. Every one of the 134 numbered clauses has a disposition in the generated [coverage catalog](docs/coverage.md).

The pnpm workspace contains three reusable packages:

| Package | Purpose |
| --- | --- |
| `@agcodeguidelines/oxlint-config` | Complete JavaScript and TypeScript presets, a configuration CLI, and strict compiler settings |
| `@agcodeguidelines/oxlint-plugin` | Guideline rules and isolated upstream rule implementations executed by Oxlint |
| `@agcodeguidelines/rule-catalog` | Source provenance, resolved settings, mappings, and clause dispositions |

## Development

Use Node **24.20.0** and pnpm **12.3.4**. TypeScript **7.0.2** compiles declarations and checks types; **tsx** executes TypeScript maintenance scripts. Vitest runs the unit, conformance, compiler, CLI, and packed-consumer tests.

Maintained source files, including all isolated vendor rules and the executable reference configuration, are TypeScript ES modules. `pnpm run source:check` prevents JavaScript and local CommonJS modules from returning to source directories. Packages still publish compiled JavaScript with declarations. See [snapshot maintenance](docs/maintenance.md) for source reproduction and external dependency boundaries.

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run check
```

`pnpm run check` is the acceptance gate. `pnpm run test` runs Vitest; `pnpm run test:coverage` also measures handwritten runtime code. Vendored implementations are checked by behavioral conformance tests and are excluded from the first-party coverage percentage.

## Consumer configuration

After installing the packages and the pinned Oxlint version with pnpm, create a complete configuration:

```sh
pnpm exec ag-oxlint-config --language typescript --environment node
pnpm exec oxlint --config .oxlintrc.json .
```

The CLI preserves existing files unless passed `--force`. `--output -` prints JSON. JavaScript/browser/module are the defaults. Use `--source-type script` for browser scripts; `.cjs` and `.cts` retain CommonJS semantics.

The programmatic API works in TypeScript scripts executed with `tsx`:

```ts
import { writeFile } from 'node:fs/promises';
import { createConfig } from '@agcodeguidelines/oxlint-config';

const config = createConfig({ language: 'typescript', environment: 'node' });
await writeFile('.oxlintrc.json', `${JSON.stringify(config, null, 2)}\n`);
```

Materialize the complete configuration so its root `settings` include import resolution, React configuration, and adapter options. Keep those settings when composing configurations. JSON presets are also exported as `@agcodeguidelines/oxlint-config/javascript` and `/typescript`.

For compiler checking:

```json
{
  "extends": "@agcodeguidelines/oxlint-config/tsconfig",
  "compilerOptions": { "noEmit": true },
  "include": ["src"]
}
```

TypeScript presets preserve documentation requirements while avoiding duplicate JSDoc type annotations. Type checking uses the TypeScript compiler; the default presets require no separate typed lint service. Optional `createConfig({ language: 'typescript', typeAware: true })` enables type-dependent lint rules with `oxlint-tsgolint@7.0.2002`; see [type-aware linting](packages/oxlint-config/README.md#type-aware-linting). Compiler checking remains a separate gate.

## Scope and maintenance

There is no ESLint CLI, engine dependency, or second lint pipeline. Isolated rule code and standalone helper libraries execute inside Oxlint. Compatibility details, fixture exclusions, and exact upstream versions are documented in [conformance](docs/conformance.md) and [maintenance](docs/maintenance.md).

Safe fixes come from the pinned rule implementations. Conflicting fixes can require another Oxlint pass; the tests check that formatting fixes preserve comments and converge. Custom policy rules report violations without rewriting potentially meaningful code.

Naming intent, English grammar, documentation quality, and other semantic requirements remain code-review responsibilities. Their individual dispositions and sample/prose conflicts are recorded in the catalog. No package publication or repository push is part of the local acceptance gate.
