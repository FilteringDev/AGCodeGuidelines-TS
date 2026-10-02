# @agcodeguidelines/rule-catalog

Pinned source hashes, effective inherited sample settings, rule mappings, and dispositions for all 134 numbered AdGuard JavaScript guideline clauses.

Import `catalog`, `severity`, and `resolveRule` from the package. Each clause has a disposition for the default `compatibility` policy (its top-level fields) and for the opt-in `guideline` policy (`clause.guideline`). Dispositions distinguish native, JavaScript, custom, compiler, partial, manual, and overridden enforcement; `partial` means the configured rules enforce only part of the clause. Mappings are scoped to the base preset, the `guideline` policy, or the `adguard-projects` profile, and record the TypeScript implementation used in TypeScript files. `catalog.policies` and `catalog.profiles` hold the corresponding rule overlays. Compiler and manual dispositions are part of the policy's documented contract.

## Legacy Rule Resolution

```ts
import { resolveRule } from '@agcodeguidelines/rule-catalog';

const result = resolveRule('@typescript-eslint/member-delimiter-style', {
	language: 'typescript',
	profile: 'adguard-projects',
	setting: ['warn', { multiline: { delimiter: 'semi', requireLast: true } }],
});
```

The result is `resolved`, `disabled`, `compiler`, or `unsupported`. Resolved results include the target, provider namespace, cloned setting, implementation kind, and `requiresTypeInfo`. Resolution never mutates or activates preset rules. Provider specifiers come from `createConfig().jsPlugins`; native namespaces must be registered in `plugins`. `requiresTypeInfo` requires explicit type-aware configuration and the separately installed service; it is not a syntax fallback.

`catalog.compatibility` lists verified legacy identifiers, their option schemas and origins. Caller settings are preserved rather than replaced with preset options. Unsupported options and unknown identifiers return a reason instead of silently disappearing. Disabled settings remain disabled even when their retained options are unsupported. Custom settings are currently validated only for compatibility identifiers; other catalog identifiers resolve their recorded preset settings.

The explicit aliases cover the TypeScript delimiter, call spacing, quotes, extra semicolons, loop functions, precision, unused expressions, implied eval, legacy throw, return-await, naming, and React hooks rules. Native hooks use `react/...` configuration names but report `react-hooks(...)` diagnostic codes. Dangerous exhaustive-deps autofix options are not supported. Full legacy plugin parity is not promised.

Naming supports only explicit `variable`, `function`, and `typeLike` selectors with `camelCase`, `PascalCase`, `UPPER_CASE`, or `format: null`. Repeated selectors, additional selector groups, modifiers, filters, affixes, underscore options, custom patterns, and type-based options are rejected. It has no upstream default configuration and is not enabled in presets. Rewrite legacy suppression identifiers to the resolved target; aliases do not rewrite source comments.
