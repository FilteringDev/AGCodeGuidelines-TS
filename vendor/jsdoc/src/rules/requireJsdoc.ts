import type { TSESTree } from '@typescript-eslint/types';
// Options are validated against this rule's metadata schema before execution.
import {
    getDecorator,
    getJSDocComment,
    getReducedASTNode,
} from '@es-joy/jsdoccomment';
import exportParser from '../exportParser';
import { getSettings } from '../iterateJsdoc';
import {
    enforcedContexts,
    exemptSpeciaMethods,
    getContextObject,
    getFunctionParameterNames,
    getIndent,
    hasReturnValue,
    isConstructor,
} from '../jsdocUtils';

type Options = [
    {
        checkAllFunctionExpressions?: boolean;
        checkConstructors?: boolean;
        checkGetters?: boolean | 'no-setter';
        checkSetters?: boolean | 'no-getter';
        contexts?: (
            | string
            | {
                context?: string;
                inlineCommentBlock?: boolean;
                minLineCount?: number;
            }
        )[];
        enableFixer?: boolean;
        exemptEmptyConstructors?: boolean;
        exemptEmptyFunctions?: boolean;
        exemptOverloadedImplementations?: boolean;
        fixerMessage?: string;
        minLineCount?: number;
        publicOnly?:
            | boolean
            | {
                ancestorsOnly?: boolean;
                cjs?: boolean;
                esm?: boolean;
                window?: boolean;
            };
        require?: {
            ArrowFunctionExpression?: boolean;
            ClassDeclaration?: boolean;
            ClassExpression?: boolean;
            FunctionDeclaration?: boolean;
            FunctionExpression?: boolean;
            MethodDefinition?: boolean;
        };
        skipInterveningOverloadedDeclarations?: boolean;
    }?,
];

export type RequireJsdocOpts = {
    ancestorsOnly: boolean;
    esm: boolean;
    initModuleExports: boolean;
    initWindow: boolean;
};

export type ESLintOrTSNode =
    | import('eslint').Rule.Node
    | TSESTree.Node;

const OPTIONS_SCHEMA: import('json-schema').JSONSchema4 = {
    additionalProperties: false,
    properties: {
        checkAllFunctionExpressions: {
            default: false,
            description: `Normally, when \`FunctionExpression\` is checked, additional checks are
added to check the parent contexts where reporting is likely to be desired. If you really
want to check *all* function expressions, then set this to \`true\`.`,
            type: 'boolean',
        },
        checkConstructors: {
            default: true,
            description: `A value indicating whether \`constructor\`s should be checked. Defaults to
\`true\`. When \`true\`, \`exemptEmptyConstructors\` may still avoid reporting when
no parameters or return values are found.`,
            type: 'boolean',
        },
        checkGetters: {
            anyOf: [
                {
                    type: 'boolean',
                },
                {
                    enum: ['no-setter'],
                    type: 'string',
                },
            ],
            default: true,
            description: `A value indicating whether getters should be checked. Besides setting as a
boolean, this option can be set to the string \`"no-setter"\` to indicate that
getters should be checked but only when there is no setter. This may be useful
if one only wishes documentation on one of the two accessors. Defaults to
\`false\`.`,
        },
        checkSetters: {
            anyOf: [
                {
                    type: 'boolean',
                },
                {
                    enum: ['no-getter'],
                    type: 'string',
                },
            ],
            default: true,
            description: `A value indicating whether setters should be checked. Besides setting as a
boolean, this option can be set to the string \`"no-getter"\` to indicate that
setters should be checked but only when there is no getter. This may be useful
if one only wishes documentation on one of the two accessors. Defaults to
\`false\`.`,
        },
        contexts: {
            description: `Set this to an array of strings or objects representing the additional AST
contexts where you wish the rule to be applied (e.g., \`Property\` for
properties). If specified as an object, it should have a \`context\` property
and can have an \`inlineCommentBlock\` property which, if set to \`true\`, will
add an inline \`/** */\` instead of the regular, multi-line, indented jsdoc
block which will otherwise be added. Defaults to an empty array. Contexts
may also have their own \`minLineCount\` property which is an integer
indicating a minimum number of lines expected for a node in order
for it to require documentation.

Note that you may need to disable \`require\` items (e.g., \`MethodDefinition\`)
if you are specifying a more precise form in \`contexts\` (e.g., \`MethodDefinition:not([accessibility="private"] > FunctionExpression\`).

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
                            context: {
                                type: 'string',
                            },
                            inlineCommentBlock: {
                                type: 'boolean',
                            },
                            minLineCount: {
                                type: 'integer',
                            },
                        },
                        type: 'object',
                    },
                ],
            },
            type: 'array',
        },
        enableFixer: {
            default: true,
            description: `A boolean on whether to enable the fixer (which adds an empty JSDoc block).
Defaults to \`true\`.`,
            type: 'boolean',
        },
        exemptEmptyConstructors: {
            default: false,
            description: `When \`true\`, the rule will not report missing JSDoc blocks above constructors
with no parameters or return values (this is enabled by default as the class
name or description should be seen as sufficient to convey intent).

Defaults to \`true\`.`,
            type: 'boolean',
        },
        exemptEmptyFunctions: {
            default: false,
            description: `When \`true\`, the rule will not report missing JSDoc blocks above
functions/methods with no parameters or return values (intended where
function/method names are sufficient for themselves as documentation).

Defaults to \`false\`.`,
            type: 'boolean',
        },
        exemptOverloadedImplementations: {
            default: false,
            description: `If set to \`true\` will avoid checking an overloaded function's implementation.

Defaults to \`false\`.`,
            type: 'boolean',
        },
        fixerMessage: {
            default: '',
            description: `An optional message to add to the inserted JSDoc block. Defaults to the
empty string.`,
            type: 'string',
        },
        minLineCount: {
            description: `An integer to indicate a minimum number of lines expected for a node in order
for it to require documentation. Defaults to \`undefined\`. This option will
apply to any context; see \`contexts\` for line counts specific to a context.`,
            type: 'integer',
        },
        publicOnly: {
            description: `This option will insist that missing JSDoc blocks are only reported for
function bodies / class declarations that are exported from the module.
May be a boolean or object. If set to \`true\`, the defaults below will be
used. If unset, JSDoc block reporting will not be limited to exports.

This object supports the following optional boolean keys (\`false\` unless
otherwise noted):

- \`ancestorsOnly\` - Optimization to only check node ancestors to check if node is exported
- \`esm\` - ESM exports are checked for JSDoc comments (Defaults to \`true\`)
- \`cjs\` - CommonJS exports are checked for JSDoc comments  (Defaults to \`true\`)
- \`window\` - Window global exports are checked for JSDoc comments`,
            oneOf: [
                {
                    default: false,
                    type: 'boolean',
                },
                {
                    additionalProperties: false,
                    default: {},
                    properties: {
                        ancestorsOnly: {
                            type: 'boolean',
                        },
                        cjs: {
                            type: 'boolean',
                        },
                        esm: {
                            type: 'boolean',
                        },
                        window: {
                            type: 'boolean',
                        },
                    },
                    type: 'object',
                },
            ],
        },
        require: {
            additionalProperties: false,
            default: {},
            description: `An object with the following optional boolean keys which all default to
\`false\` except for \`FunctionDeclaration\` which defaults to \`true\`.`,
            properties: {
                ArrowFunctionExpression: {
                    default: false,
                    description:
                        'Whether to check arrow functions like `() => {}`',
                    type: 'boolean',
                },
                ClassDeclaration: {
                    default: false,
                    description:
                        'Whether to check declarations like `class A {}`',
                    type: 'boolean',
                },
                ClassExpression: {
                    default: false,
                    description:
                        'Whether to check class expressions like `const myClass = class {}`',
                    type: 'boolean',
                },
                FunctionDeclaration: {
                    default: true,
                    description:
                        'Whether to check function declarations like `function a {}`',
                    type: 'boolean',
                },
                FunctionExpression: {
                    default: false,
                    description:
                        'Whether to check function expressions like `const a = function {}`',
                    type: 'boolean',
                },
                MethodDefinition: {
                    default: false,
                    description:
                        'Whether to check method definitions like `class A { someMethodDefinition () {} }`',
                    type: 'boolean',
                },
            },
            type: 'object',
        },
        skipInterveningOverloadedDeclarations: {
            default: true,
            description: `If \`true\`, will skip above uncommented overloaded functions to check
for a comment block (e.g., at the top of a set of overloaded functions).

If \`false\`, will force each overloaded function to be checked for a
comment block.

Defaults to \`true\`.`,
            type: 'boolean',
        },
    },
    type: 'object',
};

/**
 * @param interfaceName The interface name value.
 * @param methodName The method name value.
 * @param scope The lexical scope.
 * @returns The result of this check.
 */
const getMethodOnInterface = (
    interfaceName: string,
    methodName: string,
    scope: import('eslint').Scope.Scope | null,
): TSESTree.TSMethodSignature | null => {
    let scp = scope;
    while (scp) {
        const matchingVariables = scp.variables.filter(({ name }) => name === interfaceName);
        for (let variableIndex = 0; variableIndex < matchingVariables.length; variableIndex += 1) {
            const { identifiers } = matchingVariables[variableIndex]!;
            for (let identifierIndex = 0; identifierIndex < identifiers.length; identifierIndex += 1) {
                const interfaceDeclaration = (identifiers[identifierIndex] as unknown as
                    TSESTree.Identifier).parent;
                if (interfaceDeclaration?.type === 'TSInterfaceDeclaration') {
                    const members = interfaceDeclaration.body.body;
                    for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
                        const methodSig = members[memberIndex] as TSESTree.TSMethodSignature;
                        if (methodName === (methodSig.key as TSESTree.Identifier).name) {
                            return methodSig;
                        }
                    }
                }
            }
        }
        scp = scp.upper;
    }
    return null;
};

/**
 * @param node The node to inspect.
 * @param sourceCode The source text and token accessors.
 * @param context The rule context.
 * @param settings The settings value.
 * @returns The result of this check.
 */
const isExemptedImplementer = (
    node: import('eslint').Rule.Node,
    sourceCode: import('eslint').SourceCode,
    context: import('../../types').Context,
    settings: import('../iterateJsdoc').Settings,
) => {
    if (
        node.type === 'FunctionExpression'
        && node.parent.type === 'MethodDefinition'
        && node.parent.parent.type === 'ClassBody'
        && node.parent.parent.parent.type === 'ClassDeclaration'
        && 'implements' in node.parent.parent.parent
    ) {
        const implments = node
            .parent.parent.parent
            .implements as TSESTree.TSClassImplements[];

        const { name: methodName } = node
            .parent
            .key as TSESTree.Identifier;

        const implementedInterfaces = Array.from(implments);
        for (let interfaceIndex = 0; interfaceIndex < implementedInterfaces.length; interfaceIndex += 1) {
            const impl = implementedInterfaces[interfaceIndex]!;
            const { name: interfaceName } = impl.expression as TSESTree.Identifier;

            const interfaceMethodNode = getMethodOnInterface(
                interfaceName,
                methodName,
                node
                    && ((sourceCode.getScope

                        && sourceCode.getScope(node))
                        || context.getScope()),
            );
            if (interfaceMethodNode) {
                const comment = getJSDocComment(
                    sourceCode,
                    interfaceMethodNode,
                    settings,
                );
                if (comment) {
                    return true;
                }
            }
        }
    }

    return false;
};

/**
 * @param context The rule context.
 * @param baseObject The base object value.
 * @param option The option value.
 * @param key The key value.
 * @returns The result of this check.
 */
const getOption = (
    context: import('../../types').Context,
    baseObject: import('json-schema').JSONSchema4Object,
    option: 'publicOnly' | 'require',
    key: string,
): boolean | undefined => {
    const configured = (context.options as Options)[0];
    const value = configured?.[option];
    if (configured && option in configured
        && (typeof value === 'boolean' || key in value!)) {
        // Historical boolean options expose no named fields; their result is undefined.
        return (value as Record<string, boolean | undefined>)[key];
    }

    return (
        baseObject.properties as {
            [key: string]: {
                default?: boolean | undefined;
            };
        }
    )[key]!.default;
};

/**
 * @param context The rule context.
 * @param settings The settings value.
 * @returns The result of this check.
 */
const getOptions = (
    context: import('../../types').Context,
    settings: import('../iterateJsdoc').Settings,
): {
    checkAllFunctionExpressions: boolean;
    contexts: (
        | string
        | {
            context?: string;
            inlineCommentBlock?: boolean;
            minLineCount?: import('../iterateJsdoc').Integer;
        }
    )[];
    enableFixer: boolean;
    exemptEmptyConstructors: boolean;
    exemptEmptyFunctions: boolean;
    skipInterveningOverloadedDeclarations: boolean;
    exemptOverloadedImplementations: boolean;
    fixerMessage: string;
    minLineCount: undefined | import('../iterateJsdoc').Integer;
    publicOnly: boolean | { [key: string]: boolean | undefined };
    require: { [key: string]: boolean | undefined };
} => {
    const {
        checkAllFunctionExpressions = false,
        contexts = settings.contexts || [],
        enableFixer = true,
        exemptEmptyConstructors = true,
        exemptEmptyFunctions = false,
        exemptOverloadedImplementations = false,
        fixerMessage = '',
        minLineCount = undefined,
        publicOnly,
        skipInterveningOverloadedDeclarations = true,
    } = (context.options as Options)[0] || {};

    return {
        checkAllFunctionExpressions,
        contexts,
        enableFixer,
        exemptEmptyConstructors,
        exemptEmptyFunctions,
        exemptOverloadedImplementations,
        fixerMessage,
        minLineCount,
        publicOnly: ((baseObj) => {
            if (!publicOnly) {
                return false;
            }

            const properties: { [key: string]: boolean | undefined } = {};
            (Object.keys((
                baseObj as import('json-schema').JSONSchema4Object
            ).properties as import('json-schema').JSONSchema4Object)).forEach((prop) => {
                const opt = getOption(
                    context,
                    baseObj as import('json-schema').JSONSchema4Object,
                    'publicOnly',
                    prop,
                );

                properties[prop] = opt;
            });

            return properties;
        })(

            (
                (
                    (
                        OPTIONS_SCHEMA.properties as import('json-schema').JSONSchema4Object
                    ).publicOnly as import('json-schema').JSONSchema4Object
                ).oneOf as import('json-schema').JSONSchema4Object
            )[1],
        ),
        require: ((baseObj) => {
            const properties: { [key: string]: boolean | undefined } = {};
            (Object.keys((
                baseObj as import('json-schema').JSONSchema4Object
            ).properties as import('json-schema').JSONSchema4Object)).forEach((prop) => {
                const opt = getOption(
                    context,
                    baseObj as import('json-schema').JSONSchema4Object,
                    'require',
                    prop,
                );
                properties[prop] = opt;
            });

            return properties;
        })(
            (
                OPTIONS_SCHEMA.properties as import('json-schema').JSONSchema4Object
            ).require,
        ),
        skipInterveningOverloadedDeclarations,
    };
};

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
const isFunctionWithOverload = (node: ESLintOrTSNode) => {
    if (node.type !== 'FunctionDeclaration') {
        return false;
    }

    let parent;
    let child;

    if (node.parent?.type === 'Program') {
        parent = node.parent;
        child = node;
    } else if (
        node.parent?.type === 'ExportNamedDeclaration'
        && node.parent?.parent.type === 'Program'
    ) {
        parent = node.parent?.parent;
        child = node.parent;
    }

    if (!child || !parent) {
        return false;
    }

    const functionName = node.id?.name;

    const idx = parent.body.indexOf(child);
    const prevSibling = parent.body[idx - 1] as TSESTree.ProgramStatement | undefined;

    return (
        (prevSibling?.type === 'TSDeclareFunction'
            && functionName === prevSibling.id!.name)
        || (prevSibling?.type === 'ExportNamedDeclaration'
            && prevSibling.declaration?.type === 'TSDeclareFunction'
            && prevSibling.declaration?.id?.name === functionName)
    );
};

const rule: import('../../types').Rule = {
    create(context) {
        const { sourceCode = context.getSourceCode() } = context;
        const settings = getSettings(context);
        if (!settings) {
            return {};
        }

        const opts = getOptions(context, settings);

        const {
            checkAllFunctionExpressions,
            contexts,
            enableFixer,
            exemptEmptyConstructors,
            exemptEmptyFunctions,
            exemptOverloadedImplementations,
            fixerMessage,
            minLineCount,
            require: requireOption,
            skipInterveningOverloadedDeclarations,
        } = opts;

        const publicOnly = opts.publicOnly as {
            [key: string]: boolean | undefined;
        };

        /**
         * @param info The info value.
         * @param _handler The _handler value.
         * @param node The node to inspect.
         */
        const checkJsDoc: import('../iterateJsdoc').CheckJsdoc = (
            info,
            _handler,
            node,
        ) => {
            if (
                // Optimize
                minLineCount !== undefined
                || contexts.some((ctxt) => {
                    if (typeof ctxt === 'string') {
                        return false;
                    }

                    const { minLineCount: count } = ctxt;
                    return count !== undefined;
                })
            ) {
                /**
                 * @param count The count value.
                 * @returns The result of this check.
                 */
                const underMinLine = (
                    count: undefined | import('../iterateJsdoc').Integer,
                ) => (
                    count !== undefined
                        && count
                            > (sourceCode.getText(node).match(/\n/gv)?.length
                                ?? 0)
                                + 1
                );

                if (underMinLine(minLineCount)) {
                    return;
                }

                const { minLineCount: contextMinLineCount } = (contexts.find((ctxt) => {
                    if (typeof ctxt === 'string') {
                        return false;
                    }

                    const { context: ctx } = ctxt;
                    return ctx === (info.selector || node.type);
                }) as {
                    context: string;
                    inlineCommentBlock: boolean;
                    minLineCount: number;
                }) || {};
                if (underMinLine(contextMinLineCount)) {
                    return;
                }
            }

            if (
                exemptOverloadedImplementations
                && isFunctionWithOverload(node)
            ) {
                return;
            }

            const jsDocNode = getJSDocComment(sourceCode, node, settings, {
                checkOverloads: skipInterveningOverloadedDeclarations,
            });

            if (jsDocNode) {
                return;
            }

            // For those who have options configured against ANY constructors (or
            //  setters or getters) being reported
            if (
                exemptSpeciaMethods(
                    {
                        description: '',
                        inlineTags: [],
                        problems: [],
                        source: [],
                        tags: [],
                    },
                    node,
                    context,
                    [OPTIONS_SCHEMA as import('../jsdocUtils').SpecialMethodSchema],
                )
            ) {
                return;
            }

            if (
                // Avoid reporting param-less, return-less functions (when
                //  `exemptEmptyFunctions` option is set)
                (exemptEmptyFunctions && info.isFunctionContext)
                // Avoid reporting  param-less, return-less constructor methods (when
                //  `exemptEmptyConstructors` option is set)
                || (exemptEmptyConstructors && isConstructor(node))
            ) {
                const functionParameterNames = getFunctionParameterNames(node);
                if (!functionParameterNames.length && !hasReturnValue(node)) {
                    return;
                }
            }

            if (isExemptedImplementer(node, sourceCode, context, settings)) {
                return;
            }

            const fix: import('eslint').Rule.ReportFixer = (fixer) => {
                // Default to one line break if the `minLines`/`maxLines` settings allow
                const lines = settings.minLines === 0 && settings.maxLines >= 1
                    ? 1
                    : settings.minLines;
                let baseNode:
                        | ESLintOrTSNode
                        | TSESTree.Decorator = getReducedASTNode(node, sourceCode);

                const decorator = getDecorator(
                    baseNode as import('eslint').Rule.Node,
                );
                if (decorator) {
                    baseNode = decorator;
                }

                const indent = getIndent({
                    text: sourceCode.getText(
                        baseNode as import('eslint').Rule.Node,
                        (
                            (baseNode as import('eslint').Rule.Node)
                                .loc as import('eslint').AST.SourceLocation
                        ).start.column,
                    ),
                });

                const { inlineCommentBlock } = (contexts.find((contxt) => {
                    if (typeof contxt === 'string') {
                        return false;
                    }

                    const { context: ctxt } = contxt;
                    return ctxt === node.type;
                }) as {
                    context: string;
                    inlineCommentBlock: boolean;
                    minLineCount: import('../iterateJsdoc').Integer;
                }) || {};
                const insertion = `${inlineCommentBlock
                    ? `/** ${fixerMessage}`
                    : `/**\n${indent}*${fixerMessage}\n${indent}`
                }*/${'\n'.repeat(lines)}${indent.slice(0, -1)}`;

                return fixer.insertTextBefore(
                    baseNode as import('eslint').Rule.Node,
                    insertion,
                );
            };

            const report = () => {
                const { start } = node.loc as import('eslint').AST.SourceLocation;
                const loc = {
                    end: {
                        column: 0,
                        line: start.line + 1,
                    },
                    start,
                };
                context.report({
                    fix: enableFixer ? fix : null,
                    loc,
                    messageId: 'missingJsDoc',
                    node,
                });
            };

            if (publicOnly) {
                const opt: RequireJsdocOpts = {
                    ancestorsOnly: Boolean(publicOnly?.ancestorsOnly ?? false),
                    esm: Boolean(publicOnly?.esm ?? true),
                    initModuleExports: Boolean(publicOnly?.cjs ?? true),
                    initWindow: Boolean(publicOnly?.window ?? false),
                };
                const exported = exportParser.isUncommentedExport(
                    node,
                    sourceCode,
                    opt,
                    settings,
                );

                if (exported) {
                    report();
                }
            } else {
                report();
            }
        };

        /**
         * @param prop The prop value.
         * @returns The result of this check.
         */
        const hasOption = (prop: string): boolean => (
            requireOption[prop]
                || contexts.some((ctxt) => (typeof ctxt === 'object'
                    ? ctxt.context === prop
                    : ctxt === prop))
        );

        return {
            ...getContextObject(
                enforcedContexts(context, [], settings),
                checkJsDoc,
            ),
            ArrowFunctionExpression(node) {
                if (!hasOption('ArrowFunctionExpression')) {
                    return;
                }

                if (
                    [
                        'AssignmentExpression',
                        'ExportDefaultDeclaration',
                        'VariableDeclarator',
                    ].includes(node.parent.type)
                    || ([
                        'ClassProperty',
                        'ObjectProperty',
                        'Property',
                        'PropertyDefinition',
                    ].includes(node.parent.type)
                        && node

                            === (
                                node.parent as
                                    | TSESTree.Property
                                    | TSESTree.PropertyDefinition
                            ).value)
                ) {
                    checkJsDoc(
                        {
                            isFunctionContext: true,
                        },
                        null,
                        node,
                    );
                }
            },

            ClassDeclaration(node) {
                if (!hasOption('ClassDeclaration')) {
                    return;
                }

                checkJsDoc(
                    {
                        isFunctionContext: false,
                    },
                    null,
                    node,
                );
            },

            ClassExpression(node) {
                if (!hasOption('ClassExpression')) {
                    return;
                }

                checkJsDoc(
                    {
                        isFunctionContext: false,
                    },
                    null,
                    node,
                );
            },

            FunctionDeclaration(node) {
                if (!hasOption('FunctionDeclaration')) {
                    return;
                }

                checkJsDoc(
                    {
                        isFunctionContext: true,
                    },
                    null,
                    node,
                );
            },

            FunctionExpression(node) {
                if (!hasOption('FunctionExpression')) {
                    return;
                }

                if (
                    checkAllFunctionExpressions
                    || [
                        'AssignmentExpression',
                        'ExportDefaultDeclaration',
                        'VariableDeclarator',
                    ].includes(node.parent.type)
                    || ([
                        'ClassProperty',
                        'ObjectProperty',
                        'Property',
                        'PropertyDefinition',
                    ].includes(node.parent.type)
                        && node

                            === (
                                node.parent as
                                    | TSESTree.Property
                                    | TSESTree.PropertyDefinition
                            ).value)
                ) {
                    checkJsDoc(
                        {
                            isFunctionContext: true,
                        },
                        null,
                        node,
                    );
                }
            },

            MethodDefinition(node) {
                if (!hasOption('MethodDefinition')) {
                    return;
                }

                checkJsDoc(
                    {
                        isFunctionContext: true,
                        selector: 'MethodDefinition',
                    },
                    null,
                    node.value as import('eslint').Rule.Node,
                );
            },
        };
    },
    meta: {
        docs: {
            description:
                'Checks for presence of JSDoc comments, on functions and potentially other contexts (optionally limited to exports).',
            recommended: true,
            url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/require-jsdoc.md#repos-sticky-header',
        },

        fixable: 'code',

        messages: {
            missingJsDoc: 'Missing JSDoc comment.',
        },

        schema: [OPTIONS_SCHEMA as import('../jsdocUtils').SpecialMethodSchema],

        type: 'suggestion',
    },
};

export default rule;
