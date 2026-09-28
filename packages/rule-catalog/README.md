# @agcodeguidelines/rule-catalog

Pinned source hashes, effective inherited sample settings, rule mappings, and dispositions for all 134 numbered AdGuard JavaScript guideline clauses.

Import `catalog` and `severity` from the package. Each clause has a disposition for the default `compatibility` policy (its top-level fields) and for the opt-in `guideline` policy (`clause.guideline`). Dispositions distinguish native, JavaScript, custom, compiler, partial, manual, and overridden enforcement; `partial` means the configured rules enforce only part of the clause. Mappings are scoped to the base preset, the `guideline` policy, or the `adguard-projects` profile, and record the TypeScript implementation used in TypeScript files. `catalog.policies` and `catalog.profiles` hold the corresponding rule overlays. Compiler and manual dispositions are part of the policy's documented contract.
