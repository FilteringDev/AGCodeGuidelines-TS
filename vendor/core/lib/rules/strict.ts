import type { Fixer, LegacyRule, Node } from '../../../types';
/**
 * @file Rule to control usage of strict mode directives.
 * @author Brandon Mills
 */
import dependency0 from './utils/ast-utils';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Gets all of the Use Strict Directives in the Directive Prologue of a group of
 * statements.
 * @param statements Statements in the program or function body.
 * @returns All of the Use Strict Directives.
 */
function getUseStrictDirectives(statements: Node[]) {
    const directives = [];

    for (let i = 0; i < statements.length; i += 1) {
        const statement = statements[i]!;

        if (
            statement!.type === 'ExpressionStatement'
            && statement!.expression.type === 'Literal'
            && statement!.expression.value === 'use strict'
        ) {
            directives[i] = statement;
        } else {
            break;
        }
    }

    return directives;
}

/**
 * Checks whether a given parameter is a simple parameter.
 * @param node A pattern node to check.
 * @returns `true` if the node is an Identifier node.
 */
function isSimpleParameter(node: Node) {
    return node.type === 'Identifier';
}

/**
 * Checks whether a given parameter list is a simple parameter list.
 * @param params A parameter list to check.
 * @returns `true` if the every parameter is an Identifier node.
 */
function isSimpleParameterList(params: Node[]) {
    return params.every(isSimpleParameter);
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const legacyRule: LegacyRule<[('never' | 'global' | 'function' | 'safe')?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Require or disallow strict mode directives',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/strict',
        },

        schema: [
            {
                enum: ['never', 'global', 'function', 'safe'],
            },
        ],

        fixable: 'code',
        messages: {
            function: "Use the function form of 'use strict'.",
            global: "Use the global form of 'use strict'.",
            multiple: "Multiple 'use strict' directives.",
            never: 'Strict mode is not permitted.',
            unnecessary: "Unnecessary 'use strict' directive.",
            module: "'use strict' is unnecessary inside of modules.",
            implied: "'use strict' is unnecessary when implied strict mode is enabled.",
            unnecessaryInClasses: "'use strict' is unnecessary inside of classes.",
            nonSimpleParameterList:
                "'use strict' directive inside a function with non-simple parameter list throws a syntax error since ES2016.",
            wrap: "Wrap {{name}} in a function with 'use strict' directive.",
        },
    },

    create(context) {
        const ecmaFeatures = context.parserOptions.ecmaFeatures || {};
        const scopes: boolean[] = [];
        const classScopes: boolean[] = [];
        let mode: string = context.options[0] || 'safe';

        if (ecmaFeatures.impliedStrict) {
            mode = 'implied';
        } else if (mode === 'safe') {
            mode = ecmaFeatures.globalReturn || context.languageOptions.sourceType === 'commonjs'
                ? 'global'
                : 'function';
        }

        /**
         * Determines whether a reported error should be fixed, depending on the error type.
         * @param errorType The type of error
         * @returns `true` if the reported error should be fixed
         */
        function shouldFix(errorType: string) {
            return (
                errorType === 'multiple'
                || errorType === 'unnecessary'
                || errorType === 'module'
                || errorType === 'implied'
                || errorType === 'unnecessaryInClasses'
            );
        }

        /**
         * Gets a fixer function to remove a given 'use strict' directive.
         * @param node The directive that should be removed
         * @returns A fixer function
         */
        function getFixFunction(node: Node) {
            return (fixer: Fixer) => fixer.remove(node);
        }

        /**
         * Report a slice of an array of nodes with a given message.
         * @param nodes Nodes.
         * @param start Index to start from.
         * @param end Index to end before.
         * @param messageId Message to display.
         * @param fix `true` if the directive should be fixed (i.e. removed)
         */
        function reportSlice(
            nodes: Node[],
            start: number,
            end: number,
            messageId: string,
            fix: boolean,
        ) {
            nodes.slice(start, end).forEach((node) => {
                context.report({ node, messageId, fix: fix ? getFixFunction(node) : null });
            });
        }

        /**
         * Report all nodes in an array with a given message.
         * @param nodes Nodes.
         * @param messageId Message id to display.
         * @param fix `true` if the directive should be fixed (i.e. removed)
         */
        function reportAll(nodes: Node[], messageId: string, fix: boolean) {
            reportSlice(nodes, 0, nodes.length, messageId, fix);
        }

        /**
         * Report all nodes in an array, except the first, with a given message.
         * @param nodes Nodes.
         * @param messageId Message id to display.
         * @param fix `true` if the directive should be fixed (i.e. removed)
         */
        function reportAllExceptFirst(nodes: Node[], messageId: string, fix: boolean) {
            reportSlice(nodes, 1, nodes.length, messageId, fix);
        }

        /**
         * Entering a function in 'function' mode pushes a new nested scope onto the
         * stack. The new scope is true if the nested function is strict mode code.
         * @param node The function declaration or expression.
         * @param useStrictDirectives The Use Strict Directives of the node.
         */
        function enterFunctionInFunctionMode(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
            useStrictDirectives: Node[],
        ) {
            const isInClass = classScopes.length > 0;
            const isParentGlobal = scopes.length === 0 && classScopes.length === 0;
            const isParentStrict = scopes.length > 0 && scopes[scopes.length - 1]!;
            const isStrict = useStrictDirectives.length > 0;

            if (isStrict) {
                if (!isSimpleParameterList(node.params)) {
                    context.report({
                        node: useStrictDirectives[0]!,
                        messageId: 'nonSimpleParameterList',
                    });
                } else if (isParentStrict) {
                    context.report({
                        node: useStrictDirectives[0]!,
                        messageId: 'unnecessary',
                        fix: getFixFunction(useStrictDirectives[0]!),
                    });
                } else if (isInClass) {
                    context.report({
                        node: useStrictDirectives[0]!,
                        messageId: 'unnecessaryInClasses',
                        fix: getFixFunction(useStrictDirectives[0]!),
                    });
                }

                reportAllExceptFirst(useStrictDirectives, 'multiple', true);
            } else if (isParentGlobal) {
                if (isSimpleParameterList(node.params)) {
                    context.report({ node, messageId: 'function' });
                } else {
                    context.report({
                        node,
                        messageId: 'wrap',
                        data: { name: astUtils.getFunctionNameWithKind(node) },
                    });
                }
            }

            scopes.push(isParentStrict || isStrict);
        }

        /**
         * Exiting a function in 'function' mode pops its scope off the stack.
         */
        function exitFunctionInFunctionMode() {
            scopes.pop();
        }

        /**
         * Enter a function and either:
         * - Push a new nested scope onto the stack (in 'function' mode).
         * - Report all the Use Strict Directives (in the other modes).
         * @param node The function declaration or expression.
         */
        function enterFunction(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
        ) {
            const useStrictDirectives = node.body.type === 'BlockStatement'
                ? getUseStrictDirectives(node.body.body)
                : [];

            if (mode === 'function') {
                enterFunctionInFunctionMode(node, useStrictDirectives);
            } else if (useStrictDirectives.length > 0) {
                if (isSimpleParameterList(node.params)) {
                    reportAll(useStrictDirectives, mode, shouldFix(mode));
                } else {
                    context.report({
                        node: useStrictDirectives[0]!,
                        messageId: 'nonSimpleParameterList',
                    });
                    reportAllExceptFirst(useStrictDirectives, 'multiple', true);
                }
            }
        }

        const rule = {
            Program(node: Node<'Program'>) {
                const useStrictDirectives = getUseStrictDirectives(node.body);

                if (node.sourceType === 'module') {
                    mode = 'module';
                }

                if (mode === 'global') {
                    if (node.body.length > 0 && useStrictDirectives.length === 0) {
                        context.report({ node, messageId: 'global' });
                    }
                    reportAllExceptFirst(useStrictDirectives, 'multiple', true);
                } else {
                    reportAll(useStrictDirectives, mode, shouldFix(mode));
                }
            },
            FunctionDeclaration: enterFunction,
            FunctionExpression: enterFunction,
            ArrowFunctionExpression: enterFunction,
        };

        if (mode === 'function') {
            Object.assign(rule, {
                // Inside of class bodies are always strict mode.
                ClassBody() {
                    classScopes.push(true);
                },
                'ClassBody:exit': function onClassBodyExit() {
                    classScopes.pop();
                },

                'FunctionDeclaration:exit': exitFunctionInFunctionMode,
                'FunctionExpression:exit': exitFunctionInFunctionMode,
                'ArrowFunctionExpression:exit': exitFunctionInFunctionMode,
            });
        }

        return rule;
    },
};

export default legacyRule;
