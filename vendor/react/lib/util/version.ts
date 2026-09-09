import { createRequire } from 'node:module';
/**
 * @file Utility functions for React and Flow version configuration
 * @author Yannick Croissant
 */
import * as dependency0 from 'node:fs';
import * as dependency1 from 'node:path';
import { sync as resolveSync } from 'resolve';
import dependency3 from 'semver';
import type { RuleContext } from '../../types';
import dependency4 from './error';

const fs = dependency0;
const path = dependency1;

const resolve = { sync: resolveSync };
const semver = dependency3;
const error = dependency4;

// Consumer React and Flow packages are resolved from the linted file's directory.
const consumerRequire = createRequire(import.meta.url);

const ULTIMATE_LATEST_SEMVER = '999.999.999';

let warnedForMissingVersion = false;

/**
 *
 */
function resetWarningFlag() {
    warnedForMissingVersion = false;
}

let cachedDetectedReactVersion: string | undefined;

/**
 *
 */
function resetDetectedVersion() {
    cachedDetectedReactVersion = undefined;
}

/**
 * @param contextOrFilename The context or filename value.
 * @returns The result of this check.
 */
function resolveBasedir(contextOrFilename?: RuleContext | string): string {
    if (contextOrFilename) {
        const filename = typeof contextOrFilename === 'string' ? contextOrFilename : contextOrFilename.getFilename();
        const dirname = path.dirname(filename);
        try {
            if (fs.statSync(filename).isFile()) {
                // dirname must be dir here
                return dirname;
            }
        } catch (err) {
            // https://github.com/eslint/eslint/issues/11989
            if (err instanceof Error && 'code' in err && err.code === 'ENOTDIR') {
                // virtual filename could be recursive
                return resolveBasedir(dirname);
            }
        }
    }
    return process.cwd();
}

/**
 * @param confVer The conf ver value.
 * @returns The result of this check.
 */
function convertConfVerToSemver(confVer: string) {
    const fullSemverString = /^[0-9]+\.[0-9]+$/.test(confVer) ? `${confVer}.0` : confVer;
    return semver.coerce(
        fullSemverString
            .split('.')
            .map((part) => Number(part))
            .join('.'),
    );
}

let defaultVersion = ULTIMATE_LATEST_SEMVER;

/**
 *
 */
function resetDefaultVersion() {
    defaultVersion = ULTIMATE_LATEST_SEMVER;
}

/**
 * @param context The rule context.
 */
function readDefaultReactVersionFromContext(context: RuleContext) {
    // .eslintrc shared settings (https://eslint.org/docs/user-guide/configuring#adding-shared-settings)
    if (context.settings && context.settings.react && context.settings.react.defaultVersion) {
        let settingsDefaultVersion = context.settings.react.defaultVersion;
        if (typeof settingsDefaultVersion !== 'string') {
            error(
                `Warning: default React version specified in eslint-pluigin-react-settings must be a string; got "${typeof settingsDefaultVersion}"`,
            );
        }
        settingsDefaultVersion = String(settingsDefaultVersion);
        const result = convertConfVerToSemver(settingsDefaultVersion);
        if (result) {
            defaultVersion = result.version;
        } else {
            error(
                `Warning: React version specified in eslint-plugin-react-settings must be a valid semver version, or "detect"; got “${settingsDefaultVersion}”. Falling back to latest version as default.`,
            );
        }
    } else {
        defaultVersion = ULTIMATE_LATEST_SEMVER;
    }
}

// TODO, semver-major: remove context fallback
/**
 * @param context The rule context.
 * @returns The result of this check.
 */
function detectReactVersion(context: RuleContext) {
    if (cachedDetectedReactVersion) {
        return cachedDetectedReactVersion;
    }

    const basedir = resolveBasedir(context);

    try {
        const reactPath = resolve.sync('react', { basedir });
        const react = consumerRequire(reactPath) as { version: string };
        cachedDetectedReactVersion = react.version;
        return cachedDetectedReactVersion;
    } catch (e) {
        if (e instanceof Error && 'code' in e && e.code === 'MODULE_NOT_FOUND') {
            if (!warnedForMissingVersion) {
                let sentence2 = 'Assuming latest React version for linting.';
                if (defaultVersion !== ULTIMATE_LATEST_SEMVER) {
                    sentence2 = `Assuming default React version for linting: "${defaultVersion}".`;
                }
                error(
                    `Warning: React version was set to "detect" in eslint-plugin-react settings, but the "react" package is not installed. ${sentence2}`,
                );
                warnedForMissingVersion = true;
            }
            cachedDetectedReactVersion = defaultVersion;
            return cachedDetectedReactVersion;
        }
        throw e;
    }
}

/**
 * @param context The rule context.
 * @returns The result of this check.
 */
function getReactVersionFromContext(context: RuleContext) {
    readDefaultReactVersionFromContext(context);
    let confVer = defaultVersion;
    // .eslintrc shared settings (https://eslint.org/docs/user-guide/configuring#adding-shared-settings)
    if (context.settings && context.settings.react && context.settings.react.version) {
        let settingsVersion = context.settings.react.version;
        if (settingsVersion === 'detect') {
            settingsVersion = detectReactVersion(context);
        }
        if (typeof settingsVersion !== 'string') {
            error(
                `Warning: React version specified in eslint-plugin-react-settings must be a string; got “${typeof settingsVersion}”`,
            );
        }
        confVer = String(settingsVersion);
    } else if (!warnedForMissingVersion) {
        error(
            'Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .',
        );
        warnedForMissingVersion = true;
    }

    const result = convertConfVerToSemver(confVer);
    if (!result) {
        error(
            `Warning: React version specified in eslint-plugin-react-settings must be a valid semver version, or "detect"; got “${confVer}”`,
        );
    }
    return result ? result.version : defaultVersion;
}

// TODO, semver-major: remove context fallback
/**
 * @param context The rule context.
 * @returns The result of this check.
 */
function detectFlowVersion(context: RuleContext) {
    const basedir = resolveBasedir(context);

    try {
        const flowPackageJsonPath = resolve.sync('flow-bin/package.json', { basedir });
        const flowPackageJson = consumerRequire(flowPackageJsonPath) as { version: string };
        return flowPackageJson.version;
    } catch (e) {
        if (e instanceof Error && 'code' in e && e.code === 'MODULE_NOT_FOUND') {
            error(
                'Warning: Flow version was set to "detect" in eslint-plugin-react settings, '
                    + 'but the "flow-bin" package is not installed. Assuming latest Flow version for linting.',
            );
            return ULTIMATE_LATEST_SEMVER;
        }
        throw e;
    }
}

/**
 * @param context The rule context.
 * @returns The result of this check.
 */
function getFlowVersionFromContext(context: RuleContext) {
    let confVer = defaultVersion;
    // .eslintrc shared settings (https://eslint.org/docs/user-guide/configuring#adding-shared-settings)
    if (context.settings.react && context.settings.react.flowVersion) {
        let { flowVersion } = context.settings.react;
        if (flowVersion === 'detect') {
            flowVersion = detectFlowVersion(context);
        }
        if (typeof flowVersion !== 'string') {
            error(
                'Warning: Flow version specified in eslint-plugin-react-settings must be a string; '
                    + `got “${typeof flowVersion}”`,
            );
        }
        confVer = String(flowVersion);
    } else {
        throw new Error('Could not retrieve flowVersion from settings');
    }

    const result = convertConfVerToSemver(confVer);
    if (!result) {
        error(
            `Warning: Flow version specified in eslint-plugin-react-settings must be a valid semver version, or "detect"; got “${confVer}”`,
        );
    }
    return result ? result.version : defaultVersion;
}

/**
 * @param semverRange The semver range value.
 * @param confVer The conf ver value.
 * @returns The result of this check.
 */
function test(semverRange: string, confVer: string) {
    return semver.satisfies(confVer, semverRange);
}

/**
 * @param context The rule context.
 * @param semverRange The semver range value.
 * @returns The result of this check.
 */
function testReactVersion(context: RuleContext, semverRange: string) {
    return test(semverRange, getReactVersionFromContext(context));
}

/**
 * @param context The rule context.
 * @param semverRange The semver range value.
 * @returns The result of this check.
 */
function testFlowVersion(context: RuleContext, semverRange: string) {
    return test(semverRange, getFlowVersionFromContext(context));
}

export default {
    testReactVersion,
    testFlowVersion,
    resetWarningFlag,
    resetDetectedVersion,
    resetDefaultVersion,
};
