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
- `require-docblock`

The `/compat`, `/jsdoc`, `/react`, `/jsx-a11y`, `/import`, and `/stylistic` exports provide isolated upstream rules through Oxlint's JavaScript plugin API. They are not an ESLint plugin distribution and do not depend on the ESLint engine.

The shared scope adapter preserves interactions such as JSX bindings marked used by React rules. Import rules use Oxc for dependency parsing and TypeScript resolution. Attribution and licenses for bundled code are included in `THIRD_PARTY_NOTICES.md`.
