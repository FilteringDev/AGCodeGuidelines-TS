/**
 * @file Rule to enforce grouped require statements for Node.JS
 * @author Raphael Pigulla
 * @deprecated in ESLint v7.0.0
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[(boolean | { grouping?: boolean; allowCall?: boolean })?]> = {
    meta: {
        deprecated: true,

        replacedBy: [],

        type: 'suggestion',

        docs: {
            description:
                'Disallow `require` calls to be mixed with regular variable declarations',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-mixed-requires',
        },

        schema: [
            {
                oneOf: [
                    {
                        type: 'boolean',
                    },
                    {
                        type: 'object',
                        properties: {
                            grouping: {
                                type: 'boolean',
                            },
                            allowCall: {
                                type: 'boolean',
                            },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        ],

        messages: {
            noMixRequire: "Do not mix 'require' and other declarations.",
            noMixCoreModuleFileComputed: 'Do not mix core, module, file and computed requires.',
        },
    },

    create(context) {
        const options = context.options[0];
        let grouping: boolean | boolean | undefined = false;
        let allowCall: boolean | boolean | undefined = false;

        if (typeof options === 'object') {
            grouping = options.grouping;
            allowCall = options.allowCall;
        } else {
            grouping = !!options;
        }

        /**
         * Returns the list of built-in modules.
         * @returns An array of built-in Node.js modules.
         */
        function getBuiltinModules() {
            /**
             * This list is generated using:
             * `require("repl")._builtinLibs.concat('repl').sort()`
             * This particular list is as per nodejs v0.12.2 and iojs v0.7.1
             */
            return [
                'assert',
                'buffer',
                'child_process',
                'cluster',
                'crypto',
                'dgram',
                'dns',
                'domain',
                'events',
                'fs',
                'http',
                'https',
                'net',
                'os',
                'path',
                'punycode',
                'querystring',
                'readline',
                'repl',
                'smalloc',
                'stream',
                'string_decoder',
                'tls',
                'tty',
                'url',
                'util',
                'v8',
                'vm',
                'zlib',
            ];
        }

        const BUILTIN_MODULES = getBuiltinModules();

        const DECL_REQUIRE = 'require';
        const DECL_UNINITIALIZED = 'uninitialized';
        const DECL_OTHER = 'other';

        const REQ_CORE = 'core';
        const REQ_FILE = 'file';
        const REQ_MODULE = 'module';
        const REQ_COMPUTED = 'computed';

        /**
         * Determines the type of a declaration statement.
         * @param initExpression The init node of the VariableDeclarator.
         * @returns The type of declaration represented by the expression.
         */
        function getDeclarationType(
            initExpression: Node | null | undefined,
        ): 'require' | 'uninitialized' | 'other' {
            if (!initExpression) {
                // "var x;"
                return DECL_UNINITIALIZED;
            }

            if (
                initExpression.type === 'CallExpression'
                && initExpression.callee.type === 'Identifier'
                && initExpression.callee.name === 'require'
            ) {
                // "var x = require('util');"
                return DECL_REQUIRE;
            }
            if (
                allowCall
                && initExpression.type === 'CallExpression'
                && initExpression.callee.type === 'CallExpression'
            ) {
                // "var x = require('diagnose')('sub-module');"
                return getDeclarationType(initExpression.callee);
            }
            if (initExpression.type === 'MemberExpression') {
                // "var x = require('glob').Glob;"
                return getDeclarationType(initExpression.object);
            }

            // "var x = 42;"
            return DECL_OTHER;
        }

        /**
         * Determines the type of module that is loaded via require.
         * @param initExpression The init node of the VariableDeclarator.
         * @returns The module type.
         */
        function inferModuleType(
            initExpression: Node,
        ): 'computed' | 'core' | 'file' | 'module' {
            if (initExpression.type === 'MemberExpression') {
                // "var x = require('glob').Glob;"
                return inferModuleType(initExpression.object);
            }
            if (!('arguments' in initExpression) || initExpression.arguments.length === 0) {
                // "var x = require();"
                return REQ_COMPUTED;
            }

            const arg = initExpression.arguments[0]!;

            if (arg.type !== 'Literal' || typeof arg.value !== 'string') {
                // "var x = require(42);"
                return REQ_COMPUTED;
            }

            if (BUILTIN_MODULES.includes(arg.value)) {
                // "var fs = require('fs');"
                return REQ_CORE;
            }
            if (/^\.{0,2}\//u.test(arg.value)) {
                // "var utils = require('./utils');"
                return REQ_FILE;
            }

            // "var async = require('async');"
            return REQ_MODULE;
        }

        /**
         * Check if the list of variable declarations is mixed, i.e. whether it
         * contains both require and other declarations.
         * @param declarations The list of VariableDeclarators.
         * @returns True if the declarations are mixed, false if not.
         */
        function isMixed(declarations: Node<'VariableDeclarator'>[]) {
            const contains: Partial<Record<'require' | 'uninitialized' | 'other', boolean>> = {};

            declarations.forEach((declaration) => {
                const type = getDeclarationType(declaration.init);

                contains[type] = true;
            });

            return !!(
                contains[DECL_REQUIRE]
                && (contains[DECL_UNINITIALIZED] || contains[DECL_OTHER])
            );
        }

        /**
         * Check if all require declarations in the given list are of the same
         * type.
         * @param declarations The list of VariableDeclarators.
         * @returns True if the declarations are grouped, false if not.
         */
        function isGrouped(declarations: Node<'VariableDeclarator'>[]) {
            const found: Partial<Record<'computed' | 'core' | 'file' | 'module', boolean>> = {};

            declarations.forEach((declaration) => {
                if (getDeclarationType(declaration.init) === DECL_REQUIRE) {
                    found[inferModuleType(declaration.init!)] = true;
                }
            });

            return Object.keys(found).length <= 1;
        }

        return {
            VariableDeclaration(node: Node<'VariableDeclaration'>) {
                if (isMixed(node.declarations)) {
                    context.report({
                        node,
                        messageId: 'noMixRequire',
                    });
                } else if (grouping && !isGrouped(node.declarations)) {
                    context.report({
                        node,
                        messageId: 'noMixCoreModuleFileComputed',
                    });
                }
            },
        };
    },
};

export default rule;
