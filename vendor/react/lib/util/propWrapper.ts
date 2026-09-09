/**
 * @file Utility functions for propWrapperFunctions setting
 */
import { filter as dependency0, some as dependency1 } from '../../compat/iterators';

import type { RuleContext, WrapperFunction } from '../../types';

const filter = dependency0;
const some = dependency1;

/**
 * @param name The name to inspect.
 * @param propWrapperFunctions The prop wrapper functions value.
 * @returns The result of this check.
 */
function searchPropWrapperFunctions(
    name: string,
    propWrapperFunctions: ReadonlySet<string | WrapperFunction>,
) {
    const splitName = name.split('.');
    return some(propWrapperFunctions.values(), (func) => {
        if (
            splitName.length === 2
            && typeof func !== 'string'
            && func.object === splitName[0]
            && func.property === splitName[1]
        ) {
            return true;
        }
        return name === func || (typeof func !== 'string' && func.property === name);
    });
}

/**
 * @param context The rule context.
 * @returns The result of this check.
 */
function getPropWrapperFunctions(context: RuleContext) {
    return new Set(context.settings.propWrapperFunctions || []);
}

/**
 * @param context The rule context.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function isPropWrapperFunction(context: RuleContext, name: unknown) {
    if (typeof name !== 'string') {
        return false;
    }
    const propWrapperFunctions = getPropWrapperFunctions(context);
    return searchPropWrapperFunctions(name, propWrapperFunctions);
}

/**
 * @param context The rule context.
 * @returns The result of this check.
 */
function getExactPropWrapperFunctions(context: RuleContext) {
    const propWrapperFunctions = getPropWrapperFunctions(context);
    const exactPropWrappers = filter(
        propWrapperFunctions.values(),
        (func) => typeof func !== 'string' && func.exact === true,
    );
    return new Set(exactPropWrappers);
}

/**
 * @param context The rule context.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function isExactPropWrapperFunction(context: RuleContext, name: string) {
    const exactPropWrappers = getExactPropWrapperFunctions(context);
    return searchPropWrapperFunctions(name, exactPropWrappers);
}

/**
 * @param propWrapperFunctions The prop wrapper functions value.
 * @returns The result of this check.
 */
function formatPropWrapperFunctions(propWrapperFunctions: ReadonlySet<string | WrapperFunction>) {
    return Array.from(propWrapperFunctions, (func) => {
        if (typeof func !== 'string' && func.object && func.property) {
            return `'${func.object}.${func.property}'`;
        }
        if (typeof func !== 'string' && func.property) {
            return `'${func.property}'`;
        }
        return `'${func}'`;
    }).join(', ');
}

export default {
    formatPropWrapperFunctions,
    getExactPropWrapperFunctions,
    getPropWrapperFunctions,
    isExactPropWrapperFunction,
    isPropWrapperFunction,
};
