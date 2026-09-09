import dependency0 from '../../compat/doctrine';
import type { DocTag, DocType } from '../../compat/doctrine';
import type {
    Comment, Fixer, LegacyRule, Node, Token,
} from '../../../types';

/**
 * @file Validates JSDoc comments are syntactically correct
 * @author Nicholas C. Zakas
 * @deprecated in ESLint v5.10.0
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const doctrine = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        {
            prefer?: { [key: string]: string };
            preferType?: { [key: string]: string };
            requireReturn?: boolean;
            requireParamDescription?: boolean;
            requireReturnDescription?: boolean;
            matchDescription?: string;
            requireReturnType?: boolean;
            requireParamType?: boolean;
        }?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Enforce valid JSDoc comments',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/valid-jsdoc',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    prefer: {
                        type: 'object',
                        additionalProperties: {
                            type: 'string',
                        },
                    },
                    preferType: {
                        type: 'object',
                        additionalProperties: {
                            type: 'string',
                        },
                    },
                    requireReturn: {
                        type: 'boolean',
                        default: true,
                    },
                    requireParamDescription: {
                        type: 'boolean',
                        default: true,
                    },
                    requireReturnDescription: {
                        type: 'boolean',
                        default: true,
                    },
                    matchDescription: {
                        type: 'string',
                    },
                    requireReturnType: {
                        type: 'boolean',
                        default: true,
                    },
                    requireParamType: {
                        type: 'boolean',
                        default: true,
                    },
                },
                additionalProperties: false,
            },
        ],

        fixable: 'code',
        messages: {
            unexpectedTag: 'Unexpected @{{title}} tag; function has no return statement.',
            expected: "Expected JSDoc for '{{name}}' but found '{{jsdocName}}'.",
            use: 'Use @{{name}} instead.',
            useType: "Use '{{expectedTypeName}}' instead of '{{currentTypeName}}'.",
            syntaxError: 'JSDoc syntax error.',
            missingBrace: 'JSDoc type missing brace.',
            missingParamDesc: "Missing JSDoc parameter description for '{{name}}'.",
            missingParamType: "Missing JSDoc parameter type for '{{name}}'.",
            missingReturnType: 'Missing JSDoc return type.',
            missingReturnDesc: 'Missing JSDoc return description.',
            missingReturn: 'Missing JSDoc @{{returns}} for function.',
            missingParam: "Missing JSDoc for parameter '{{name}}'.",
            duplicateParam: "Duplicate JSDoc parameter '{{name}}'.",
            unsatisfiedDesc: 'JSDoc description does not satisfy the regex pattern.',
        },

        deprecated: true,
        replacedBy: [],
    },

    create(context) {
        const options = context.options[0] || {};
        const prefer = options.prefer || {};
        const { sourceCode } = context;

        // these both default to true, so you have to explicitly make them false
        const requireReturn = options.requireReturn !== false;
        const requireParamDescription = options.requireParamDescription !== false;
        const requireReturnDescription = options.requireReturnDescription !== false;
        const requireReturnType = options.requireReturnType !== false;
        const requireParamType = options.requireParamType !== false;
        const preferType = options.preferType || {};
        const checkPreferType = Object.keys(preferType).length !== 0;

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        // Using a stack to store if a function returns or not (handling nested functions)
        const fns: { returnPresent: boolean | undefined }[] = [];

        /**
         * Check if node type is a Class
         * @param node node to check.
         * @returns True is its a class
         */
        function isTypeClass(
            node: Node<
                | 'ArrowFunctionExpression'
                | 'ClassDeclaration'
                | 'ClassExpression'
                | 'FunctionDeclaration'
                | 'FunctionExpression'
            >,
        ) {
            return node.type === 'ClassExpression' || node.type === 'ClassDeclaration';
        }

        /**
         * When parsing a new function, store it in our function stack.
         * @param node A function node to check.
         */
        function startFunction(
            node: Node<
                | 'ArrowFunctionExpression'
                | 'ClassDeclaration'
                | 'ClassExpression'
                | 'FunctionDeclaration'
                | 'FunctionExpression'
            >,
        ) {
            fns.push({
                returnPresent:
                    (node.type === 'ArrowFunctionExpression'
                        && node.body.type !== 'BlockStatement')
                    || isTypeClass(node)
                    || node.async,
            });
        }

        /**
         * Indicate that return has been found in the current function.
         * @param node The return node.
         */
        function addReturn(node: Node<'ReturnStatement'>) {
            const functionState = fns[fns.length - 1];

            if (functionState && node.argument !== null) {
                functionState.returnPresent = true;
            }
        }

        /**
         * Check if return tag type is void or undefined
         * @param tag JSDoc tag
         * @returns True if its of type void or undefined
         */
        function isValidReturnType(tag: DocTag) {
            return (
                tag.type === null
                || tag.type?.name === 'void'
                || tag.type?.type === 'UndefinedLiteral'
            );
        }

        /**
         * Check if type should be validated based on some exceptions
         * @param type JSDoc tag
         * @returns True if it can be validated
         */
        function canTypeBeValidated(type: string) {
            return (
                type !== 'UndefinedLiteral' // {undefined} as there is no name property available.
                && type !== 'NullLiteral' // {null}
                && type !== 'NullableLiteral' // {?}
                && type !== 'FunctionType' // {function(a)}
                && type !== 'AllLiteral'
            ); // {*}
        }

        /**
         * Extract the current and expected type based on the input type object
         * @param type JSDoc tag
         * @returns The current type annotation and
         * the expected name of the annotation
         */
        function getCurrentExpectedTypes(type: DocType) {
            let currentType;

            if (type.name) {
                currentType = type;
            } else if ('expression' in type && type.expression) {
                currentType = type.expression;
            }

            return {
                currentType,
                expectedTypeName: currentType && preferType[String(currentType.name)],
            };
        }

        /**
         * Gets the location of a JSDoc node in a file
         * @param jsdocComment The comment that this node is parsed from
         * @param parsedJsdocNode A tag or other node which was parsed from this comment
         * @param parsedJsdocNode.range The range value.
         * @returns The 0-based source location for the tag
         */
        function getAbsoluteRange(jsdocComment: Token, parsedJsdocNode: { range: number[] }) {
            return {
                start: sourceCode.getLocFromIndex(
                    jsdocComment.range[0] + 2 + parsedJsdocNode!.range[0]!,
                ),
                end: sourceCode.getLocFromIndex(
                    jsdocComment.range[0] + 2 + parsedJsdocNode!.range[1]!,
                ),
            };
        }

        /**
         * Validate type for a given JSDoc node
         * @param jsdocNode JSDoc node
         * @param type JSDoc tag
         */
        function validateType(jsdocNode: Comment, type: DocType) {
            if (!type || !canTypeBeValidated(type.type)) {
                return;
            }

            const typesToCheck = [];
            let elements: DocType[] = [];

            switch (type.type) {
                case 'TypeApplication': // {Array.<String>}
                    elements = type.applications[0]!.type === 'UnionType'
                        ? type.applications[0]!.elements
                        : type.applications;
                    typesToCheck.push(getCurrentExpectedTypes(type));
                    break;
                case 'RecordType': // {{20:String}}
                    elements = type.fields;
                    break;
                case 'UnionType': // {String|number|Test}
                case 'ArrayType': // {[String, number, Test]}
                    elements = type.elements;
                    break;
                case 'FieldType': // Array.<{count: number, votes: number}>
                    if (type.value) {
                        typesToCheck.push(getCurrentExpectedTypes(type.value));
                    }
                    break;
                default:
                    typesToCheck.push(getCurrentExpectedTypes(type));
            }

            elements.forEach(validateType.bind(null, jsdocNode));

            typesToCheck.forEach((typeToCheck) => {
                if (
                    typeToCheck.expectedTypeName
                    && typeToCheck.expectedTypeName !== typeToCheck.currentType!.name
                ) {
                    context.report({
                        node: jsdocNode,
                        messageId: 'useType',
                        loc: getAbsoluteRange(jsdocNode, typeToCheck.currentType!),
                        data: {
                            currentTypeName: typeToCheck.currentType!.name,
                            expectedTypeName: typeToCheck.expectedTypeName,
                        },
                        fix(fixer: Fixer) {
                            return fixer.replaceTextRange(
                                [
                                    jsdocNode.range[0] + 2 + typeToCheck.currentType!.range[0],
                                    jsdocNode.range[0] + 2 + typeToCheck.currentType!.range[1],
                                ],
                                typeToCheck.expectedTypeName!,
                            );
                        },
                    });
                }
            });
        }

        /**
         * Validate the JSDoc node and output warnings if anything is wrong.
         * @param node The AST node to check.
         */
        function checkJSDoc(
            node: Node<
                | 'ArrowFunctionExpression'
                | 'ClassDeclaration'
                | 'ClassExpression'
                | 'FunctionDeclaration'
                | 'FunctionExpression'
            >,
        ) {
            const jsdocNode = sourceCode.getJSDocComment(node);
            const functionData = fns.pop();
            const paramTagsByName: Record<string, DocTag> = Object.create(null);
            const paramTags: DocTag[] = [];
            let hasReturns = false;
            let returnsTag: DocTag | undefined;
            let hasConstructor = false;
            let isInterface = false;
            let isOverride = false;
            let isAbstract = false;

            // make sure only to validate JSDoc comments
            if (jsdocNode) {
                let jsdoc;

                try {
                    jsdoc = doctrine.parse(jsdocNode.value, {
                        strict: true,
                        unwrap: true,
                        sloppy: true,
                        range: true,
                    });
                } catch (ex) {
                    if (ex instanceof Error && /braces/iu.test(ex.message)) {
                        context.report({ node: jsdocNode, messageId: 'missingBrace' });
                    } else {
                        context.report({ node: jsdocNode, messageId: 'syntaxError' });
                    }

                    return;
                }

                jsdoc.tags.forEach((tag) => {
                    switch (tag.title.toLowerCase()) {
                        case 'param':
                        case 'arg':
                        case 'argument':
                            paramTags.push(tag);
                            break;

                        case 'return':
                        case 'returns':
                            hasReturns = true;
                            returnsTag = tag;
                            break;

                        case 'constructor':
                        case 'class':
                            hasConstructor = true;
                            break;

                        case 'override':
                        case 'inheritdoc':
                            isOverride = true;
                            break;

                        case 'abstract':
                        case 'virtual':
                            isAbstract = true;
                            break;

                        case 'interface':
                            isInterface = true;
                            break;

                        // no default
                    }

                    // check tag preferences
                    if (
                        Object.prototype.hasOwnProperty.call(prefer, tag.title)
                        && tag.title !== prefer[tag.title]
                    ) {
                        const entireTagRange = getAbsoluteRange(jsdocNode, tag);

                        context.report({
                            node: jsdocNode,
                            messageId: 'use',
                            loc: {
                                start: entireTagRange.start,
                                end: {
                                    line: entireTagRange.start.line,
                                    column:
                                        entireTagRange.start.column + `@${tag.title}`.length,
                                },
                            },
                            data: { name: prefer[tag.title] },
                            fix(fixer: Fixer) {
                                return fixer.replaceTextRange(
                                    [
                                        jsdocNode.range[0] + tag.range[0] + 3,
                                        jsdocNode.range[0]
                                            + tag.range[0]
                                            + tag.title.length
                                            + 3,
                                    ],
                                    prefer[tag.title]!,
                                );
                            },
                        });
                    }

                    // validate the types
                    if (checkPreferType && tag.type) {
                        validateType(jsdocNode, tag.type);
                    }
                });

                paramTags.forEach((param) => {
                    if (requireParamType && !param.type) {
                        context.report({
                            node: jsdocNode,
                            messageId: 'missingParamType',
                            loc: getAbsoluteRange(jsdocNode, param),
                            data: { name: param.name },
                        });
                    }
                    if (!param.description && requireParamDescription) {
                        context.report({
                            node: jsdocNode,
                            messageId: 'missingParamDesc',
                            loc: getAbsoluteRange(jsdocNode, param),
                            data: { name: param.name },
                        });
                    }
                    if (paramTagsByName[String(param.name)]) {
                        context.report({
                            node: jsdocNode,
                            messageId: 'duplicateParam',
                            loc: getAbsoluteRange(jsdocNode, param),
                            data: { name: param.name },
                        });
                    } else if (!param.name!.includes('.')) {
                        paramTagsByName[String(param.name)] = param;
                    }
                });

                if (hasReturns) {
                    if (
                        !requireReturn
                        && !functionData!.returnPresent
                        && (returnsTag!.type === null || !isValidReturnType(returnsTag!))
                        && !isAbstract
                    ) {
                        context.report({
                            node: jsdocNode,
                            messageId: 'unexpectedTag',
                            loc: getAbsoluteRange(jsdocNode, returnsTag!),
                            data: {
                                title: returnsTag!.title,
                            },
                        });
                    } else {
                        if (requireReturnType && !returnsTag!.type) {
                            context.report({ node: jsdocNode, messageId: 'missingReturnType' });
                        }

                        if (
                            !isValidReturnType(returnsTag!)
                            && !returnsTag!.description
                            && requireReturnDescription
                        ) {
                            context.report({ node: jsdocNode, messageId: 'missingReturnDesc' });
                        }
                    }
                }

                // check for functions missing @returns
                if (
                    !isOverride
                    && !hasReturns
                    && !hasConstructor
                    && !isInterface
                    && node.parent.kind !== 'get'
                    && node.parent.kind !== 'constructor'
                    && node.parent.kind !== 'set'
                    && !isTypeClass(node)
                ) {
                    if (requireReturn || (functionData!.returnPresent && !node.async)) {
                        context.report({
                            node: jsdocNode,
                            messageId: 'missingReturn',
                            data: {
                                returns: prefer.returns || 'returns',
                            },
                        });
                    }
                }

                // check the parameters
                const jsdocParamNames = Object.keys(paramTagsByName);

                if ('params' in node && node.params) {
                    node.params.forEach((param, paramsIndex) => {
                        const bindingParam = param.type === 'AssignmentPattern' ? param.left : param;

                        // TODO(nzakas): Figure out logical things to do with destructured, default, rest params
                        if (bindingParam.type === 'Identifier') {
                            const { name } = bindingParam;

                            if (
                                jsdocParamNames[paramsIndex]
                                && name !== jsdocParamNames[paramsIndex]
                            ) {
                                context.report({
                                    node: jsdocNode,
                                    messageId: 'expected',
                                    loc: getAbsoluteRange(
                                        jsdocNode,
                                        paramTagsByName[jsdocParamNames[paramsIndex]]!,
                                    ),
                                    data: {
                                        name,
                                        jsdocName: jsdocParamNames[paramsIndex],
                                    },
                                });
                            } else if (!paramTagsByName[name] && !isOverride) {
                                context.report({
                                    node: jsdocNode,
                                    messageId: 'missingParam',
                                    data: {
                                        name,
                                    },
                                });
                            }
                        }
                    });
                }

                if (options.matchDescription) {
                    const regex = new RegExp(options.matchDescription, 'u');

                    if (!regex.test(jsdoc.description)) {
                        context.report({ node: jsdocNode, messageId: 'unsatisfiedDesc' });
                    }
                }
            }
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            ArrowFunctionExpression: startFunction,
            FunctionExpression: startFunction,
            FunctionDeclaration: startFunction,
            ClassExpression: startFunction,
            ClassDeclaration: startFunction,
            'ArrowFunctionExpression:exit': checkJSDoc,
            'FunctionExpression:exit': checkJSDoc,
            'FunctionDeclaration:exit': checkJSDoc,
            'ClassExpression:exit': checkJSDoc,
            'ClassDeclaration:exit': checkJSDoc,
            ReturnStatement: addReturn,
        };
    },
};

export default rule;
