# @agcodeguidelines/oxlint-config

AdGuard JavaScript/TypeScript configurations for Oxlint 1.82.0 on Node 22.12.0 or later. Development scripts in this repository still use Node 24; only packed-package installation and use are supported on Node 22. The default presets require neither an ESLint engine nor a typed lint service.

```sh
pnpm exec ag-oxlint-config --language typescript --environment node
pnpm exec oxlint --config .oxlintrc.json .
```

The CLI writes all required root settings and preserves an existing file unless `--force` is supplied. `--help` lists its options.

`createConfig({ language, environment, sourceType, typeAware, policy })` returns independent, mutable configurations. Languages are `javascript` and `typescript`; environments are `browser`, `node`, and `both`; source types are `module`, `script`, and `commonjs`; policies are `compatibility` and `guideline`. Defaults are JavaScript, browser, module, syntax-only linting, and the compatibility policy. CommonJS filename extensions remain CommonJS. The string language shorthand is also supported.

Exports include `javascript`, `typescript`, and the `node` environment overlay, JSON preset subpaths `/javascript`, `/typescript`, `/node`, and compiler settings at `/tsconfig`. Keep root `settings` when composing presets. Use TypeScript 7 for checking and tsx for executing TypeScript scripts.

Sample settings override conflicting guide prose. The default `compatibility` policy preserves that behavior. The opt-in `guideline` policy reverses only the documented sample/prose conflict (`import/prefer-default-export`) and records the choice in `settings.agPolicy`; other project-specific overlays remain consumer responsibilities. Compiler checks and human review complement syntactic lint rules. The companion rule catalog records every numbered clause and its disposition.

## Type-Aware Linting

The default presets remain syntax-only. Install `oxlint-tsgolint@7.0.2002` alongside `oxlint@1.82.0` to opt into type-dependent rules:

```ts
import { createConfig } from '@agcodeguidelines/oxlint-config';

export default createConfig({ language: 'typescript', typeAware: true });
```

Use this configuration with Oxlint's JavaScript/TypeScript config support, or serialize it to JSON. The root `options.typeAware` enables the service; `consistent-type-exports` is enabled only for TypeScript files in this mode. The catalog marks these mappings with `requiresTypeInfo`. Other typed policies must be selected explicitly by the consumer; this is not complete Airbnb TypeScript parity.

Provide a valid TypeScript 7 project and build dependent packages' declarations before linting. Keep native compiler checking and declaration emission as separate build gates. This option does not enable Oxlint's experimental compiler diagnostics or replace bundling, browser transforms, or human guideline review.
