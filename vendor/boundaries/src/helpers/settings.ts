/** @file Element settings access. */
import { isAbsolute, resolve } from 'node:path';
import {
    ELEMENTS,
    ENV_ROOT_PATH,
    ROOT_PATH,
    VALID_MODES,
} from '../constants/settings';
import { isString } from './utils';

export interface ElementSettings {
    type: string;
    pattern: string | string[];
    mode?: string;
    capture?: string[];
    basePattern?: string;
    baseCapture?: string[];
}

/**
 * Check for a legacy string element entry.
 * @param type The element entry.
 * @returns Whether the entry is a legacy string.
 */
export function isLegacyType(type: unknown): type is string {
    return isString(type);
}

// TODO, remove in next major version
/**
 * Normalize legacy string element entries.
 * @param typesFromSettings The configured elements.
 * @returns The normalized elements.
 */
export function transformLegacyTypes(typesFromSettings: (string | ElementSettings)[] | undefined): ElementSettings[] {
    const types = typesFromSettings || [];
    return types.map((type) => {
        // backward compatibility with v1
        if (isLegacyType(type)) {
            return {
                type,
                match: VALID_MODES[0],
                pattern: `${type}/*`,
                capture: ['elementName'],
            } as unknown as ElementSettings;
        }
        // default options
        return {
            match: VALID_MODES[0],
            ...type,
        };
    });
}

/**
 * Read the configured elements.
 * @param settings The ESLint settings.
 * @returns The normalized elements.
 */
export function getElements(settings: Record<string, unknown>): ElementSettings[] {
    return transformLegacyTypes(
        (settings[ELEMENTS]) as (string | ElementSettings)[] | undefined,
    );
}

/**
 * List the configured element type names.
 * @param settings The ESLint settings.
 * @returns The type names.
 */
export function getElementsTypeNames(settings: Record<string, unknown>): string[] {
    return getElements(settings).map((element) => element.type);
}

/**
 * Resolve the project root path.
 * @param settings The ESLint settings.
 * @returns The absolute root path.
 */
export function getRootPath(settings: Record<string, unknown>): string {
    const rootPathUserSetting = (process.env[ENV_ROOT_PATH] || settings[ROOT_PATH]) as string | undefined;
    if (rootPathUserSetting) {
        return isAbsolute(rootPathUserSetting)
            ? rootPathUserSetting
            : resolve(process.cwd(), rootPathUserSetting);
    }
    return process.cwd();
}
