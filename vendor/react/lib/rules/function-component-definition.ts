/**
 * @file Standardize the way function component get defined
 * @author Stefan Wullems
 */
import dependency0 from 'array-includes';
import dependency1 from '../util/Components';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/report';
import dependency4 from '../util/eslint';
import dependency5 from '../util/props';
import type { Fixer, LegacyRule, Node } from '../../types';

const arrayIncludes = dependency0;
const Components = dependency1;
const docsUrl = dependency2;
const reportC = dependency3;
const { getText } = dependency4;
const propsUtil = dependency5;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/**
 * @param template The template value.
 * @param parts The parts value.
 * @returns The result of this check.
 */
function buildFunction(template: string, parts: Record<string, string | false | null | undefined>) {
    return Object.keys(parts).reduce(
        (acc, key) => acc.replace(`{${key}}`, () => parts[key] || ''),
        template,
    );
}

type FunctionNode = Node<'FunctionDeclaration' | 'FunctionExpression' | 'ArrowFunctionExpression'>;
type FunctionType = 'function-declaration' | 'function-expression' | 'arrow-function';
interface FixOptions {
    type: FunctionType;
    template: string;
    range: [number, number];
}
const NAMED_FUNCTION_TEMPLATES = {
    'function-declaration': 'function {name}{typeParams}({params}){returnType} {body}',
    'arrow-function': '{varType} {name}{typeAnnotation} = {typeParams}({params}){returnType} => {body}',
    'function-expression':
        '{varType} {name}{typeAnnotation} = function{typeParams}({params}){returnType} {body}',
};

const UNNAMED_FUNCTION_TEMPLATES = {
    'function-expression': 'function{typeParams}({params}){returnType} {body}',
    'arrow-function': '{typeParams}({params}){returnType} => {body}',
};

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function hasOneUnconstrainedTypeParam(node: Node) {
    const nodeTypeArguments = propsUtil.getTypeArguments(node);

    return (
        nodeTypeArguments
        && nodeTypeArguments.params
        && nodeTypeArguments.params.length === 1
        && !nodeTypeArguments.params[0]!.constraint
    );
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function hasName(node: Node) {
    return node.type === 'FunctionDeclaration' || node.parent.type === 'VariableDeclarator';
}

/**
 * @param prop The prop value.
 * @param source The source text.
 * @returns The result of this check.
 */
function getNodeText(prop: Node | null | undefined, source: string) {
    if (!prop) {
        return null;
    }
    return source.slice(prop.range[0], prop.range[1]);
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function getName(node: Node) {
    if (node.type === 'FunctionDeclaration') {
        return node.id!.name;
    }

    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
        return hasName(node) && node.parent.id!.name;
    }

    return undefined;
}

/**
 * @param node The node to inspect.
 * @param source The source text.
 * @returns The result of this check.
 */
function getParams(node: Node, source: string) {
    if (node.params!.length === 0) {
        return null;
    }
    return source.slice(node.params![0]!.range[0], node.params![node.params!.length - 1]!.range[1]);
}

/**
 * @param node The node to inspect.
 * @param source The source text.
 * @returns The result of this check.
 */
function getBody(node: FunctionNode, source: string) {
    const { range } = node.body!;

    if (node.body!.type !== 'BlockStatement') {
        return ['{', `  return ${source.slice(range[0], range[1])}`, '}'].join('\n');
    }

    return source.slice(range[0], range[1]);
}

/**
 * @param node The node to inspect.
 * @param source The source text.
 * @returns The result of this check.
 */
function getTypeAnnotation(node: Node, source: string) {
    if (!hasName(node) || node.type === 'FunctionDeclaration') {
        return undefined;
    }

    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
        return getNodeText(node.parent.id!.typeAnnotation, source);
    }

    return undefined;
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isUnfixableBecauseOfExport(node: Node) {
    return (
        node.type === 'FunctionDeclaration'
        && node.parent
        && node.parent.type === 'ExportDefaultDeclaration'
    );
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isFunctionExpressionWithName(node: Node) {
    return node.type === 'FunctionExpression' && node.id && node.id.name;
}

const messages = {
    'function-declaration': 'Function component is not a function declaration',
    'function-expression': 'Function component is not a function expression',
    'arrow-function': 'Function component is not an arrow function',
};

const rule: LegacyRule<
    [
        {
            namedComponents?:
                | 'function-declaration'
                | 'arrow-function'
                | 'function-expression'
                | ('function-declaration' | 'arrow-function' | 'function-expression')[];
            unnamedComponents?:
                | 'arrow-function'
                | 'function-expression'
                | ('arrow-function' | 'function-expression')[];
            [key: string]: unknown;
        }?,
    ]
> = {
    meta: {
        docs: {
            description: 'Enforce a specific function type for function components',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('function-component-definition'),
        },
        fixable: 'code',

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    namedComponents: {
                        anyOf: [
                            {
                                enum: ['function-declaration', 'arrow-function', 'function-expression'],
                            },
                            {
                                type: 'array',
                                items: {
                                    type: 'string',
                                    enum: [
                                        'function-declaration',
                                        'arrow-function',
                                        'function-expression',
                                    ],
                                },
                            },
                        ],
                    },
                    unnamedComponents: {
                        anyOf: [
                            { enum: ['arrow-function', 'function-expression'] },
                            {
                                type: 'array',
                                items: {
                                    type: 'string',
                                    enum: ['arrow-function', 'function-expression'],
                                },
                            },
                        ],
                    },
                },
            },
        ],
    },

    create: Components.detect((context, components) => {
        const configuration = context.options[0] || {};
        let fileVarType = 'var';

        const namedConfig = ([] as FunctionType[]).concat(
            configuration.namedComponents || 'function-declaration',
        );
        const unnamedConfig = ([] as (keyof typeof UNNAMED_FUNCTION_TEMPLATES)[]).concat(
            configuration.unnamedComponents || 'function-expression',
        );

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         * @param options The configured rule options.
         */
        function getFixer(node: FunctionNode, options: FixOptions) {
            const source = getText(context);

            const typeAnnotation = getTypeAnnotation(node, source);

            if (options.type === 'function-declaration' && typeAnnotation) {
                return undefined;
            }
            if (options.type === 'arrow-function' && hasOneUnconstrainedTypeParam(node)) {
                return undefined;
            }
            if (isUnfixableBecauseOfExport(node)) {
                return undefined;
            }
            if (isFunctionExpressionWithName(node)) {
                return undefined;
            }
            let varType = fileVarType;
            if (
                (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression')
                && node.parent.type === 'VariableDeclarator'
            ) {
                varType = (node.parent.parent as Node<'VariableDeclaration'>).kind;
            }

            const nodeTypeArguments = propsUtil.getTypeArguments(node);
            return (fixer: Fixer) => fixer.replaceTextRange(
                options.range,
                buildFunction(options.template, {
                    typeAnnotation,
                    typeParams: getNodeText(nodeTypeArguments, source),
                    params: getParams(node, source),
                    returnType: getNodeText(node.returnType, source),
                    body: getBody(node, source),
                    name: getName(node),
                    varType,
                }),
            );
        }

        /**
         * @param node The node to inspect.
         * @param options The configured rule options.
         * @param options.messageId The messageId value.
         * @param options.fixerOptions The fixerOptions value.
         */
        function report(
            node: FunctionNode,
            options: { messageId: FunctionType; fixerOptions: FixOptions },
        ) {
            reportC(context, messages[options.messageId], options.messageId, {
                node,
                fix: getFixer(node, options.fixerOptions),
            });
        }

        /**
         * @param node The node to inspect.
         * @param functionType The function type value.
         */
        function validate(node: FunctionNode, functionType: FunctionType) {
            if (!components.get(node)) {
                return;
            }

            if (node.parent && node.parent.type === 'Property') {
                return;
            }

            if (hasName(node) && !arrayIncludes(namedConfig, functionType)) {
                report(node, {
                    messageId: namedConfig[0]!,
                    fixerOptions: {
                        type: namedConfig[0]!,
                        template: NAMED_FUNCTION_TEMPLATES[namedConfig[0]!],
                        range:
                            node.type === 'FunctionDeclaration' ? node.range : node.parent.parent.range,
                    },
                });
            }
            if (!hasName(node) && !arrayIncludes(unnamedConfig, functionType)) {
                report(node, {
                    messageId: unnamedConfig[0]!,
                    fixerOptions: {
                        type: unnamedConfig[0]!,
                        template: UNNAMED_FUNCTION_TEMPLATES[unnamedConfig[0]!],
                        range: node.range,
                    },
                });
            }
        }

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------
        const validatePairs: [
            FunctionNode,
            'function-declaration' | 'arrow-function' | 'function-expression',
        ][] = [];
        let hasES6OrJsx = false;
        return {
            FunctionDeclaration(node: Node<'FunctionDeclaration'>) {
                validatePairs.push([node, 'function-declaration']);
            },
            ArrowFunctionExpression(node: Node<'ArrowFunctionExpression'>) {
                validatePairs.push([node, 'arrow-function']);
            },
            FunctionExpression(node: Node<'FunctionExpression'>) {
                validatePairs.push([node, 'function-expression']);
            },
            VariableDeclaration(node: Node<'VariableDeclaration'>) {
                hasES6OrJsx = hasES6OrJsx || node.kind === 'const' || node.kind === 'let';
            },
            'Program:exit': function onProgramExit() {
                if (hasES6OrJsx) {
                    fileVarType = 'const';
                }
                validatePairs.forEach((pair) => validate(pair[0], pair[1]));
            },
            'ImportDeclaration, ExportNamedDeclaration, ExportDefaultDeclaration, ExportAllDeclaration, ExportSpecifier, ExportDefaultSpecifier, JSXElement, TSExportAssignment, TSImportEqualsDeclaration':
                function onImportDeclarationExportNamedDeclarationExportDef() {
                    hasES6OrJsx = true;
                },
        };
    }),
};

export default rule;
