# @agcodeguidelines/oxlint-plugin

AdGuard policy rules and engine-free upstream rule adapters for Oxlint 1.82.0. The supported runtime is Node 24.20.0 or later in the Node 24 line.

Use `@agcodeguidelines/oxlint-config` to materialize the full preset. The default plugin exports these custom rules:

- `no-accessors`
- `enum-name`
- `unknown-catch`
- `no-direct-reexport`
- `no-prototype-mutation`
- `no-default-side-effects`
- `prefer-array-from-map`
- `require-docblock` (option `lineCommentRuns` also rejects runs of `//` comments)
- `no-multiline-string-concat`
- `multiline-condition-layout`
- `constant-name`
- `prefer-array-from`
- `prefer-template-over-join`
- `no-arguments`
- `docblock-spacing`

`no-prototype-mutation` accepts `{ calls: true }` to also report prototype changes through `Object.assign`, `Object.defineProperty`, `Object.setPrototypeOf`, and `inherits`; the guideline policy enables it.

The `/typescript` export provides TypeScript-aware variants of pinned core rules: `no-redeclare` accepts overloads and the declaration merges that `@typescript-eslint/no-redeclare` accepts.

It also provides `naming-convention`, a syntax-only, opt-in implementation for explicit `variable`, `function`, and `typeLike` selectors. Supported formats are `camelCase`, `PascalCase`, and `UPPER_CASE`; `format: null` skips a selector. Type-like names include class, interface, type alias, enum and type parameter declarations. Variable checks follow local destructuring bindings, not property keys. The format helpers are extracted from typescript-eslint 8.70.0 with frozen source hashes and both upstream licenses.

This is not the complete upstream naming rule: additional selectors, repeated selectors, modifiers, filters, affixes, underscore options, custom patterns and type-based options are unsupported. Explicit options are required; no upstream defaults are implied. Use `resolveRule` from `@agcodeguidelines/rule-catalog` to validate legacy settings before adding the target rule. Suppression comments must use `ag-ts/naming-convention` after conversion.

The `/compat`, `/jsdoc`, `/react`, `/jsx-a11y`, `/import`, and `/stylistic` exports provide isolated upstream rules through Oxlint's JavaScript plugin API. They are not an ESLint plugin distribution and do not depend on the ESLint engine.

The shared scope adapter preserves interactions such as JSX bindings marked used by React rules. Import rules use Oxc for dependency parsing and TypeScript resolution. Attribution and licenses for bundled code are included in `THIRD_PARTY_NOTICES.md`.
