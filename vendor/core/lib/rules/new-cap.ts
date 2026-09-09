/**
 * @file Rule to flag use of constructors without capital letters
 * @author Nicholas C. Zakas
 */
import dependency0 from './utils/ast-utils';
import type { LegacyListener, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const CAPS_ALLOWED = [
    'Array',
    'Boolean',
    'Date',
    'Error',
    'Function',
    'Number',
    'Object',
    'RegExp',
    'String',
    'Symbol',
    'BigInt',
];

/**
 * Ensure that if the key is provided, it must be an array.
 * @param obj Object to check with `key`.
 * @param obj.newIsCap The new is cap value.
 * @param obj.capIsNew The cap is new value.
 * @param obj.newIsCapExceptions The new is cap exceptions value.
 * @param obj.newIsCapExceptionPattern The new is cap exception pattern value.
 * @param obj.capIsNewExceptions The cap is new exceptions value.
 * @param obj.capIsNewExceptionPattern The cap is new exception pattern value.
 * @param obj.properties The properties value.
 * @param key Object key to check on `obj`.
 * @param fallback If obj[key] is not present, this will be returned.
 * @throws If key is not an own array type property of `obj`.
 * @returns Returns obj[key] if it's an Array, otherwise `fallback`
 */
function checkArray(
    obj: {
        newIsCap?: boolean;
        capIsNew?: boolean;
        newIsCapExceptions?: string[];
        newIsCapExceptionPattern?: string;
        capIsNewExceptions?: string[];
        capIsNewExceptionPattern?: string;
        properties?: boolean;
    },
    key: 'newIsCapExceptions' | 'capIsNewExceptions',
    fallback: string[],
) {
    /* c8 ignore start */
    if (Object.prototype.hasOwnProperty.call(obj, key) && !Array.isArray(obj[key])) {
        throw new TypeError(`${key}, if provided, must be an Array`);
    } /* c8 ignore stop */
    return obj[key] || fallback;
}

/**
 * A reducer function to invert an array to an Object mapping the string form of the key, to `true`.
 * @param map Accumulator object for the reduce.
 * @param key Object key to set to `true`.
 * @returns Returns the updated Object for further reduction.
 */
function invert(map: Record<string, boolean>, key: string) {
    Object.assign(map, { [key]: true });
    return map;
}

/**
 * Creates an object with the cap is new exceptions as its keys and true as their values.
 * @param config Rule configuration
 * @param config.newIsCap The new is cap value.
 * @param config.capIsNew The cap is new value.
 * @param config.newIsCapExceptions The new is cap exceptions value.
 * @param config.newIsCapExceptionPattern The new is cap exception pattern value.
 * @param config.capIsNewExceptions The cap is new exceptions value.
 * @param config.capIsNewExceptionPattern The cap is new exception pattern value.
 * @param config.properties The properties value.
 * @returns Object with cap is new exceptions.
 */
function calculateCapIsNewExceptions(config: {
    newIsCap?: boolean;
    capIsNew?: boolean;
    newIsCapExceptions?: string[];
    newIsCapExceptionPattern?: string;
    capIsNewExceptions?: string[];
    capIsNewExceptionPattern?: string;
    properties?: boolean;
}) {
    let capIsNewExceptions = checkArray(config, 'capIsNewExceptions', CAPS_ALLOWED);

    if (capIsNewExceptions !== CAPS_ALLOWED) {
        capIsNewExceptions = capIsNewExceptions.concat(CAPS_ALLOWED);
    }

    return capIsNewExceptions.reduce(invert, {});
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        {
            newIsCap?: boolean;
            capIsNew?: boolean;
            newIsCapExceptions?: string[];
            newIsCapExceptionPattern?: string;
            capIsNewExceptions?: string[];
            capIsNewExceptionPattern?: string;
            properties?: boolean;
        }?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Require constructor names to begin with a capital letter',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/new-cap',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    newIsCap: {
                        type: 'boolean',
                        default: true,
                    },
                    capIsNew: {
                        type: 'boolean',
                        default: true,
                    },
                    newIsCapExceptions: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    newIsCapExceptionPattern: {
                        type: 'string',
                    },
                    capIsNewExceptions: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    capIsNewExceptionPattern: {
                        type: 'string',
                    },
                    properties: {
                        type: 'boolean',
                        default: true,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            upper: 'A function with a name starting with an uppercase letter should only be used as a constructor.',
            lower: 'A constructor name should not start with a lowercase letter.',
        },
    },

    create(context) {
        const config = { ...context.options[0] };

        config.newIsCap = config.newIsCap !== false;
        config.capIsNew = config.capIsNew !== false;
        const skipProperties = config.properties === false;

        const newIsCapExceptions = checkArray(config, 'newIsCapExceptions', []).reduce(
            invert,
            {},
        );
        const newIsCapExceptionPattern = config.newIsCapExceptionPattern
            ? new RegExp(config.newIsCapExceptionPattern, 'u')
            : null;

        const capIsNewExceptions = calculateCapIsNewExceptions(config);
        const capIsNewExceptionPattern = config.capIsNewExceptionPattern
            ? new RegExp(config.capIsNewExceptionPattern, 'u')
            : null;

        const listeners: LegacyListener = {};

        const { sourceCode } = context;

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Get exact callee name from expression
         * @param node CallExpression or NewExpression node
         * @returns name
         */
        function extractNameFromExpression(node: Node<'CallExpression' | 'NewExpression'>) {
            return node.callee.type === 'Identifier'
                ? node.callee.name
                : astUtils.getStaticPropertyName(node.callee) || '';
        }

        /**
         * Returns the capitalization state of the string -
         * Whether the first character is uppercase, lowercase, or non-alphabetic
         * @param str String
         * @returns capitalization state: "non-alpha", "lower", or "upper"
         */
        function getCap(str: string) {
            const firstChar = str.charAt(0);

            const firstCharLower = firstChar.toLowerCase();
            const firstCharUpper = firstChar.toUpperCase();

            if (firstCharLower === firstCharUpper) {
                // char has no uppercase variant, so it's non-alphabetic
                return 'non-alpha';
            }
            if (firstChar === firstCharLower) {
                return 'lower';
            }
            return 'upper';
        }

        /**
         * Check if capitalization is allowed for a CallExpression
         * @param allowedMap Object mapping calleeName to a Boolean
         * @param node CallExpression node
         * @param calleeName Capitalized callee name from a CallExpression
         * @param pattern RegExp object from options pattern
         * @returns Returns true if the callee may be capitalized
         */
        function isCapAllowed(
            allowedMap: Record<string, boolean>,
            node: Node<'CallExpression' | 'NewExpression'>,
            calleeName: string,
            pattern: RegExp | null,
        ) {
            const sourceText = sourceCode.getText(node.callee);

            if (allowedMap[calleeName] || allowedMap[sourceText]) {
                return true;
            }

            if (pattern && pattern.test(sourceText)) {
                return true;
            }

            const callee = astUtils.skipChainExpression(node.callee);

            if (calleeName === 'UTC' && callee.type === 'MemberExpression') {
                // allow if callee is Date.UTC
                return callee.object.type === 'Identifier' && callee.object.name === 'Date';
            }

            return skipProperties && callee.type === 'MemberExpression';
        }

        /**
         * Reports the given messageId for the given node. The location will be the start of the property or the
         * callee.
         * @param node CallExpression or NewExpression node.
         * @param messageId The messageId to report.
         */
        function report(node: Node<'CallExpression' | 'NewExpression'>, messageId: string) {
            let callee: Node = astUtils.skipChainExpression(node.callee);

            if (callee.type === 'MemberExpression') {
                callee = callee.property;
            }

            context.report({ node, loc: callee.loc, messageId });
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        if (config.newIsCap) {
            listeners.NewExpression = function listenersNewExpression(
                node: Node<'NewExpression'>,
            ) {
                const constructorName = extractNameFromExpression(node);

                if (constructorName) {
                    const capitalization = getCap(constructorName);
                    const isAllowed = capitalization !== 'lower'
                        || isCapAllowed(
                            newIsCapExceptions,
                            node,
                            constructorName,
                            newIsCapExceptionPattern,
                        );

                    if (!isAllowed) {
                        report(node, 'lower');
                    }
                }
            };
        }

        if (config.capIsNew) {
            listeners.CallExpression = function listenersCallExpression(
                node: Node<'CallExpression'>,
            ) {
                const calleeName = extractNameFromExpression(node);

                if (calleeName) {
                    const capitalization = getCap(calleeName);
                    const isAllowed = capitalization !== 'upper'
                        || isCapAllowed(
                            capIsNewExceptions,
                            node,
                            calleeName,
                            capIsNewExceptionPattern,
                        );

                    if (!isAllowed) {
                        report(node, 'upper');
                    }
                }
            };
        }

        return listeners;
    },
};

export default rule;
