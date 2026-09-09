/**
 * @file Enforce PascalCase for user-defined JSX components
 * @author Jake Marsh
 */
import dependency0 from 'jsx-ast-utils/elementType.js';
import dependency1 from 'minimatch';
import type { LegacyRule, Node } from '../../types';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/jsx';
import dependency4 from '../util/report';

const elementType = dependency0;
const minimatch = dependency1;
const docsUrl = dependency2;
const jsxUtil = dependency3;
const report = dependency4;

/**
 * @param char The char value.
 * @returns The result of this check.
 */
function testDigit(char: string) {
    const charCode = char.charCodeAt(0);
    return charCode >= 48 && charCode <= 57;
}

/**
 * @param char The char value.
 * @returns The result of this check.
 */
function testUpperCase(char: string) {
    const upperCase = char.toUpperCase();
    return char === upperCase && upperCase !== char.toLowerCase();
}

/**
 * @param char The char value.
 * @returns The result of this check.
 */
function testLowerCase(char: string) {
    const lowerCase = char.toLowerCase();
    return char === lowerCase && lowerCase !== char.toUpperCase();
}

/**
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function testPascalCase(name: string | undefined) {
    if (!testUpperCase(name!.charAt(0))) {
        return false;
    }
    const anyNonAlphaNumeric = Array.prototype.some.call(
        name!.slice(1),
        (char: string) => char.toLowerCase() === char.toUpperCase() && !testDigit(char),
    );
    if (anyNonAlphaNumeric) {
        return false;
    }
    return Array.prototype.some.call(
        name!.slice(1),
        (char: string) => testLowerCase(char) || testDigit(char),
    );
}

/**
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function testAllCaps(name: string | undefined) {
    const firstChar = name!.charAt(0);
    if (!(testUpperCase(firstChar) || testDigit(firstChar))) {
        return false;
    }
    for (let i = 1; i < name!.length - 1; i += 1) {
        const char = name!.charAt(i);
        if (!(testUpperCase(char) || testDigit(char) || char === '_')) {
            return false;
        }
    }
    const lastChar = name!.charAt(name!.length - 1);
    if (!(testUpperCase(lastChar) || testDigit(lastChar))) {
        return false;
    }
    return true;
}

/**
 * @param ignore The ignore value.
 * @param name The name to inspect.
 * @returns The result of this check.
 */
function ignoreCheck(ignore: (string | undefined)[], name: string | undefined) {
    return ignore.some((entry) => name === entry || minimatch(name!, entry!, { noglobstar: true }));
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    usePascalCase: 'Imported JSX component {{name}} must be in PascalCase',
    usePascalOrSnakeCase:
        'Imported JSX component {{name}} must be in PascalCase or SCREAMING_SNAKE_CASE',
};

const rule: LegacyRule<
    [
        {
            allowAllCaps?: boolean;
            allowLeadingUnderscore?: boolean;
            allowNamespace?: boolean;
            ignore?: [string?];
        }?,
    ]
> = {
    meta: {
        docs: {
            description: 'Enforce PascalCase for user-defined JSX components',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-pascal-case'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    allowAllCaps: {
                        type: 'boolean',
                    },
                    allowLeadingUnderscore: {
                        type: 'boolean',
                    },
                    allowNamespace: {
                        type: 'boolean',
                    },
                    ignore: {
                        items: [
                            {
                                type: 'string',
                            },
                        ],
                        minItems: 0,
                        type: 'array',
                        uniqueItems: true,
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || {};
        const allowAllCaps = configuration.allowAllCaps || false;
        const allowLeadingUnderscore = configuration.allowLeadingUnderscore || false;
        const allowNamespace = configuration.allowNamespace || false;
        const ignore = configuration.ignore || [];

        return {
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                const isCompatTag = jsxUtil.isDOMComponent(node);
                if (isCompatTag) {
                    return undefined;
                }

                const name = elementType(node);
                let checkNames = [name];
                let index = 0;

                if (name.lastIndexOf(':') > -1) {
                    checkNames = name.split(':');
                } else if (name.lastIndexOf('.') > -1) {
                    checkNames = name.split('.');
                }

                do {
                    const splitName = checkNames[index];
                    if (splitName!.length === 1) {
                        return undefined;
                    }
                    const isIgnored = ignoreCheck(ignore, splitName);

                    const checkName = allowLeadingUnderscore && splitName!.startsWith('_')
                        ? splitName!.slice(1)
                        : splitName;
                    const isPascalCase = testPascalCase(checkName);
                    const isAllowedAllCaps = allowAllCaps && testAllCaps(checkName);

                    if (!isPascalCase && !isAllowedAllCaps && !isIgnored) {
                        const messageId = allowAllCaps ? 'usePascalOrSnakeCase' : 'usePascalCase';
                        report(context, messages[messageId], messageId, {
                            node,
                            data: {
                                name: splitName,
                            },
                        });
                        break;
                    }
                    index += 1;
                } while (index < checkNames.length && !allowNamespace);

                return undefined;
            },
        };
    },
};

export default rule;
