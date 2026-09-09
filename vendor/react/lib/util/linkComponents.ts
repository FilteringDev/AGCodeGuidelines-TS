/**
 * @file Utility functions for propWrapperFunctions setting
 */
import { from as dependency0, map as dependency1 } from '../../compat/iterators';

import type { RuleContext } from '../../types';

const iterFrom = dependency0;
const map = dependency1;

/**
 * TODO: type {(string | { name: string, linkAttribute: string })[]}
 */

const DEFAULT_LINK_COMPONENTS: (string | { name: string; linkAttribute: string | string[] })[] = ['a'];
const DEFAULT_LINK_ATTRIBUTE = 'href';

/**
 * TODO: type {(string | { name: string, formAttribute: string })[]}
 */

const DEFAULT_FORM_COMPONENTS: (string | { name: string; formAttribute: string | string[] })[] = [
    'form',
];
const DEFAULT_FORM_ATTRIBUTE = 'action';

/**
 * @param context The rule context.
 * @param [context.settings] The settings value.
 * @returns The result of this check.
 */
function getFormComponents(context: { settings?: RuleContext['settings'] }) {
    const settings = context.settings || {};
    const formComponents = DEFAULT_FORM_COMPONENTS.concat(settings.formComponents || []);
    return new Map<string, string[]>(
        map(iterFrom(formComponents), (value) => {
            if (typeof value === 'string') {
                return [value, [DEFAULT_FORM_ATTRIBUTE]];
            }
            return [value.name, ([] as string[]).concat(value.formAttribute)];
        }),
    );
}

/**
 * @param context The rule context.
 * @param [context.settings] The settings value.
 * @returns The result of this check.
 */
function getLinkComponents(context: { settings?: RuleContext['settings'] }) {
    const settings = context.settings || {};
    const linkComponents = DEFAULT_LINK_COMPONENTS.concat(settings.linkComponents || []);
    return new Map<string, string[]>(
        map(iterFrom(linkComponents), (value) => {
            if (typeof value === 'string') {
                return [value, [DEFAULT_LINK_ATTRIBUTE]];
            }
            return [value.name, ([] as string[]).concat(value.linkAttribute)];
        }),
    );
}

export default {
    getFormComponents,
    getLinkComponents,
};
