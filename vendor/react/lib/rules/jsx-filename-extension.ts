import * as dependency0 from 'node:path';
import type { LegacyRule, Node } from '../../types';
/**
 * @file Restrict file extensions that may contain JSX
 * @author Joe Lencioni
 */
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/report';

const path = dependency0;
const docsUrl = dependency1;
const report = dependency2;

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const DEFAULTS = {
    allow: 'always',
    extensions: ['.jsx'],
    ignoreFilesWithoutCode: false,
};

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noJSXWithExtension: "JSX not allowed in files with extension '{{ext}}'",
    extensionOnlyForJSX: "Only files containing JSX may use the extension '{{ext}}'",
};

const rule: LegacyRule<
    [{ allow?: 'always' | 'as-needed'; extensions?: string[]; ignoreFilesWithoutCode?: boolean }?]
> = {
    meta: {
        docs: {
            description: 'Disallow file extensions that may contain JSX',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-filename-extension'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    allow: {
                        enum: ['always', 'as-needed'],
                    },
                    extensions: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    ignoreFilesWithoutCode: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const filename = context.getFilename();

        let jsxNode: Node | undefined;

        if (filename === '<text>') {
            // No need to traverse any nodes.
            return {};
        }

        const allow = (context.options[0] && context.options[0].allow) || DEFAULTS.allow;
        const allowedExtensions = (context.options[0] && context.options[0].extensions) || DEFAULTS.extensions;
        const ignoreFilesWithoutCode = (context.options[0] && context.options[0].ignoreFilesWithoutCode)
            || DEFAULTS.ignoreFilesWithoutCode;
        const isAllowedExtension = allowedExtensions.some(
            (extension) => filename.slice(-extension.length) === extension,
        );

        /**
         * Remember the first JSX node for the filename diagnostic.
         * @param node The JSX node.
         */
        function handleJSX(node: Node) {
            if (!jsxNode) {
                jsxNode = node;
            }
        }

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        return {
            JSXElement: handleJSX,
            JSXFragment: handleJSX,

            'Program:exit': function onProgramExit(node: Node<'Program'>) {
                if (jsxNode) {
                    if (!isAllowedExtension) {
                        report(context, messages.noJSXWithExtension, 'noJSXWithExtension', {
                            node: jsxNode,
                            data: {
                                ext: path.extname(filename),
                            },
                        });
                    }
                    return;
                }

                if (isAllowedExtension && allow === 'as-needed') {
                    if (ignoreFilesWithoutCode && node.body.length === 0) {
                        return;
                    }
                    report(context, messages.extensionOnlyForJSX, 'extensionOnlyForJSX', {
                        node,
                        data: {
                            ext: path.extname(filename),
                        },
                    });
                }
            },
        };
    },
};

export default rule;
