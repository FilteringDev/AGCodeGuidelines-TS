/**
 * @file Rule to check for jsdoc presence.
 * @author Gyandeep Singh
 * @deprecated in ESLint v5.10.0
 */
import type { LegacyRule, Node } from '../../../types';

const rule: LegacyRule<
    [
        {
            require?: {
                ClassDeclaration?: boolean;
                MethodDefinition?: boolean;
                FunctionDeclaration?: boolean;
                ArrowFunctionExpression?: boolean;
                FunctionExpression?: boolean;
            };
        }?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Require JSDoc comments',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/require-jsdoc',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    require: {
                        type: 'object',
                        properties: {
                            ClassDeclaration: {
                                type: 'boolean',
                                default: false,
                            },
                            MethodDefinition: {
                                type: 'boolean',
                                default: false,
                            },
                            FunctionDeclaration: {
                                type: 'boolean',
                                default: true,
                            },
                            ArrowFunctionExpression: {
                                type: 'boolean',
                                default: false,
                            },
                            FunctionExpression: {
                                type: 'boolean',
                                default: false,
                            },
                        },
                        additionalProperties: false,
                        default: {},
                    },
                },
                additionalProperties: false,
            },
        ],

        deprecated: true,
        replacedBy: [],

        messages: {
            missingJSDocComment: 'Missing JSDoc comment.',
        },
    },

    create(context) {
        const source = context.sourceCode;
        const DEFAULT_OPTIONS = {
            FunctionDeclaration: true,
            MethodDefinition: false,
            ClassDeclaration: false,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
        };
        const options = Object.assign(
            DEFAULT_OPTIONS,
            context.options[0] && context.options[0].require,
        );

        /**
         * Report the error message
         * @param node node to report
         */
        function report(
            node: Node<
                | 'ArrowFunctionExpression'
                | 'ClassDeclaration'
                | 'FunctionDeclaration'
                | 'FunctionExpression'
            >,
        ) {
            context.report({ node, messageId: 'missingJSDocComment' });
        }

        /**
         * Check if the jsdoc comment is present or not.
         * @param node node to examine
         */
        function checkJsDoc(
            node: Node<
                | 'ArrowFunctionExpression'
                | 'ClassDeclaration'
                | 'FunctionDeclaration'
                | 'FunctionExpression'
            >,
        ) {
            const jsdocComment = source.getJSDocComment(node);

            if (!jsdocComment) {
                report(node);
            }
        }

        return {
            FunctionDeclaration(node: Node<'FunctionDeclaration'>) {
                if (options.FunctionDeclaration) {
                    checkJsDoc(node);
                }
            },
            FunctionExpression(node: Node<'FunctionExpression'>) {
                if (
                    (options.MethodDefinition && node.parent.type === 'MethodDefinition')
                    || (options.FunctionExpression
                        && (node.parent.type === 'VariableDeclarator'
                            || (node.parent.type === 'Property' && node === node.parent.value)))
                ) {
                    checkJsDoc(node);
                }
            },
            ClassDeclaration(node: Node<'ClassDeclaration'>) {
                if (options.ClassDeclaration) {
                    checkJsDoc(node);
                }
            },
            ArrowFunctionExpression(node: Node<'ArrowFunctionExpression'>) {
                if (
                    options.ArrowFunctionExpression
                    && node.parent.type === 'VariableDeclarator'
                ) {
                    checkJsDoc(node);
                }
            },
        };
    },
};

export default rule;
