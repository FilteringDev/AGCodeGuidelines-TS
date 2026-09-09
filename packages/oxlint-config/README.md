# @agcodeguidelines/oxlint-config

Complete AdGuard JavaScript/TypeScript configurations for Oxlint 1.82.0 on Node 24.20.0 or later in the Node 24 line. No ESLint engine or typed lint service is required.

```sh
pnpm exec ag-oxlint-config --language typescript --environment node
pnpm exec oxlint --config .oxlintrc.json .
```

The CLI writes all required root settings and preserves an existing file unless `--force` is supplied. `--help` lists its options.

`createConfig({ language, environment, sourceType })` returns independent, mutable configurations. Languages are `javascript` and `typescript`; environments are `browser`, `node`, and `both`; source types are `module`, `script`, and `commonjs`. Defaults are JavaScript, browser, and module. CommonJS filename extensions remain CommonJS. The string language shorthand is also supported.

Exports include `javascript`, `typescript`, and the `node` environment overlay, JSON preset subpaths `/javascript`, `/typescript`, `/node`, and compiler settings at `/tsconfig`. Keep root `settings` when composing presets. Use TypeScript 7 for checking and tsx for executing TypeScript scripts.

Sample settings override conflicting guide prose. Compiler checks and human review complement syntactic lint rules. The companion rule catalog records every numbered clause and its disposition.
