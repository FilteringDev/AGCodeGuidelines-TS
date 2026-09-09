import type { TSESTree } from '@typescript-eslint/types';
// Options are validated against this rule's metadata schema before execution.
import {
    getJSDocComment,
    parse as parseType,
    traverse,
    tryParse as tryParseType,
} from '@es-joy/jsdoccomment';
import { parseImportsExports } from 'parse-imports-exports';
import iterateJsdoc, { parseComment } from '../iterateJsdoc';
import {
    getDocumentNamepathDefiningTags,
    getJSDocCommentBlocks,
} from '../jsdocUtils';

type Options = [
    {
        checkUsedTypedefs?: boolean;
        definedTypes?: string[];
        disableReporting?: boolean;
        markVariablesAsUsed?: boolean;
    }?,
];

const extraTypes = [
    'null',
    'undefined',
    'void',
    'string',
    'boolean',
    'object',
    'function',
    'symbol',
    'number',
    'bigint',
    'NaN',
    'Infinity',
    'any',
    '*',
    'never',
    'unknown',
    'const',
    'this',
    'true',
    'false',
    'Array',
    'Object',
    'RegExp',
    'Date',
    'Function',
    'Intl',
];

const globalTypes = ['globalThis', 'global', 'window', 'self'];

const iterableIterator = ['Iterable', 'Iterator', 'IteratorObject'];

const typescriptGlobals = [
    ...iterableIterator,

    // https://www.typescriptlang.org/docs/handbook/utility-types.html
    'Awaited',
    'Partial',
    'Required',
    'Readonly',
    'Record',
    'Pick',
    'Omit',
    'Exclude',
    'Extract',
    'NonNullable',
    'Parameters',
    'ConstructorParameters',
    'ReturnType',
    'InstanceType',
    'ThisParameterType',
    'OmitThisParameter',
    'ThisType',
    'Uppercase',
    'Lowercase',
    'Capitalize',
    'Uncapitalize',
];

/**
 * @param [str] The str value.
 * @returns The result of this check.
 */
const stripPseudoTypes = (
    str?: string | false | undefined,
): undefined | string | false => str && str.replace(/(?:\.|<>|\.<>|\[\])$/v, '');

export default iterateJsdoc(
    ({
        context, node, report, settings, sourceCode, state, utils,
    }) => {
        const foundTypedefValues: string[] = [];

        const { scopeManager } = sourceCode;

        // When is this ever `null`?
        const globalScope = scopeManager.globalScope as import('eslint').Scope.Scope;

        const {
            checkUsedTypedefs = false,
            definedTypes = [],
            disableReporting = false,
            markVariablesAsUsed = true,
        } = (context.options as Options)[0] || {};

        let definedPreferredTypes: (string | undefined)[] = [];
        const { mode, preferredTypes, structuredTags } = settings;
        if (Object.keys(preferredTypes).length) {
            definedPreferredTypes = Object.values(
                preferredTypes,
            )
                .map((preferredType) => {
                    if (typeof preferredType === 'string') {
                        // May become an empty string but will be filtered out below
                        return stripPseudoTypes(preferredType);
                    }

                    if (!preferredType) {
                        return undefined;
                    }

                    if (typeof preferredType !== 'object') {
                        utils.reportSettings(
                            'Invalid `settings.jsdoc.preferredTypes`. Values must be falsy, a string, or an object.',
                        );
                    }

                    return stripPseudoTypes(preferredType.replacement);
                })
                .filter(Boolean) as string[];
        }

        const allComments = sourceCode.getAllComments();
        const comments = getJSDocCommentBlocks(sourceCode);

        const globals = allComments
            .filter((comment) => /^\s*globals/v.test(comment.value))
            .flatMap((commentNode) => commentNode.value
                .replace(/^\s*globals/v, '')
                .trim()
                .split(/,\s*/v))
            .concat(Object.keys(context.languageOptions.globals ?? []));

        const typedefs = getDocumentNamepathDefiningTags(sourceCode);

        const typedefDeclarations = typedefs.map((tag) => tag.name);

        const importTags = settings.mode === 'typescript'
            ? (comments
                .flatMap((doc) => doc.tags.filter(({ tag }) => tag === 'import'))
                .flatMap((tag) => {
                    const { description, name, type } = tag;
                    const typePart = type ? `{${type}} ` : '';
                    const imprt = `import ${
                        description
                            ? `${typePart}${name} ${description}`
                            : `${typePart}${name}`}`;

                    const importsExports = parseImportsExports(
                        imprt.trim(),
                    );

                    const types = [];
                    const namedImports = Object.values(
                        importsExports.namedImports || {},
                    )[0]?.[0];
                    if (namedImports) {
                        if (namedImports.default) {
                            types.push(namedImports.default);
                        }

                        if (namedImports.names) {
                            types.push(
                                ...Object.keys(namedImports.names),
                            );
                        }
                    }

                    const namespaceImports = Object.values(
                        importsExports.namespaceImports || {},
                    )[0]?.[0];
                    if (namespaceImports) {
                        if (namespaceImports.namespace) {
                            types.push(namespaceImports.namespace);
                        }

                        if (namespaceImports.default) {
                            types.push(namespaceImports.default);
                        }
                    }

                    return types;
                })
                .filter(Boolean) as string[])
            : [];

        const ancestorNodes = [];

        let currentNode = node;
        // No need for Program node?
        while (currentNode?.parent) {
            ancestorNodes.push(currentNode);
            currentNode = currentNode.parent;
        }

        /**
         * @param ancestorNode The ancestor node value.
         * @returns The result of this check.
         */
        const getTemplateTags = function getTemplateTags(
            ancestorNode: import('eslint').Rule.Node,
        ): import('comment-parser').Spec[] {
            const commentNode = getJSDocComment(
                sourceCode,
                ancestorNode,
                settings,
            );
            if (!commentNode) {
                return [];
            }

            const jsdc = parseComment(commentNode, '');

            return jsdc.tags.filter((tag) => tag.tag === 'template');
        };

        // `currentScope` may be `null` or `Program`, so in such a case,
        //  we look to present tags instead
        const templateTags = ancestorNodes.length
            ? ancestorNodes.flatMap((ancestorNode) => getTemplateTags(ancestorNode))
            : comments.flatMap((doc) => doc.tags.filter(({ tag }) => tag === 'template'));

        const closureGenericTypes = templateTags.flatMap((tag) => utils.parseClosureTemplateTag(tag));

        // In modules, including Node, there is a global scope at top with the
        //  Program scope inside
        const cjsOrESMScope = globalScope.childScopes[0]?.block?.type === 'Program';

        /**
         * @param scope The lexical scope.
         * @returns The result of this check.
         */
        const getValidRuntimeIdentifiers = (
            scope: import('eslint').Scope.Scope | null,
        ): Set<string> => {
            const result = new Set<string>();

            let scp = scope;

            /**
             * @param sc The sc value.
             */
            const getChildScopes = (
                sc: import('eslint').Scope.Scope | null,
            ) => {
                if (sc) {
                    // We must check child scopes because when multiple nodes find
                    //   the same comment block, only one node is reported by our code,
                    //   and it can be the children which are not reported.
                    (sc.childScopes).forEach((childScope) => {
                        (childScope.variables).forEach(({ name }) => {
                            result.add(name);
                        });

                        (childScope.childScopes).forEach((grandChildScope) => {
                            getChildScopes(grandChildScope);
                        });
                    });
                }
            };

            getChildScopes(scp);

            while (scp) {
                (scp.variables).forEach(({ name }) => {
                    result.add(name);
                });

                scp = scp.upper;
            }

            return result;
        };

        /**
         * Recursively extracts types from a namespace declaration.
         * @param prefix - The namespace prefix (e.g., "MyNamespace" or "Outer.Inner").
         * @param moduleDeclaration - The module declaration node.
         * @returns Array of fully qualified type names.
         */
        const getNamespaceTypes = (
            prefix: string,
            moduleDeclaration: TSESTree.TSModuleDeclaration,
        ): string[] => {
            if (
                !moduleDeclaration.body
                || moduleDeclaration.body.type !== 'TSModuleBlock'
            ) {
                return [];
            }

            return moduleDeclaration.body.body.flatMap((item) => {
                let declaration:
                    | TSESTree.ProgramStatement
                    | TSESTree.NamedExportDeclarations
                    | null = item;

                if (
                    item.type === 'ExportNamedDeclaration'
                    && item.declaration
                ) {
                    declaration = item.declaration;
                }

                if (
                    declaration.type === 'TSTypeAliasDeclaration'
                    || declaration.type === 'ClassDeclaration'
                ) {
                    if (!declaration.id) {
                        return [];
                    }

                    return [`${prefix}.${declaration.id.name}`];
                }

                if (declaration.type === 'TSInterfaceDeclaration') {
                    return [
                        `${prefix}.${declaration.id.name}`,
                        ...declaration.body.body
                            .map((prop) => {
                                // Only `TSPropertySignature` and `TSMethodSignature` have 'key'.
                                if (
                                    prop.type !== 'TSPropertySignature'
                                    && prop.type !== 'TSMethodSignature'
                                ) {
                                    return '';
                                }

                                // Key can be computed or a literal, only handle Identifier.
                                if (prop.key.type !== 'Identifier') {
                                    return '';
                                }

                                const propName = prop.key.name;

                                return propName
                                    ? `${prefix}.${declaration.id.name}.${propName}`
                                    : '';
                            })
                            .filter(Boolean),
                    ];
                }

                // Handle nested namespaces.
                if (declaration.type === 'TSModuleDeclaration') {
                    const nestedName = declaration.id?.type === 'Identifier'
                        ? declaration.id.name
                        : '';

                    if (!nestedName) {
                        return [];
                    }

                    return [
                        `${prefix}.${nestedName}`,
                        ...getNamespaceTypes(
                            `${prefix}.${nestedName}`,
                            declaration,
                        ),
                    ];
                }

                // Fallback for unhandled declaration types (e.g., TSEnumDeclaration, FunctionDeclaration, etc.).
                return [];
            });
        };

        /**
         * We treat imports differently as we can't introspect their children.
         */
        const imports: string[] = [];

        const closedTypes: Set<string> = new Set();

        const tsModuleVariables = scopeManager.scopes
            .filter(({ type }) => (type as string) === 'tsModule')
            .flatMap(({ variables }) => variables.map(({ name }) => name));

        const allDefinedTypes = new Set(
            globalScope.variables
                .map(({ name }) => name)

                // If the file is a module, concat the variables from the module scope.
                .concat(
                    cjsOrESMScope
                        ? globalScope.childScopes
                            .flatMap(({ variables }) => variables)
                            .flatMap(({ identifiers, name }) => {
                                const globalItem = (
                                    identifiers?.[0] as import('estree').Identifier & {
                                        parent: TSESTree.Node;
                                    }
                                )?.parent;
                                switch (globalItem?.type) {
                                    case 'ClassDeclaration':
                                        closedTypes.add(name);
                                        return [
                                            name,
                                            ...globalItem.body.body
                                                .map((item) => {
                                                    const property = (
                                                        (
                                                            item as TSESTree.PropertyDefinition
                                                        )
                                                            ?.key as TSESTree.Identifier
                                                    )?.name;

                                                    if (!property) {
                                                        return '';
                                                    }

                                                    return `${name}.${property}`;
                                                })
                                                .filter(Boolean),
                                        ];
                                    case 'ImportDefaultSpecifier':
                                    case 'ImportNamespaceSpecifier':
                                    case 'ImportSpecifier':
                                        imports.push(name);
                                        break;
                                    case 'TSInterfaceDeclaration':
                                        return [
                                            name,
                                            ...globalItem.body.body
                                                .map((item) => {
                                                    const property = (
                                                        (
                                                            item as TSESTree.TSPropertySignature
                                                        )
                                                            ?.key as TSESTree.Identifier
                                                    )?.name;

                                                    if (!property) {
                                                        return '';
                                                    }

                                                    return `${name}.${property}`;
                                                })
                                                .filter(Boolean),
                                        ];
                                    case 'TSModuleDeclaration':
                                        closedTypes.add(name);
                                        return [
                                            name,
                                            ...getNamespaceTypes(
                                                name,
                                                globalItem,
                                            ),
                                        ];
                                    case 'VariableDeclarator':
                                        if ((
                                            (
                                                globalItem?.init as TSESTree.CallExpression
                                            )
                                                ?.callee as TSESTree.Identifier
                                        )?.name === 'require'
                                        ) {
                                            imports.push((
                                                globalItem.id as TSESTree.Identifier
                                            ).name);
                                            break;
                                        }

                                        // Module scope names are also defined
                                        return [name];

                                    default: break;
                                }

                                return [name];
                            })
                        : [],
                )
                .concat(extraTypes)
                .concat(typedefDeclarations)
                .concat(importTags)
                .concat(definedTypes)
                .concat(tsModuleVariables)
                .concat(definedPreferredTypes as string[])
                .concat(
                    (() => {
                        // Other methods are not in scope, but we need them, and we grab them here
                        if (node?.type === 'MethodDefinition') {
                            return (
                                node.parent as import('estree').ClassBody
                            ).body
                                .flatMap((methodOrProp) => {
                                    if (
                                        methodOrProp.type === 'MethodDefinition'
                                    ) {
                                        if (
                                            methodOrProp.key.type
                                            === 'Identifier'
                                        ) {
                                            return [
                                                methodOrProp.key.name,
                                                `${(
                                                    node.parent
                                                        ?.parent as import('estree').ClassDeclaration
                                                )?.id?.name
                                                }.${methodOrProp.key.name}`,
                                            ];
                                        }
                                    }

                                    if (
                                        methodOrProp.type
                                        === 'PropertyDefinition'
                                    ) {
                                        if (
                                            methodOrProp.key.type
                                            === 'Identifier'
                                        ) {
                                            return [
                                                methodOrProp.key.name,
                                                `${(
                                                    node.parent
                                                        ?.parent as import('estree').ClassDeclaration
                                                )?.id?.name
                                                }.${methodOrProp.key.name}`,
                                            ];
                                        }
                                    }

                                    return '';
                                })
                                .filter(Boolean);
                        }

                        return [];
                    })(),
                )
                .concat(
                    (() => {
                        // Detect static property assignments like `MyClass.Prop = ...`
                        const programBody = (
                            sourceCode.ast as TSESTree.Program
                        ).body;

                        return programBody.flatMap((statement) => {
                            if (
                                statement.type === 'ExpressionStatement'
                                && statement.expression.type
                                    === 'AssignmentExpression'
                                && statement.expression.left.type
                                    === 'MemberExpression'
                                && statement.expression.left.object.type
                                    === 'Identifier'
                                && statement.expression.left.property.type
                                    === 'Identifier'
                                && closedTypes.has(
                                    statement.expression.left.object.name,
                                )
                            ) {
                                return [
                                    `${statement.expression.left.object.name}.${statement.expression.left.property.name}`,
                                ];
                            }

                            return [];
                        });
                    })(),
                )
                .concat(
                    ...getValidRuntimeIdentifiers(
                        node
                            && ((sourceCode.getScope

                                && sourceCode.getScope(node))
                                || context.getScope()),
                    ),
                )
                .concat(
                    settings.mode === 'jsdoc'
                        ? []
                        : [
                            ...(settings.mode === 'typescript'
                                ? typescriptGlobals
                                : []),
                            ...closureGenericTypes,
                        ],
                ),
        );

        type TypeAndTagInfo = {
            parsedType: import('jsdoc-type-pratt-parser').RootResult;
            tag:
                | import('comment-parser').Spec
                | (import('@es-joy/jsdoccomment').JsdocInlineTagNoType & {
                    line?: import('../iterateJsdoc').Integer;
                });
        };

        /**
         * @param propertyName The property name value.
         * @returns The result of this check.
         */
        const tagToParsedType = (
            propertyName: string,
        ): ((
            tag:
                | (import('@es-joy/jsdoccomment').JsdocInlineTagNoType & {
                    name?: string;
                    type?: string;
                    line?: import('../iterateJsdoc').Integer;
                })
                | (import('comment-parser').Spec & {
                    namepathOrURL?: string;
                }),
        ) => undefined | TypeAndTagInfo) => (tag) => {
            try {
                const potentialType = tag[
                    propertyName as
                                | 'type'
                                | 'name'
                                | 'namepathOrURL'
                ];
                return {
                    parsedType:
                            mode === 'permissive'
                                ? tryParseType(
                                    potentialType as string,
                                )
                                : parseType(
                                    potentialType as string,
                                    mode,
                                ),
                    tag,
                };
            } catch {
                return undefined;
            }
        };

        const typeTags = utils
            .filterTags(({ tag }) => (
                tag !== 'import'
                    && utils.tagMightHaveTypePosition(tag)
                    && (tag !== 'suppress' || settings.mode !== 'closure')
            ))
            .map(tagToParsedType('type'));

        const namepathReferencingTags = utils
            .filterTags(({ tag }) => utils.isNamepathReferencingTag(tag))
            .map(tagToParsedType('name'));

        const namepathOrUrlReferencingTags = utils
            .filterAllTags(({ tag }) => utils.isNamepathOrUrlReferencingTag(tag))
            .map(tagToParsedType('namepathOrURL'));

        const definedNamesAndNamepaths = new Set(
            utils
                .filterTags(({ tag }) => utils.isNameOrNamepathDefiningTag(tag))
                .map(({ name }) => name),
        );

        const tagsWithTypes = [
            ...typeTags,
            ...namepathReferencingTags,
            ...namepathOrUrlReferencingTags,
            // Remove types which failed to parse
        ].filter(Boolean) as TypeAndTagInfo[];

        (tagsWithTypes).forEach(({ parsedType, tag }) => {
            const parents = new WeakMap<import('jsdoc-type-pratt-parser').NonRootResult, import('jsdoc-type-pratt-parser').NonRootResult | undefined>();
            traverse(parsedType, (nde, parentNode) => {
                parents.set(nde, parentNode);
                const { type, value } = nde as import('jsdoc-type-pratt-parser').NameResult;

                let val = value;

                let currNode:
                    | import('jsdoc-type-pratt-parser').NonRootResult
                    | undefined = nde;
                do {
                    currNode = parents.get(currNode!);
                    if (
                        // Avoid appending for imports and globals since we don't want to
                        //  check their properties which may or may not exist
                        !imports.includes(val)
                        && !globals.includes(val)
                        && !importTags.includes(val)
                        && !extraTypes.includes(val)
                        && !typedefDeclarations.includes(val)
                        && !globalTypes.includes(val)
                        && currNode
                        && 'right' in currNode
                        && currNode.right?.type === 'JsdocTypeProperty'
                    ) {
                        val = `${val}.${currNode.right.value}`;
                    }
                } while (currNode?.type === 'JsdocTypeNamePath');

                if (type === 'JsdocTypeName') {
                    const structuredTypes = structuredTags[tag.tag]?.type;
                    const rootNamespace = val.split('.')[0];
                    const isNamespaceValid = (definedTypes.includes(rootNamespace!)
                            || allDefinedTypes.has(rootNamespace!))
                        && !closedTypes.has(rootNamespace!);

                    if (
                        !allDefinedTypes.has(val)
                        && !definedNamesAndNamepaths.has(val)
                        && (!Array.isArray(structuredTypes)
                            || !structuredTypes.includes(val))
                        && !isNamespaceValid
                    ) {
                        const parent = parents.get(nde);
                        if (parent?.type === 'JsdocTypeTypeParameter') {
                            return;
                        }

                        if (
                            parent?.type === 'JsdocTypeFunction'
                            && (
                                parent as import('jsdoc-type-pratt-parser').FunctionResult
                            )?.typeParameters?.some((typeParam) => value === typeParam.name.value)
                        ) {
                            return;
                        }

                        if (
                            parent?.type === 'JsdocTypeInfer'
                            && value === parent.element.value
                        ) {
                            allDefinedTypes.add(value);
                            return;
                        }

                        if (!disableReporting) {
                            report(
                                `The type '${val}' is undefined.`,
                                null,
                                tag,
                            );
                        }
                    } else if (
                        markVariablesAsUsed
                        && !extraTypes.includes(val)
                    ) {
                        if (sourceCode.markVariableAsUsed) {
                            sourceCode.markVariableAsUsed(val);
                        } else {
                            context.markVariableAsUsed(val);
                        }
                    }

                    if (
                        checkUsedTypedefs
                        && typedefDeclarations.includes(val)
                    ) {
                        foundTypedefValues.push(val);
                    }
                }
            });
        });

        Object.assign(state, { foundTypedefValues });
    },
    {
        // We use this method rather than checking at end of handler above because
        //   in that case, it is invoked too many times and would thus report errors
        //   too many times.
        exit({ context, state, utils }) {
            const { checkUsedTypedefs = false } = (context.options as Options)[0] || {};

            if (!checkUsedTypedefs) {
                return;
            }

            const allComments = context.sourceCode.getAllComments();
            const comments = allComments
                .filter((comment) => /^\*(?!\*)/v.test(comment.value))
                .map((commentNode) => ({
                    doc: parseComment(commentNode, ''),
                    loc: commentNode.loc,
                }));
            const typedefs = comments.flatMap(({ doc, loc }) => {
                const tags = doc.tags.filter(({ tag }) => utils!.isNameOrNamepathDefiningTag(tag));
                if (!tags.length) {
                    return [];
                }

                return {
                    loc,
                    tags,
                };
            });

            (typedefs).forEach((typedef) => {
                if (!state.foundTypedefValues.includes(typedef.tags[0]!.name)) {
                    context.report({
                        loc: typedef.loc as import('estree').SourceLocation,
                        message: 'This typedef was not used within the file',
                    });
                }
            });
        },
        iterateAllJsdocs: true,
        meta: {
            docs: {
                description:
                    'Besides some expected built-in types, prohibits any types not specified as globals or within `@typedef`.',
                url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/no-undefined-types.md#repos-sticky-header',
            },
            schema: [
                {
                    additionalProperties: false,
                    properties: {
                        checkUsedTypedefs: {
                            description:
                                'Whether to check typedefs for use within the file',
                            type: 'boolean',
                        },
                        definedTypes: {
                            description: `This array can be populated to indicate other types which
are automatically considered as defined (in addition to globals, etc.).
Defaults to an empty array.`,
                            items: {
                                type: 'string',
                            },
                            type: 'array',
                        },
                        disableReporting: {
                            description: `Whether to disable reporting of errors. Defaults to
\`false\`. This may be set to \`true\` in order to take advantage of only
marking defined variables as used or checking used typedefs.`,
                            type: 'boolean',
                        },
                        markVariablesAsUsed: {
                            description: `Whether to mark variables as used for the purposes
of the \`no-unused-vars\` rule when they are not found to be undefined.
Defaults to \`true\`. May be set to \`false\` to enforce a practice of not
importing types unless used in code.`,
                            type: 'boolean',
                        },
                    },
                    type: 'object',
                },
            ],
            type: 'suggestion',
        },
    },
);
