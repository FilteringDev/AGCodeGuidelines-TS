/** @file Boundary plugin constants. */
export const PLUGIN_NAME = 'boundaries';
export const PLUGIN_ENV_VARS_PREFIX = 'BOUNDARIES';

// settings
export const ELEMENTS = `${PLUGIN_NAME}/elements`;
export const IGNORE = `${PLUGIN_NAME}/ignore`;
export const INCLUDE = `${PLUGIN_NAME}/include`;
export const ROOT_PATH = `${PLUGIN_NAME}/root-path`;
export const DEPENDENCY_NODES = `${PLUGIN_NAME}/dependency-nodes`;
export const ADDITIONAL_DEPENDENCY_NODES = `${PLUGIN_NAME}/additional-dependency-nodes`;

// env vars
export const DEBUG = `${PLUGIN_ENV_VARS_PREFIX}_DEBUG`;
export const ENV_ROOT_PATH = `${PLUGIN_ENV_VARS_PREFIX}_ROOT_PATH`;

// rules
export const RULE_ELEMENT_TYPES = `${PLUGIN_NAME}/element-types`;

// elements settings properties,
export const VALID_MODES = ['folder', 'file', 'full'];

export const VALID_DEPENDENCY_NODE_KINDS = ['value', 'type'];
export const DEFAULT_DEPENDENCY_NODES: Record<string, { selector: string; kind: string }[]> = {
    require: [
        // Note: detects "require('source')"
        {
            selector: 'CallExpression[callee.name=require] > Literal',
            kind: 'value',
        },
    ],
    import: [
        // Note: detects "import x from 'source'"
        { selector: 'ImportDeclaration:not([importKind=type]) > Literal', kind: 'value' },
        // Note: detects "import type x from 'source'"
        { selector: 'ImportDeclaration[importKind=type] > Literal', kind: 'type' },
    ],
    'dynamic-import': [
        // Note: detects "import('source')"
        { selector: 'ImportExpression > Literal', kind: 'value' },
    ],
    export: [
        // Note: detects "export * from 'source'";
        { selector: 'ExportAllDeclaration:not([exportKind=type]) > Literal', kind: 'value' },
        // Note: detects "export type * from 'source'";
        { selector: 'ExportAllDeclaration[exportKind=type] > Literal', kind: 'type' },
        // Note: detects "export { x } from 'source'";
        { selector: 'ExportNamedDeclaration:not([exportKind=type]) > Literal', kind: 'value' },
        // Note: detects "export type { x } from 'source'";
        { selector: 'ExportNamedDeclaration[exportKind=type] > Literal', kind: 'type' },
    ],
};
