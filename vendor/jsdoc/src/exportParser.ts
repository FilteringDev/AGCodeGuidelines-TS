import type { TSESTree } from '@typescript-eslint/types';
import { findJSDocComment } from '@es-joy/jsdoccomment';
import debugModule from 'debug';

const debug = debugModule('requireExportJsdoc');

export type ValueObject = {
    value: string;
};

export type CreatedNode = {
    type?: string;
    value?:
        | ValueObject
        | import('eslint').Rule.Node
        | TSESTree.Node;
    props: {
        [key: string]: CreatedNode | null | undefined;
    };
    special?: true;
    globalVars?: CreatedNode;
    exported?: boolean;
    ANONYMOUS_DEFAULT?: import('eslint').Rule.Node;
};

/**
 * @returns The result of this check.
 */
const createNode = function createNode(): CreatedNode {
    return {
        props: {},
    };
};

/**
 * @param symbol The symbol value.
 * @returns The result of this check.
 */
const getSymbolValue = function getSymbolValue(symbol: CreatedNode | null | undefined): string | null {
    if (!symbol) {
        return null;
    }

    if (symbol.type === 'literal') {
        return (symbol.value as ValueObject).value;
    }

    return null;
};

/**
 *
 * @param node The node to inspect.
 * @param globals The globals value.
 * @param scope The lexical scope.
 * @param opts The opts value.
 * @returns The result of this check.
 */
const getIdentifier = function getIdentifier(
    node: import('estree').Identifier,
    globals: CreatedNode,
    scope: CreatedNode,
    opts: SymbolOptions,
): CreatedNode | null | undefined {
    if (opts.simpleIdentifier) {
        // Type is Identier for noncomputed properties
        const identifierLiteral = createNode();
        identifierLiteral.type = 'literal';
        identifierLiteral.value = {
            value: node.name,
        };

        return identifierLiteral;
    }

    const block = scope || globals;

    // As scopes are not currently supported, they are not traversed upwards recursively
    if (block.props[node.name]) {
        return block.props[node.name];
    }

    // Seems this will only be entered once scopes added and entered

    if (globals.props[node.name]) {
        return globals.props[node.name];
    }

    return null;
};

export type CreateSymbol = (
    node: import('eslint').Rule.Node | TSESTree.Node | null,
    globals: CreatedNode,
    value:
        | import('eslint').Rule.Node
        | TSESTree.Node
        | null,
    scope?: CreatedNode,
    isGlobal?: boolean | SymbolOptions,
) => CreatedNode | null | undefined;

let createSymbol: CreateSymbol;

export type SymbolOptions = {
    simpleIdentifier?: boolean;
};

/**
 *
 * @param node The node to inspect.
 * @param globals The globals value.
 * @param scope The lexical scope.
 * @param [opt] The opt value.
 * @returns The result of this check.
 */
const getSymbol = function getSymbol(
    node:
        | import('eslint').Rule.Node
        | TSESTree.Node,
    globals: CreatedNode,
    scope: CreatedNode,
    opt?: SymbolOptions,
): CreatedNode | null | undefined {
    const opts = opt || {};

    switch (node.type) {
        case 'ArrowFunctionExpression': /*  Fallthrough */
        case 'ClassDeclaration':
        case 'FunctionDeclaration':
        case 'FunctionExpression':
        case 'TSEnumDeclaration':
        case 'TSInterfaceDeclaration':
        case 'TSTypeAliasDeclaration': {
            const val = createNode();
            const prototypeMember = createNode();
            prototypeMember.type = 'object';
            Object.assign(val.props, { prototype: prototypeMember });
            val.type = 'object';
            val.value = node;

            return val;
        }

        case 'AssignmentExpression': {
            return createSymbol(
                node.left as import('eslint').Rule.Node,
                globals,
                node.right as import('eslint').Rule.Node,
                scope,
                opts,
            );
        }

        case 'ClassBody': {
            const val = createNode();
            (node.body).forEach((method) => {
                // StaticBlock
                if (!('key' in method)) {
                    return;
                }

                val.props[(
                    (method as import('estree').MethodDefinition)
                        .key as import('estree').Identifier
                ).name
                ] = createNode(); (
                    val.props as {
                        [key: string]: CreatedNode;
                    }
                )[(
                    (method as import('estree').MethodDefinition)
                        .key as import('estree').Identifier
                ).name
                ]!.type = 'object'; (
                    val.props as {
                        [key: string]: CreatedNode;
                    }
                )[(
                    (method as import('estree').MethodDefinition)
                        .key as import('estree').Identifier
                ).name
                ]!.value = (
                    method as import('estree').MethodDefinition
                ).value as import('eslint').Rule.Node;
            });

            val.type = 'object';
            val.value = node.parent;

            return val;
        }

        case 'ClassExpression': {
            return getSymbol(
                node.body as import('eslint').Rule.Node,
                globals,
                scope,
                opts,
            );
        }

        case 'Identifier': {
            return getIdentifier(node, globals, scope, opts);
        }

        case 'Literal': {
            const val = createNode();
            val.type = 'literal';
            val.value = node;

            return val;
        }

        case 'MemberExpression': {
            const obj = getSymbol(
                node.object as import('eslint').Rule.Node,
                globals,
                scope,
                opts,
            );
            const propertySymbol = getSymbol(
                node.property as import('eslint').Rule.Node,
                globals,
                scope,
                {
                    simpleIdentifier: !node.computed,
                },
            );
            const propertyValue = getSymbolValue(propertySymbol);

            if (obj && propertyValue && obj.props[propertyValue]) {
                const block = obj.props[propertyValue];

                return block;
            }

            // Missing properties are not synthesized during export analysis.

            debug(
                `MemberExpression: Missing property ${(
                    node.property as import('estree').PrivateIdentifier
                ).name
                }`,
            );

            return null;
        }

        case 'ObjectExpression': {
            const val = createNode();
            val.type = 'object';
            (node.properties).forEach((prop) => {
                if (
                    [
                        // @babel/eslint-parser
                        'ExperimentalSpreadProperty',

                        // typescript-eslint, espree, acorn, etc.
                        'SpreadElement',
                    ].includes(prop.type)
                ) {
                    return;
                }

                const propVal = getSymbol(
                    (prop as import('estree').Property)
                        .value as import('eslint').Rule.Node,
                    globals,
                    scope,
                    opts,
                );

                if (propVal) {
                    val.props[
                        (
                            (prop as import('estree').Property)
                                .key as import('estree').Identifier
                        ).name
                    ] = propVal;
                }
            });

            return val;
        }

        default: break;
    }

    return null;
};

/**
 *
 * @param block The block value.
 * @param name The name value.
 * @param value The value to inspect.
 * @param globals The globals value.
 * @param isGlobal The is global value.
 */
const createBlockSymbol = function createBlockSymbol(
    block: CreatedNode,
    name: string,
    value: CreatedNode | null | undefined,
    globals: CreatedNode,
    isGlobal: boolean | SymbolOptions | undefined,
): void {
    Object.assign(block.props, { [name]: value });
    if (isGlobal && globals.props.window && globals.props.window.special) {
        Object.assign(globals.props.window.props, { [name]: value });
    }
};

createSymbol = function buildSymbol(node, globals, value, scope, isGlobal) {
    const block = scope || globals;

    if (!node) {
        return null;
    }

    let symbol;
    switch (node.type) {
        case 'ClassDeclaration': /*  Fall through */
        case 'FunctionDeclaration':
        case 'TSEnumDeclaration': /*  Fall through */
        case 'TSInterfaceDeclaration':
        case 'TSTypeAliasDeclaration': {
            const nde = node as import('estree').ClassDeclaration;

            if (nde.id && nde.id.type === 'Identifier') {
                return createSymbol(
                    nde.id as import('eslint').Rule.Node,
                    globals,
                    node,
                    globals,
                );
            }

            break;
        }

        case 'Identifier': {
            const nde = node as import('estree').Identifier;
            if (value) {
                const valueSymbol = getSymbol(value, globals, block);

                if (valueSymbol) {
                    createBlockSymbol(
                        block,
                        nde.name,
                        valueSymbol,
                        globals,
                        isGlobal,
                    );

                    return block.props[nde.name];
                }

                debug('Identifier: Missing value symbol for %s', nde.name);
            } else {
                createBlockSymbol(
                    block,
                    nde.name,
                    createNode(),
                    globals,
                    isGlobal,
                );

                return block.props[nde.name];
            }

            break;
        }

        case 'MemberExpression': {
            const nde = node as import('estree').MemberExpression;
            symbol = getSymbol(
                nde.object as import('eslint').Rule.Node,
                globals,
                block,
            );

            const propertySymbol = getSymbol(
                nde.property as import('eslint').Rule.Node,
                globals,
                block,
                {
                    simpleIdentifier: !nde.computed,
                },
            );
            const propertyValue = getSymbolValue(propertySymbol);
            if (symbol && propertyValue) {
                createBlockSymbol(
                    symbol,
                    propertyValue,
                    getSymbol(
                        value as import('eslint').Rule.Node,
                        globals,
                        block,
                    ),
                    globals,
                    isGlobal,
                );
                return symbol.props[propertyValue];
            }

            debug('MemberExpression: Missing symbol: %s', (
                nde.property as import('estree').Identifier
            ).name);
            break;
        }

        default: break;
    }

    return null;
};

/**
 * Creates variables from variable definitions
 * @param node The node to inspect.
 * @param globals The globals value.
 * @param opts The opts value.
 */
const initVariables = function initVariables(
    node: import('eslint').Rule.Node,
    globals: CreatedNode,
    opts: import('./rules/requireJsdoc').RequireJsdocOpts,
): void {
    switch (node.type) {
        case 'ExportNamedDeclaration': {
            if (node.declaration) {
                initVariables(
                    node.declaration as import('eslint').Rule.Node,
                    globals,
                    opts,
                );
            }

            break;
        }

        case 'ExpressionStatement': {
            initVariables(
                node.expression as import('eslint').Rule.Node,
                globals,
                opts,
            );
            break;
        }

        case 'Program': {
            (node.body).forEach((childNode) => {
                initVariables(
                    childNode as import('eslint').Rule.Node,
                    globals,
                    opts,
                );
            });

            break;
        }

        case 'VariableDeclaration': {
            (node.declarations).forEach((declaration) => {
                // let and const
                const symbol = createSymbol(
                    declaration.id as import('eslint').Rule.Node,
                    globals,
                    null,
                    globals,
                );
                if (
                    opts.initWindow
                    && node.kind === 'var'
                    && globals.props.window
                ) {
                    // If var, also add to window
                    Object.assign(globals.props.window.props, { [(declaration.id as import('estree').Identifier).name]: symbol });
                }
            });

            break;
        }

        default: break;
    }
};

/**
 * Populates variable maps using AST
 * @param node The node to inspect.
 * @param globals The globals value.
 * @param opt The opt value.
 * @param [isExport] The is export value.
 * @returns The result of this check.
 */
const mapVariables = function mapVariables(
    node:
        | import('eslint').Rule.Node
        | TSESTree.Node,
    globals: CreatedNode,
    opt: import('./rules/requireJsdoc').RequireJsdocOpts,
    isExport?: true,
): boolean {
    const opts = opt || {};

    switch (node.type) {
        case 'AssignmentExpression': {
            createSymbol(
                node.left as import('eslint').Rule.Node,
                globals,
                node.right as import('eslint').Rule.Node,
            );
            break;
        }

        case 'ClassDeclaration': {
            createSymbol(
                node.id as
                    | import('eslint').Rule.Node
                    | null,
                globals,
                node.body as import('eslint').Rule.Node,
                globals,
            );
            break;
        }

        case 'ExportDefaultDeclaration': {
            const symbol = createSymbol(
                node.declaration as import('eslint').Rule.Node,
                globals,
                node.declaration as import('eslint').Rule.Node,
            );
            if (symbol) {
                symbol.exported = true;
            } else {
                // if (!node.id) {
                Object.assign(globals, { ANONYMOUS_DEFAULT: node.declaration as import('eslint').Rule.Node });
            }

            break;
        }

        case 'ExportNamedDeclaration': {
            if (node.declaration) {
                if (node.declaration.type === 'VariableDeclaration') {
                    mapVariables(
                        node.declaration as import('eslint').Rule.Node,
                        globals,
                        opts,
                        true,
                    );
                } else {
                    const symbol = createSymbol(
                        node.declaration as import('eslint').Rule.Node,
                        globals,
                        node.declaration as import('eslint').Rule.Node,
                    );

                    if (symbol) {
                        symbol.exported = true;
                    }
                }
            }

            (node.specifiers).forEach((specifier) => {
                mapVariables(
                    specifier as import('eslint').Rule.Node,
                    globals,
                    opts,
                );
            });

            break;
        }

        case 'ExportSpecifier': {
            const symbol = getSymbol(
                node.local as import('eslint').Rule.Node,
                globals,
                globals,
            );

            if (symbol) {
                symbol.exported = true;
            }

            break;
        }

        case 'ExpressionStatement': {
            mapVariables(
                node.expression as import('eslint').Rule.Node,
                globals,
                opts,
            );
            break;
        }

        case 'FunctionDeclaration':
        case 'TSTypeAliasDeclaration': {
            if ((
                node.id as import('estree').Identifier
            ).type === 'Identifier'
            ) {
                createSymbol(
                    node.id as import('eslint').Rule.Node,
                    globals,
                    node,
                    globals,
                    true,
                );
            }

            break;
        }

        case 'Program': {
            if (opts.ancestorsOnly) {
                return false;
            }

            (node.body).forEach((childNode) => {
                mapVariables(
                    childNode as import('eslint').Rule.Node,
                    globals,
                    opts,
                );
            });

            break;
        }

        case 'VariableDeclaration': {
            (node.declarations).forEach((declaration) => {
                const isGlobal = Boolean(
                    opts.initWindow
                        && node.kind === 'var'
                        && globals.props.window,
                );
                const symbol = createSymbol(
                    declaration.id as import('eslint').Rule.Node,
                    globals,
                    declaration.init as import('eslint').Rule.Node,
                    globals,
                    isGlobal,
                );
                if (symbol && isExport) {
                    symbol.exported = true;
                }
            });

            break;
        }

        default: {
            return false;
        }
    }

    return true;
};

/**
 *
 * @param node The node to inspect.
 * @param block The block value.
 * @param [cache] The cache value.
 * @returns The result of this check.
 */
const findNode = function findNode(
    node: import('eslint').Rule.Node,
    block: unknown,
    cache?: unknown[],
): boolean {
    let blockCache = cache || [];
    if (!block || blockCache.includes(block)) {
        return false;
    }

    blockCache = blockCache.slice();
    blockCache.push(block);

    if (
        typeof block === 'object'
        && 'type' in block
        && (block.type === 'object' || block.type === 'MethodDefinition')
        && (block as Record<string, unknown>).value === node
    ) {
        return true;
    }

    if (typeof block !== 'object') {
        return false;
    }

    const props = (('props' in block && block.props) || ('body' in block && block.body)) as Record<string, unknown> | undefined;
    const exportMembers = Array.from(props && 'type' in props && props.type === 'ClassBody'
        ? props.body as unknown[]
        : Object.values(props || {}));
    for (let exportMembersIndex = 0; exportMembersIndex < exportMembers.length; exportMembersIndex += 1) {
        const propval = exportMembers[exportMembersIndex]!;
        if (Array.isArray(propval)) {
            if (
                propval.some((val: unknown) => findNode(node, val, blockCache))
            ) {
                return true;
            }
        } else if (findNode(node, propval, blockCache)) {
            return true;
        }
    }

    return false;
};

const exportTypes = new Set([
    'ExportDefaultDeclaration',
    'ExportNamedDeclaration',
]);
const ignorableNestedTypes = new Set([
    'ArrowFunctionExpression',
    'FunctionDeclaration',
    'FunctionExpression',
]);

/**
 * @param nde The nde value.
 * @returns The result of this check.
 */
const getExportAncestor = function getExportAncestor(
    nde: import('eslint').Rule.Node,
): import('eslint').Rule.Node | false {
    let node: import('eslint').Rule.Node | null = nde;
    let idx = 0;
    const ignorableIfDeep = ignorableNestedTypes.has(nde?.type);
    while (node) {
        // Ignore functions nested more deeply than say `export default function () {}`
        if (idx >= 2 && ignorableIfDeep) {
            break;
        }

        if (exportTypes.has(node.type)) {
            return node;
        }

        node = node.parent;
        idx += 1;
    }

    return false;
};

const canBeExportedByAncestorType = new Set([
    'ClassProperty',
    'Method',
    'PropertyDefinition',
    'TSMethodSignature',
    'TSPropertySignature',
]);

const canExportChildrenType = new Set([
    'ClassBody',
    'ClassDeclaration',
    'ClassDefinition',
    'ClassExpression',
    'Program',
    'TSInterfaceBody',
    'TSInterfaceDeclaration',
    'TSTypeAliasDeclaration',
    'TSTypeLiteral',
    'TSTypeParameterInstantiation',
    'TSTypeReference',
]);

/**
 * @param nde The nde value.
 * @returns The result of this check.
 */
const isExportByAncestor = function isExportByAncestor(
    nde: import('eslint').Rule.Node,
): false | import('eslint').Rule.Node {
    if (!canBeExportedByAncestorType.has(nde.type)) {
        return false;
    }

    let node = nde.parent;
    while (node) {
        if (exportTypes.has(node.type)) {
            return node;
        }

        if (!canExportChildrenType.has(node.type)) {
            return false;
        }

        node = node.parent;
    }

    return false;
};

/**
 *
 * @param block The block value.
 * @param node The node to inspect.
 * @param [cache] Currently unused
 * @returns The result of this check.
 */
const findExportedNode = function findExportedNode(
    block: CreatedNode,
    node: import('eslint').Rule.Node,
    cache?: CreatedNode[],
): boolean {
    if (block === null) {
        return false;
    }

    const blockCache = cache || [];
    const { props } = block;
    const exportedValues = Array.from(Object.values(props));
    for (let exportedValuesIndex = 0; exportedValuesIndex < exportedValues.length; exportedValuesIndex += 1) {
        const propval = exportedValues[exportedValuesIndex]!;
        const pval = propval as CreatedNode;
        blockCache.push(pval);
        if (
            pval.exported
            && (node === pval.value || findNode(node, pval.value))
        ) {
            return true;
        }

        // No need to check `propval` for exported nodes as ESM
        //  exports are only global
    }

    return false;
};

/**
 *
 * @param node The node to inspect.
 * @param globals The globals value.
 * @param opt The opt value.
 * @returns The result of this check.
 */
const isNodeExported = function isNodeExported(
    node: import('eslint').Rule.Node,
    globals: CreatedNode,
    opt: import('./rules/requireJsdoc').RequireJsdocOpts,
): boolean {
    const moduleExports = globals.props.module?.props?.exports;
    if (
        opt.initModuleExports
        && moduleExports
        && findNode(node, moduleExports)
    ) {
        return true;
    }

    if (
        opt.initWindow
        && globals.props.window
        && findNode(node, globals.props.window)
    ) {
        return true;
    }

    if (opt.esm && findExportedNode(globals, node)) {
        return true;
    }

    return false;
};

/**
 *
 * @param node The node to inspect.
 * @param globalVars The global vars value.
 * @param opts The opts value.
 * @returns The result of this check.
 */
const parseRecursive = function parseRecursive(
    node: import('eslint').Rule.Node,
    globalVars: CreatedNode,
    opts: import('./rules/requireJsdoc').RequireJsdocOpts,
): boolean {
    // Iterate from top using recursion - stop at first processed node from top
    if (node.parent && parseRecursive(node.parent, globalVars, opts)) {
        return true;
    }

    return mapVariables(node, globalVars, opts);
};

/**
 *
 * @param ast The ast value.
 * @param node The node to inspect.
 * @param opt The opt value.
 * @returns The result of this check.
 */
const parse = function parse(
    ast: import('eslint').Rule.Node,
    node: import('eslint').Rule.Node,
    opt: import('./rules/requireJsdoc').RequireJsdocOpts,
): CreatedNode {
    const opts = opt || {
        ancestorsOnly: false,
        esm: true,
        initModuleExports: true,
        initWindow: true,
    };

    const globalVars = createNode();
    if (opts.initModuleExports) {
        globalVars.props.module = createNode();
        globalVars.props.module.props.exports = createNode();
        globalVars.props.exports = globalVars.props.module.props.exports;
    }

    if (opts.initWindow) {
        globalVars.props.window = createNode();
        globalVars.props.window.special = true;
    }

    if (opts.ancestorsOnly) {
        parseRecursive(node, globalVars, opts);
    } else {
        initVariables(ast, globalVars, opts);
        mapVariables(ast, globalVars, opts);
    }

    return {
        globalVars,
        props: {},
    };
};

const accessibilityNodes = new Set(['MethodDefinition', 'PropertyDefinition']);

/**
 *
 * @param node The node to inspect.
 * @returns The result of this check.
 */
const isPrivate = (node: import('eslint').Rule.Node): boolean => (
    (accessibilityNodes.has(node.type)
            && 'accessibility' in node
            && node.accessibility !== 'public'
            && node.accessibility != null)
        || ('key' in node && node.key.type === 'PrivateIdentifier')
);

/**
 *
 * @param node The node to inspect.
 * @param sourceCode The source text and token accessors.
 * @param opt The opt value.
 * @param settings The settings value.
 * @returns The result of this check.
 */
const isUncommentedExport = function isUncommentedExport(
    node: import('eslint').Rule.Node,
    sourceCode: import('eslint').SourceCode,
    opt: import('./rules/requireJsdoc').RequireJsdocOpts,
    settings: import('./iterateJsdoc').Settings,
): boolean {
    // console.log({node});
    // Optimize with ancestor check for esm
    if (opt.esm) {
        if (isPrivate(node) || (node.parent && isPrivate(node.parent))) {
            return false;
        }

        const exportNode = getExportAncestor(node);

        // Is export node comment
        if (exportNode && !findJSDocComment(exportNode, sourceCode, settings)) {
            return true;
        }

        /**
         * Some typescript types are not in variable map, but inherit exported (interface property and method)
         */
        if (
            isExportByAncestor(node)
            && !findJSDocComment(node, sourceCode, settings)
        ) {
            return true;
        }
    }

    const ast = sourceCode.ast as unknown;

    const parseResult = parse(
        ast as import('eslint').Rule.Node,
        node,
        opt,
    );

    return isNodeExported(
        node,
        parseResult.globalVars as CreatedNode,
        opt,
    );
};

export default {
    isUncommentedExport,
    parse,
};
