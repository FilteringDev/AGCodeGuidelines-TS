// Options are validated against this rule's metadata schema before execution.
import iterateJsdoc from '../iterateJsdoc';

type Options = [
    {
        autoIncrementBase?: number;
        checkConstructors?: boolean;
        checkDestructured?: boolean;
        checkDestructuredRoots?: boolean;
        checkGetters?: boolean;
        checkRestProperty?: boolean;
        checkSetters?: boolean;
        checkTypesPattern?: string;
        contexts?: (string | { comment?: string; context?: string })[];
        enableFixer?: boolean;
        enableRestElementFixer?: boolean;
        enableRootFixer?: boolean;
        exemptedBy?: string[];
        ignoreWhenAllParamsMissing?: boolean;
        interfaceExemptsParamsCheck?: boolean;
        unnamedRootBase?: string[];
        useDefaultObjectProperties?: boolean;
    }?,
];

export type RootNamerReturn = [string, boolean, () => RootNamerReturn];

/**
 * @param desiredRoots The desired roots value.
 * @param currentIndex The current index value.
 * @returns The result of this check.
 */
const rootNamer = (
    desiredRoots: string[],
    currentIndex: number,
): RootNamerReturn => {
    let name: string;
    let idx = currentIndex;
    const incremented = desiredRoots.length <= 1;
    if (incremented) {
        const base = desiredRoots[0];
        const suffix = idx;
        idx += 1;
        name = `${base}${suffix}`;
    } else {
        name = desiredRoots.shift() as string;
    }

    return [
        name,
        incremented,
        () => rootNamer(desiredRoots, idx),
    ];
};

export default iterateJsdoc(
    ({
        context, jsdoc, node, utils,
    }) => {
        if (utils.avoidDocs()) {
            return;
        }

        // Param type is specified by type in @type
        if (utils.hasTag('type')) {
            return;
        }

        const {
            autoIncrementBase = 0,
            checkDestructured = true,
            checkDestructuredRoots = true,
            checkRestProperty = false,
            checkTypesPattern = '/^(?:[oO]bject|[aA]rray|PlainObject|Generic(?:Object|Array))$/',
            enableFixer = true,
            enableRestElementFixer = true,
            enableRootFixer = true,
            ignoreWhenAllParamsMissing = false,
            interfaceExemptsParamsCheck = false,
            unnamedRootBase = ['root'],
            useDefaultObjectProperties = false,
        } = (context.options as Options)[0] || {};

        if (
            interfaceExemptsParamsCheck
            && node
            && node.parent?.type === 'VariableDeclarator'
            && 'typeAnnotation' in node.parent.id
            && node.parent.id.typeAnnotation
        ) {
            return;
        }

        const preferredTagName = utils.getPreferredTagName({
            tagName: 'param',
        }) as string;
        if (!preferredTagName) {
            return;
        }

        const functionParameterNames = utils.getFunctionParameterNames(
            useDefaultObjectProperties,
            interfaceExemptsParamsCheck,
        );
        if (!functionParameterNames.length) {
            return;
        }

        const jsdocParameterNames = utils.getJsdocTagsDeep(preferredTagName) as {
            idx: import('../iterateJsdoc').Integer;
            name: string;
            type: string;
        }[];

        if (ignoreWhenAllParamsMissing && !jsdocParameterNames.length) {
            return;
        }

        const shallowJsdocParameterNames = jsdocParameterNames
            .filter((tag) => !tag.name.includes('.'))
            .map((tag, idx) => ({
                ...tag,
                idx,
            }));

        const checkTypesRegex = utils.getRegexFromString(checkTypesPattern);

        const missingTags: {
            functionParameterIdx: import('../iterateJsdoc').Integer;
            functionParameterName: string;
            inc: boolean | undefined;
            remove?: true;
            type?: string | undefined;
        }[] = [];
        const flattenedRoots = utils.flattenRoots(functionParameterNames).names;

        const paramIndex: {
            [key: string]: import('../iterateJsdoc').Integer;
        } = {};

        /**
         * @param cur The cur value.
         * @returns The result of this check.
         */
        const hasParamIndex = (cur: string): boolean => utils.dropPathSegmentQuotes(String(cur)) in paramIndex;

        /**
         *
         * @param cur The cur value.
         * @returns The result of this check.
         */
        const getParamIndex = (
            cur: string | number | undefined,
        ): import('../iterateJsdoc').Integer => paramIndex[utils.dropPathSegmentQuotes(String(cur))]!;

        /**
         *
         * @param cur The cur value.
         * @param idx The idx value.
         */
        const setParamIndex = (
            cur: string,
            idx: import('../iterateJsdoc').Integer,
        ): void => {
            paramIndex[utils.dropPathSegmentQuotes(String(cur))] = idx;
        };

        Array.from(flattenedRoots.entries()).forEach(([idx, cur]) => {
            setParamIndex(cur, idx);
        });

        /**
         *
         * @param jsdocTags The jsdoc tags value.
         * @param indexAtFunctionParams The index at function params value.
         * @returns The result of this check.
         */
        const findExpectedIndex = (
            jsdocTags: (import('@es-joy/jsdoccomment').JsdocTagWithInline & {
                newAdd?: boolean;
            })[],
            indexAtFunctionParams: import('../iterateJsdoc').Integer,
        ): {
            foundIndex: import('../iterateJsdoc').Integer;
            tagLineCount: import('../iterateJsdoc').Integer;
        } => {
            // Get the parameters that come after the current index in the flattened order
            const remainingFlattenedRoots = flattenedRoots.slice(
                (indexAtFunctionParams || 0) + 1,
            );

            // Find the first existing tag that comes after the current parameter in the flattened order
            const foundIndex = jsdocTags.findIndex(({ name, newAdd }) => {
                if (newAdd) {
                    return false;
                }

                // Check if the tag name matches any of the remaining flattened roots
                return remainingFlattenedRoots.some((flattenedRoot) => {
                    // The flattened roots don't have the root prefix (e.g., "bar", "bar.baz")
                    // but JSDoc tags do (e.g., "root0", "root0.bar", "root0.bar.baz")
                    // So we need to check if the tag name ends with the flattened root

                    // Check if tag name ends with ".<flattenedRoot>"
                    if (name.endsWith(`.${flattenedRoot}`)) {
                        return true;
                    }

                    // Also check if tag name exactly matches the flattenedRoot
                    //   (for single-level params)
                    if (name === flattenedRoot) {
                        return true;
                    }

                    return false;
                });
            });

            const tags = foundIndex > -1
                ? jsdocTags.slice(0, foundIndex)
                : jsdocTags.filter(({ tag }) => tag === preferredTagName);

            let tagLineCount = 0;
            (tags).forEach(({ source }) => {
                (source).forEach(({
                    tokens: { end },
                }) => {
                    if (!end) {
                        tagLineCount += 1;
                    }
                });
            });

            return {
                foundIndex,
                tagLineCount,
            };
        };

        let [nextRootName, incremented, namer] = rootNamer(
            [...unnamedRootBase],
            autoIncrementBase,
        );

        const thisOffset = functionParameterNames[0] === 'this' ? 1 : 0;

        Array.from(functionParameterNames.entries()).forEach(([
            functionParameterIdx,
            functionParameterName,
        ]) => {
            let inc: boolean | undefined;
            if (Array.isArray(functionParameterName)) {
                const matchedJsdoc = shallowJsdocParameterNames[
                    functionParameterIdx - thisOffset
                ];

                let rootName: string;
                if (functionParameterName[0]) {
                    [rootName] = functionParameterName;
                } else if (matchedJsdoc && matchedJsdoc.name) {
                    rootName = matchedJsdoc.name;
                    if (
                        matchedJsdoc.type
                        && matchedJsdoc.type.search(checkTypesRegex) === -1
                    ) {
                        return;
                    }
                } else {
                    rootName = nextRootName;
                    inc = incremented;
                }

                [nextRootName, incremented, namer] = namer();

                const {
                    hasPropertyRest, hasRestElement, names, rests,
                } = functionParameterName[1] as import('../jsdocUtils').FlattendRootInfo & {
                    annotationParamName?: string | undefined;
                };
                const notCheckingNames: string[] = [];
                if (!enableRestElementFixer && hasRestElement) {
                    return;
                }

                if (!checkDestructuredRoots) {
                    return;
                }

                Array.from(names.entries()).forEach(([idx, paramName]) => {
                    // Add root if the root name is not in the docs (and is not already
                    //  in the tags to be fixed)
                    if (
                        !jsdocParameterNames.find(({ name }) => name === rootName)
                        && !missingTags.find(({ functionParameterName: fpn }) => fpn === rootName)
                    ) {
                        const emptyParamIdx = jsdocParameterNames.findIndex(
                            ({ name }) => !name,
                        );

                        if (emptyParamIdx > -1) {
                            missingTags.push({
                                functionParameterIdx: emptyParamIdx,
                                functionParameterName: rootName,
                                inc,
                                remove: true,
                            });
                        } else {
                            missingTags.push({
                                functionParameterIdx: hasParamIndex(rootName)
                                    ? getParamIndex(rootName)
                                    : getParamIndex(paramName),
                                functionParameterName: rootName,
                                inc,
                            });
                        }
                    }

                    if (!checkDestructured) {
                        return;
                    }

                    if (!checkRestProperty && rests[idx]) {
                        return;
                    }

                    const fullParamName = `${rootName}.${paramName}`;

                    const notCheckingName = jsdocParameterNames.find(
                        ({ name, type: paramType }) => (
                            utils.comparePaths(name)(fullParamName)
                                && paramType.search(checkTypesRegex) === -1
                                && paramType !== ''
                        ),
                    );

                    if (notCheckingName !== undefined) {
                        notCheckingNames.push(notCheckingName.name);
                    }

                    if (
                        notCheckingNames.find((name) => fullParamName.startsWith(name))
                    ) {
                        return;
                    }

                    if (
                        jsdocParameterNames
                        && !jsdocParameterNames.find(({ name }) => utils.comparePaths(name)(fullParamName))
                    ) {
                        missingTags.push({
                            functionParameterIdx: getParamIndex(
                                functionParameterName[0]
                                    ? fullParamName
                                    : paramName,
                            ),
                            functionParameterName: fullParamName,
                            inc,
                            type:
                                hasRestElement && !hasPropertyRest
                                    ? '{...any}'
                                    : undefined,
                        });
                    }
                });

                return;
            }

            let funcParamName: string;
            let type;
            if (typeof functionParameterName === 'object') {
                if (
                    !enableRestElementFixer
                    && functionParameterName.restElement
                ) {
                    return;
                }

                funcParamName = functionParameterName.name as string;
                type = '{...any}';
            } else {
                funcParamName = functionParameterName as string;
            }

            if (
                jsdocParameterNames
                && !jsdocParameterNames.find(({ name }) => name === funcParamName)
                && funcParamName !== 'this'
            ) {
                missingTags.push({
                    functionParameterIdx: getParamIndex(funcParamName),
                    functionParameterName: funcParamName,
                    inc,
                    type,
                });
            }
        });

        /**
         *
         * @param root0 The root0 value.
         * @param root0.functionParameterIdx The function parameter idx value.
         * @param root0.functionParameterName The function parameter name value.
         * @param root0.remove The remove value.
         * @param root0.inc The inc value.
         * @param root0.type The type value.
         *
         *
         *
         *
         *
         *  cfg
         */
        const fix = (root0: {
            functionParameterIdx: import('../iterateJsdoc').Integer;
            functionParameterName: string;
            remove?: true;
            inc?: boolean;
            type?: string;
        }) => {
            const {
                functionParameterIdx,
                functionParameterName,
                inc,
                remove,
                type,
            } = root0;

            if (inc && !enableRootFixer) {
                return;
            }

            /**
             *
             * @param tagIndex The tag index value.
             * @param sourceIndex The source index value.
             * @param spliceCount The splice count value.
             */
            const createTokens = (
                tagIndex: import('../iterateJsdoc').Integer,
                sourceIndex: import('../iterateJsdoc').Integer,
                spliceCount: import('../iterateJsdoc').Integer,
            ): void => {
                // console.log(sourceIndex, tagIndex, jsdoc.tags, jsdoc.source);
                const tokens = {
                    number: sourceIndex + 1,
                    source: '',
                    tokens: {
                        delimiter: '*',
                        description: '',
                        end: '',
                        lineEnd: '',
                        name: functionParameterName,
                        newAdd: true,
                        postDelimiter: ' ',
                        postName: '',
                        postTag: ' ',
                        postType: type ? ' ' : '',
                        start: jsdoc.source[sourceIndex]!.tokens.start,
                        tag: `@${preferredTagName}`,
                        type: type ?? '',
                    },
                };

                (
                    jsdoc.tags as (import('@es-joy/jsdoccomment').JsdocTagWithInline & {
                        newAdd?: true;
                    })[]
                ).splice(tagIndex, spliceCount, {
                    description: '',
                    inlineTags: [],
                    name: functionParameterName,
                    newAdd: true,
                    optional: false,
                    problems: [],
                    source: [tokens],
                    tag: preferredTagName,
                    type: type ?? '',
                });
                const firstNumber = jsdoc.source[0]!.number;
                jsdoc.source.splice(sourceIndex, spliceCount, tokens);
                Array.from(jsdoc.source
                    .slice(sourceIndex)
                    .entries()).forEach(([idx, src]) => {
                    Object.assign(src, { number: firstNumber + sourceIndex + idx });
                });
            };

            const offset = jsdoc.source.findIndex(
                ({ tokens: { end, tag } }) => tag || end,
            );
            if (remove) {
                createTokens(
                    functionParameterIdx,
                    offset + functionParameterIdx,
                    1,
                );
            } else {
                const { foundIndex, tagLineCount: expectedIdx } = findExpectedIndex(jsdoc.tags, functionParameterIdx);

                const firstParamLine = jsdoc.source.findIndex(({ tokens }) => tokens.tag === `@${preferredTagName}`);
                const baseOffset = foundIndex > -1 || firstParamLine === -1
                    ? offset
                    : firstParamLine;

                createTokens(expectedIdx, baseOffset + expectedIdx, 0);
            }
        };

        const fixer = (): void => {
            (missingTags).forEach((missingTag) => {
                fix(missingTag);
            });
        };

        if (missingTags.length && jsdoc.source.length === 1) {
            utils.makeMultiline();
        }

        (missingTags).forEach(({ functionParameterName }) => {
            utils.reportJSDoc(
                `Missing JSDoc @${preferredTagName} "${functionParameterName}" declaration.`,
                null,
                enableFixer ? fixer : null,
            );
        });
    },
    {
        contextDefaults: true,
        meta: {
            docs: {
                description:
                    'Requires that all function parameters are documented with a `@param` tag.',
                url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/require-param.md#repos-sticky-header',
            },
            fixable: 'code',
            schema: [
                {
                    additionalProperties: false,
                    properties: {
                        autoIncrementBase: {
                            default: 0,
                            description: `Numeric to indicate the number at which to begin auto-incrementing roots.
Defaults to \`0\`.`,
                            type: 'integer',
                        },
                        checkConstructors: {
                            default: true,
                            description: `A value indicating whether \`constructor\`s should be checked. Defaults to
\`true\`.`,
                            type: 'boolean',
                        },
                        checkDestructured: {
                            default: true,
                            description:
                                'Whether to require destructured properties. Defaults to `true`.',
                            type: 'boolean',
                        },
                        checkDestructuredRoots: {
                            default: true,
                            description: `Whether to check the existence of a corresponding \`@param\` for root objects
of destructured properties (e.g., that for \`function ({a, b}) {}\`, that there
is something like \`@param myRootObj\` defined that can correspond to
the \`{a, b}\` object parameter).

If \`checkDestructuredRoots\` is \`false\`, \`checkDestructured\` will also be
implied to be \`false\` (i.e., the inside of the roots will not be checked
either, e.g., it will also not complain if \`a\` or \`b\` do not have their own
documentation). Defaults to \`true\`.`,
                            type: 'boolean',
                        },
                        checkGetters: {
                            default: false,
                            description:
                                'A value indicating whether getters should be checked. Defaults to `false`.',
                            type: 'boolean',
                        },
                        checkRestProperty: {
                            default: false,
                            description: `If set to \`true\`, will report (and add fixer insertions) for missing rest
properties. Defaults to \`false\`.

If set to \`true\`, note that you can still document the subproperties of the
rest property using other jsdoc features, e.g., \`@typedef\`:

\`\`\`js
/**
 * @typedef ExtraOptions
 * @property innerProp1
 * @property innerProp2
 */

/**
 * @param cfg
 * @param cfg.num
 * @param {ExtraOptions} extra
 */
function quux ({num, ...extra}) {
}
\`\`\`

Setting this option to \`false\` (the default) may be useful in cases where
you already have separate \`@param\` definitions for each of the properties
within the rest property.

For example, with the option disabled, this will not give an error despite
\`extra\` not having any definition:

\`\`\`js
/**
 * @param cfg
 * @param cfg.num
 */
function quux ({num, ...extra}) {
}
\`\`\`

Nor will this:

\`\`\`js
/**
 * @param cfg
 * @param cfg.num
 * @param cfg.innerProp1
 * @param cfg.innerProp2
 */
function quux ({num, ...extra}) {
}
\`\`\``,
                            type: 'boolean',
                        },
                        checkSetters: {
                            default: false,
                            description:
                                'A value indicating whether setters should be checked. Defaults to `false`.',
                            type: 'boolean',
                        },
                        checkTypesPattern: {
                            description: `When one specifies a type, unless it is of a generic type, like \`object\`
or \`array\`, it may be considered unnecessary to have that object's
destructured components required, especially where generated docs will
link back to the specified type. For example:

\`\`\`js
/**
 * @param {SVGRect} bbox - a SVGRect
 */
export const bboxToObj = function ({x, y, width, height}) {
  return {x, y, width, height};
};
\`\`\`

By default \`checkTypesPattern\` is set to
\`/^(?:[oO]bject|[aA]rray|PlainObject|Generic(?:Object|Array))$/v\`,
meaning that destructuring will be required only if the type of the \`@param\`
(the text between curly brackets) is a match for "Object" or "Array" (with or
without initial caps), "PlainObject", or "GenericObject", "GenericArray" (or
if no type is present). So in the above example, the lack of a match will
mean that no complaint will be given about the undocumented destructured
parameters.

Note that the \`/\` delimiters are optional, but necessary to add flags.

Defaults to using (only) the \`v\` flag, so to add your own flags, encapsulate
your expression as a string, but like a literal, e.g., \`/^object$/vi\`.

You could set this regular expression to a more expansive list, or you
could restrict it such that even types matching those strings would not
need destructuring.`,
                            type: 'string',
                        },
                        contexts: {
                            description: `Set this to an array of strings representing the AST context (or an object with
optional \`context\` and \`comment\` properties) where you wish the rule to be applied.

\`context\` defaults to \`any\` and \`comment\` defaults to no specific comment context.

Overrides the default contexts (\`ArrowFunctionExpression\`, \`FunctionDeclaration\`,
\`FunctionExpression\`). May be useful for adding such as
\`TSMethodSignature\` in TypeScript or restricting the contexts
which are checked.

See the ["AST and Selectors"](../advanced.md#ast-and-selectors)
section of our Advanced docs for more on the expected format.`,
                            items: {
                                anyOf: [
                                    {
                                        type: 'string',
                                    },
                                    {
                                        additionalProperties: false,
                                        properties: {
                                            comment: {
                                                type: 'string',
                                            },
                                            context: {
                                                type: 'string',
                                            },
                                        },
                                        type: 'object',
                                    },
                                ],
                            },
                            type: 'array',
                        },
                        enableFixer: {
                            description:
                                'Whether to enable the fixer. Defaults to `true`.',
                            type: 'boolean',
                        },
                        enableRestElementFixer: {
                            description: `Whether to enable the rest element fixer.

The fixer will automatically report/insert
[JSDoc repeatable parameters](https://jsdoc.app/tags-param.html#multiple-types-and-repeatable-parameters)
if missing.

\`\`\`js
/**
  * @param {GenericArray} cfg
  * @param {number} cfg."0"
 */
function baar ([a, ...extra]) {
  //
}
\`\`\`

...becomes:

\`\`\`js
/**
  * @param {GenericArray} cfg
  * @param {number} cfg."0"
  * @param {...any} cfg."1"
 */
function baar ([a, ...extra]) {
  //
}
\`\`\`

Note that the type \`any\` is included since we don't know of any specific
type to use.

Defaults to \`true\`.`,
                            type: 'boolean',
                        },
                        enableRootFixer: {
                            description: `Whether to enable the auto-adding of incrementing roots.

The default behavior of \`true\` is for "root" to be auto-inserted for missing
roots, followed by a 0-based auto-incrementing number.

So for:

\`\`\`js
function quux ({foo}, {bar}, {baz}) {
}
\`\`\`

...the default JSDoc that would be added if the fixer is enabled would be:

\`\`\`js
/**
* @param root0
* @param root0.foo
* @param root1
* @param root1.bar
* @param root2
* @param root2.baz
*/
\`\`\`

Has no effect if \`enableFixer\` is set to \`false\`.`,
                            type: 'boolean',
                        },
                        exemptedBy: {
                            description: `Array of tags (e.g., \`['type']\`) whose presence on the document block
avoids the need for a \`@param\`. Defaults to an array with
\`inheritdoc\`. If you set this array, it will overwrite the default,
so be sure to add back \`inheritdoc\` if you wish its presence to cause
exemption of the rule.`,
                            items: {
                                type: 'string',
                            },
                            type: 'array',
                        },
                        ignoreWhenAllParamsMissing: {
                            description: `Set to \`true\` to ignore reporting when all params are missing. Defaults to
\`false\`.`,
                            type: 'boolean',
                        },
                        interfaceExemptsParamsCheck: {
                            description: `Set if you wish TypeScript interfaces to exempt checks for the existence of
\`@param\`'s.

Will check for a type defining the function itself (on a variable
declaration) or if there is a single destructured object with a type.
Defaults to \`false\`.`,
                            type: 'boolean',
                        },
                        unnamedRootBase: {
                            description: `An array of root names to use in the fixer when roots are missing. Defaults
to \`['root']\`. Note that only when all items in the array besides the last
are exhausted will auto-incrementing occur. So, with
\`unnamedRootBase: ['arg', 'config']\`, the following:

\`\`\`js
function quux ({foo}, [bar], {baz}) {
}
\`\`\`

...will get the following JSDoc block added:

\`\`\`js
/**
* @param arg
* @param arg.foo
* @param config0
* @param config0."0" (\`bar\`)
* @param config1
* @param config1.baz
*/
\`\`\``,
                            items: {
                                type: 'string',
                            },
                            type: 'array',
                        },
                        useDefaultObjectProperties: {
                            description: `Set to \`true\` if you wish to expect documentation of properties on objects
supplied as default values. Defaults to \`false\`.`,
                            type: 'boolean',
                        },
                    },
                    type: 'object',
                },
            ],
            type: 'suggestion',
        },

        // We cannot cache comment nodes as the contexts may recur with the
        //  same comment node but a different JS node, and we may need the different
        //  JS node to ensure we iterate its context
        noTracking: true,
    },
);
