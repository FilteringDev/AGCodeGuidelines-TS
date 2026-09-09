/**
 * @file Expose reusable core rule functions to Oxlint; no ESLint engine is run.
 */
import type { Plugin, Rule, RuleMeta } from '@oxlint/plugins';
import builtinRules from '../../../vendor/core/lib/rules/index.js';

import { legacyContext } from './legacy-context';

const rules = Object.fromEntries(
    Array.from(builtinRules, ([name, original]) => [
        name,
        {
            meta: original.meta as RuleMeta,
            create(context) {
                return legacyContext(original, context);
            },
        } satisfies Rule,
    ]),
);

export default { meta: { name: 'ag-compat' }, rules } as Plugin;
