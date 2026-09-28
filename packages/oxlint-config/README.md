# @agcodeguidelines/oxlint-config

AdGuard JavaScript/TypeScript configurations for Oxlint 1.82.0 on Node 22.12.0 or later. Development scripts in this repository still use Node 24; only packed-package installation and use are supported on Node 22. The default presets require neither an ESLint engine nor a typed lint service.

```sh
pnpm exec ag-oxlint-config --language typescript --environment node
pnpm exec oxlint --config .oxlintrc.json .
```

The CLI writes all required root settings and preserves an existing file unless `--force` is supplied. `--help` lists its options.

`createConfig({ language, environment, sourceType, typeAware, policy, profile, importGroups })` returns independent, mutable configurations. Languages are `javascript` and `typescript`; environments are `browser`, `node`, and `both`; source types are `module`, `script`, and `commonjs`; policies are `compatibility` and `guideline`; profiles are `guide` and `adguard-projects`. Defaults are JavaScript, browser, module, syntax-only linting, the compatibility policy, and the guide profile. CommonJS filename extensions remain CommonJS. The string language shorthand is also supported. The CLI accepts the same choices as `--policy`, `--profile`, and `--import-groups`.

Exports include `javascript`, `typescript`, and the `node` environment overlay, JSON preset subpaths `/javascript`, `/typescript`, `/javascript-adguard-projects`, `/typescript-adguard-projects`, `/node`, and compiler settings at `/tsconfig`. Keep root `settings` when composing presets. Use TypeScript 7 for checking and tsx for executing TypeScript scripts.

## Policies

The default `compatibility` policy reproduces the sample `.eslintrc.js`, including inherited Airbnb settings that conflict with the guide's prose. The opt-in `guideline` policy enforces the prose instead and records the choice in `settings.agPolicy`:

| Clause | Guideline policy |
| --- | --- |
| 4.3 array-like conversion | `ag/prefer-array-from` for `Array.prototype.slice.call(value)` |
| 5.2 array destructuring | `prefer-destructuring` also checks declarations |
| 6.2, 18.13 long strings | `max-len` ignores strings and template literals; `ag/no-multiline-string-concat` |
| 6.3 template strings | `ag/prefer-template-over-join` for `[...].join()` string building |
| 7.1, 7.9 function expressions | `func-names` off; the guide's examples use anonymous function expressions |
| 7.4 `arguments` | `ag/no-arguments` for `arguments.length` and other property access |
| 7.10 parameter mutation | `no-param-reassign` with `props: true` and no exempt parameter names |
| 9.1, 9.2 prototypes | `ag/no-prototype-mutation` also reports `Object.assign`/`defineProperty` on prototypes, `setPrototypeOf`, and `inherits` |
| 10.1 modules | `import/no-commonjs` for `module` sources (off for `.cjs`/`.cts` and `.eslintrc.js`); TypeScript `no-require-imports` |
| 10.4 duplicate imports | `import/no-duplicates` with `prefer-inline` merges type and value imports |
| 10.2 wildcard imports | `import/no-namespace` |
| 10.6 named exports | `import/prefer-default-export` off; `import/no-default-export` |
| 10.10, 10.11 import groups and order | `import/order` with blank lines between groups and path alphabetization |
| 14.1 equality | `eqeqeq` without the `null` exception |
| 16.1 multiline conditions | `ag/multiline-condition-layout` |
| 17.1 multiline comments | `ag/require-docblock` also rejects runs of `//` comments (except `TODO`/`FIXME` action items) |
| 17.2 single-line comments | `line-comment-position` and `lines-around-comment` (tool directives excepted) |
| 17.3 comment spacing | `ag/docblock-spacing` for `/**` lines without a space after `*` |
| 18.1 indentation | four-space `react/jsx-indent` and `react/jsx-indent-props` |
| 18.6 method chains | `newline-per-chained-call` breaks chains longer than two calls |
| 18.7 blank line after blocks | `padding-line-between-statements` |
| 21.2, 21.3 coercion | `no-implicit-coercion` for `'' + value` and `+value` (Airbnb's options) |
| 22.1 descriptive names | `id-length` with a minimum of two characters |
| 22.7 constants | `ag/constant-name` for module-level primitive constants |

Clause 10.10's prose separates built-in, package, parent, and sibling imports, while its example keeps built-in and package imports together. `importGroups: 'example'` (the default) follows the example: built-in imports, then packages, in one block, followed by internal aliases, parent, and sibling imports. `importGroups: 'prose'` separates every category. Aliases count as internal only when the resolver settings or `import/internal-regex` identify them. Configuration files that must use a default export, such as bundler configurations, can turn off `import/no-default-export` in an override.

Some examples in the guide break other clauses' rules under the guideline policy: default exports in 10.1 and 10.3 (10.6), single-letter arrow parameters in 8.1 and 12.5 (22.1), the trailing comment in the 25.1 enum example (17.2), the one-line `.enter().append()` in the 18.6 chain example, and the functions without a final return in 15.3 (`consistent-return`). The policy follows each clause's prose; `docs/coverage.md` records the remaining partial clauses.

## Suppression directives

Rules run under this package's plugin namespaces, so directives must name the Oxlint rule, for example `// oxlint-disable-next-line ag-compat/no-bitwise -- reason` rather than `no-bitwise` or `import/order`. Rename existing ESLint directives when migrating; directives that name the upstream rule have no effect.

## Environments

`environment` defaults to `browser`. The sample configuration enables browser globals and inherits Node globals from Airbnb; use `environment: 'both'` to reproduce both.

## AdGuard projects profile

`profile: 'adguard-projects'` adds conventions shared by AdGuard extension projects that the guide does not require: stricter JSDoc rules, MV2/MV3 import restrictions, `.pcss` side-effect imports, `import-newlines`, `boundaries` (with default elements in `settings`), logger context checks, and TypeScript rules such as `explicit-function-return-type`, `explicit-member-accessibility`, `consistent-type-imports`, `member-delimiter-style`, `no-explicit-any`, and `ban-ts-comment`. The catalog labels these mappings with the `adguard-projects` origin.

## TypeScript

The guide applies the JavaScript rules to TypeScript. The TypeScript override replaces pinned JavaScript implementations that report valid TypeScript or ignore TypeScript syntax with TypeScript-aware implementations of the same rules and options, such as overload-aware `no-dupe-class-members`, merge-aware `no-redeclare`, and Stylistic `comma-dangle` for enums, tuples, and type parameters. `docs/coverage.md` lists every replacement and its reason.

Clauses 26.1 and 26.2 are compiler settings. Extend `/tsconfig`, or verify an existing project with:

```sh
pnpm exec ag-oxlint-config --check-tsconfig tsconfig.json
```

The check follows the `extends` chain and reports `strict`, `noUncheckedIndexedAccess`, and a disabled `useUnknownInCatchVariables`. `checkTsconfig(path)` provides the same check programmatically. Compiler checks and human review complement syntactic lint rules. The companion rule catalog records every numbered clause and its disposition under both policies.

## Type-Aware Linting

The default presets remain syntax-only. Install `oxlint-tsgolint@7.0.2002` alongside `oxlint@1.82.0` to opt into type-dependent rules:

```ts
import { createConfig } from '@agcodeguidelines/oxlint-config';

export default createConfig({ language: 'typescript', typeAware: true, profile: 'adguard-projects' });
```

Use this configuration with Oxlint's JavaScript/TypeScript config support, or serialize it to JSON. The root `options.typeAware` enables the service; with `profile: 'adguard-projects'`, `consistent-type-exports` is enabled only for TypeScript files in this mode. The catalog marks these mappings with `requiresTypeInfo`. Other typed policies must be selected explicitly by the consumer; this is not complete Airbnb TypeScript parity.

Provide a valid TypeScript 7 project and build dependent packages' declarations before linting. Keep native compiler checking and declaration emission as separate build gates. This option does not enable Oxlint's experimental compiler diagnostics or replace bundling, browser transforms, or human guideline review.
