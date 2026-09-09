/**
 * @file React rule fallback for behavior not provided natively by Oxlint.
 */
import type { Plugin, Rule, RuleMeta } from '@oxlint/plugins';
import react from '../../../vendor/react/index.js';

import { legacyContext } from './legacy-context';

const rules = Object.fromEntries(
    Object.entries(react.rules).map(([name, original]) => [
        name,
        {
            meta: original.meta as RuleMeta,
            create(context) {
                const settings = {
                    ...context.settings,
                    react: context.settings.agReact ?? context.settings.react ?? { version: 'detect' },
                };
                const adapted = Object.create(context, { settings: { value: settings } }) as typeof context;
                const visitors = legacyContext(original, adapted);
                if (name === 'jsx-props-no-multi-spaces') {
                    const visit = visitors.JSXOpeningElement!;
                    return {
                        ...visitors,
                        JSXOpeningElement(element) {
                            // Oxc uses null for absent type arguments; this upstream rule
                            // expects undefined. Shadow the property without mutating the AST.
                            const normalized = Object.create(element, {
                                typeArguments: { value: element.typeArguments ?? undefined, enumerable: true },
                                type: { value: element.type, enumerable: true },
                                name: { value: element.name, enumerable: true },
                                loc: { value: element.loc, enumerable: true },
                            });
                            visit(normalized);
                        },
                    };
                }
                return visitors;
            },
        } satisfies Rule,
    ]),
);

export default { meta: { name: 'ag-react' }, rules } as Plugin;
