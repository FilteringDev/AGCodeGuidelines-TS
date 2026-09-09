/**
 * @file Rule to enforce spacing before and after keywords.
 * @author Toru Nagashima
 * @deprecated in ESLint v8.53.0
 */
import dependency0 from './utils/ast-utils';
import dependency1 from './utils/keywords';
import type {
    Fixer, LegacyRule, Node, Token,
} from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;
const keywords = dependency1;

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const PREV_TOKEN = /^[)\]}>]$/u;
const NEXT_TOKEN = /^(?:[([{<~!]|\+\+?|--?)$/u;
const PREV_TOKEN_M = /^[)\]}>*]$/u;
const NEXT_TOKEN_M = /^[{*]$/u;
const TEMPLATE_OPEN_PAREN = /\$\{$/u;
const TEMPLATE_CLOSE_PAREN = /^\}/u;
const CHECK_TYPE = /^(?:JSXElement|RegularExpression|String|Template|PrivateIdentifier)$/u;
const KEYS = keywords.concat([
    'as',
    'async',
    'await',
    'from',
    'get',
    'let',
    'of',
    'set',
    'yield',
]);

// check duplications.
(function visitValue() {
    KEYS.sort();
    for (let i = 1; i < KEYS.length; i += 1) {
        if (KEYS[i] === KEYS[i - 1]) {
            throw new Error(`Duplication was found in the keyword list: ${KEYS[i]}`);
        }
    }
}());

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks whether or not a given token is a "Template" token ends with "${".
 * @param token A token to check.
 * @returns `true` if the token is a "Template" token ends with "${".
 */
function isOpenParenOfTemplate(token: Token) {
    return token.type === 'Template' && TEMPLATE_OPEN_PAREN.test(token.value);
}

/**
 * Checks whether or not a given token is a "Template" token starts with "}".
 * @param token A token to check.
 * @returns `true` if the token is a "Template" token starts with "}".
 */
function isCloseParenOfTemplate(token: Token) {
    return token.type === 'Template' && TEMPLATE_CLOSE_PAREN.test(token.value);
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        {
            before?: boolean;
            after?: boolean;
            overrides?: {
                abstract?: { before?: boolean; after?: boolean };
                as?: { before?: boolean; after?: boolean };
                async?: { before?: boolean; after?: boolean };
                await?: { before?: boolean; after?: boolean };
                boolean?: { before?: boolean; after?: boolean };
                break?: { before?: boolean; after?: boolean };
                byte?: { before?: boolean; after?: boolean };
                case?: { before?: boolean; after?: boolean };
                catch?: { before?: boolean; after?: boolean };
                char?: { before?: boolean; after?: boolean };
                class?: { before?: boolean; after?: boolean };
                const?: { before?: boolean; after?: boolean };
                continue?: { before?: boolean; after?: boolean };
                debugger?: { before?: boolean; after?: boolean };
                default?: { before?: boolean; after?: boolean };
                delete?: { before?: boolean; after?: boolean };
                do?: { before?: boolean; after?: boolean };
                double?: { before?: boolean; after?: boolean };
                else?: { before?: boolean; after?: boolean };
                enum?: { before?: boolean; after?: boolean };
                export?: { before?: boolean; after?: boolean };
                extends?: { before?: boolean; after?: boolean };
                false?: { before?: boolean; after?: boolean };
                final?: { before?: boolean; after?: boolean };
                finally?: { before?: boolean; after?: boolean };
                float?: { before?: boolean; after?: boolean };
                for?: { before?: boolean; after?: boolean };
                from?: { before?: boolean; after?: boolean };
                function?: { before?: boolean; after?: boolean };
                get?: { before?: boolean; after?: boolean };
                goto?: { before?: boolean; after?: boolean };
                if?: { before?: boolean; after?: boolean };
                implements?: { before?: boolean; after?: boolean };
                import?: { before?: boolean; after?: boolean };
                in?: { before?: boolean; after?: boolean };
                instanceof?: { before?: boolean; after?: boolean };
                int?: { before?: boolean; after?: boolean };
                interface?: { before?: boolean; after?: boolean };
                let?: { before?: boolean; after?: boolean };
                long?: { before?: boolean; after?: boolean };
                native?: { before?: boolean; after?: boolean };
                new?: { before?: boolean; after?: boolean };
                null?: { before?: boolean; after?: boolean };
                of?: { before?: boolean; after?: boolean };
                package?: { before?: boolean; after?: boolean };
                private?: { before?: boolean; after?: boolean };
                protected?: { before?: boolean; after?: boolean };
                public?: { before?: boolean; after?: boolean };
                return?: { before?: boolean; after?: boolean };
                set?: { before?: boolean; after?: boolean };
                short?: { before?: boolean; after?: boolean };
                static?: { before?: boolean; after?: boolean };
                super?: { before?: boolean; after?: boolean };
                switch?: { before?: boolean; after?: boolean };
                synchronized?: { before?: boolean; after?: boolean };
                this?: { before?: boolean; after?: boolean };
                throw?: { before?: boolean; after?: boolean };
                throws?: { before?: boolean; after?: boolean };
                transient?: { before?: boolean; after?: boolean };
                true?: { before?: boolean; after?: boolean };
                try?: { before?: boolean; after?: boolean };
                typeof?: { before?: boolean; after?: boolean };
                var?: { before?: boolean; after?: boolean };
                void?: { before?: boolean; after?: boolean };
                volatile?: { before?: boolean; after?: boolean };
                while?: { before?: boolean; after?: boolean };
                with?: { before?: boolean; after?: boolean };
                yield?: { before?: boolean; after?: boolean };
            };
        }?,
    ]
> = {
    meta: {
        deprecated: true,
        replacedBy: [],
        type: 'layout',

        docs: {
            description: 'Enforce consistent spacing before and after keywords',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/keyword-spacing',
        },

        fixable: 'whitespace',

        schema: [
            {
                type: 'object',
                properties: {
                    before: { type: 'boolean', default: true },
                    after: { type: 'boolean', default: true },
                    overrides: {
                        type: 'object',
                        properties: KEYS.reduce<
                            Record<
                                string,
                                Exclude<
                                    NonNullable<NonNullable<LegacyRule['meta']>['schema']>,
                                    boolean | unknown[]
                                >
                            >
                        >((retv, key) => {
                            Object.assign(retv, {
                                [key]: {
                                    type: 'object',
                                    properties: {
                                        before: { type: 'boolean' },
                                        after: { type: 'boolean' },
                                    },
                                    additionalProperties: false,
                                },
                            });
                            return retv;
                        }, {}),
                        additionalProperties: false,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            expectedBefore: 'Expected space(s) before "{{value}}".',
            expectedAfter: 'Expected space(s) after "{{value}}".',
            unexpectedBefore: 'Unexpected space(s) before "{{value}}".',
            unexpectedAfter: 'Unexpected space(s) after "{{value}}".',
        },
    },

    create(context) {
        const { sourceCode } = context;

        const tokensToIgnore = new WeakSet();

        /**
         * Reports a given token if there are not space(s) before the token.
         * @param token A token to report.
         * @param pattern A pattern of the previous token to check.
         */
        function expectSpaceBefore(token: Token, pattern: RegExp) {
            const prevToken = sourceCode.getTokenBefore(token);

            if (
                prevToken
                && (CHECK_TYPE.test(prevToken.type) || pattern.test(prevToken.value))
                && !isOpenParenOfTemplate(prevToken)
                && !tokensToIgnore.has(prevToken)
                && astUtils.isTokenOnSameLine(prevToken, token)
                && !sourceCode.isSpaceBetweenTokens(prevToken, token)
            ) {
                context.report({
                    loc: token.loc,
                    messageId: 'expectedBefore',
                    data: token,
                    fix(fixer: Fixer) {
                        return fixer.insertTextBefore(token, ' ');
                    },
                });
            }
        }

        /**
         * Reports a given token if there are space(s) before the token.
         * @param token A token to report.
         * @param pattern A pattern of the previous token to check.
         */
        function unexpectSpaceBefore(token: Token, pattern: RegExp) {
            const prevToken = sourceCode.getTokenBefore(token);

            if (
                prevToken
                && (CHECK_TYPE.test(prevToken.type) || pattern.test(prevToken.value))
                && !isOpenParenOfTemplate(prevToken)
                && !tokensToIgnore.has(prevToken)
                && astUtils.isTokenOnSameLine(prevToken, token)
                && sourceCode.isSpaceBetweenTokens(prevToken, token)
            ) {
                context.report({
                    loc: { start: prevToken.loc.end, end: token.loc.start },
                    messageId: 'unexpectedBefore',
                    data: token,
                    fix(fixer: Fixer) {
                        return fixer.removeRange([prevToken.range[1], token.range[0]]);
                    },
                });
            }
        }

        /**
         * Reports a given token if there are not space(s) after the token.
         * @param token A token to report.
         * @param pattern A pattern of the next token to check.
         */
        function expectSpaceAfter(token: Token, pattern: RegExp) {
            const nextToken = sourceCode.getTokenAfter(token);

            if (
                nextToken
                && (CHECK_TYPE.test(nextToken.type) || pattern.test(nextToken.value))
                && !isCloseParenOfTemplate(nextToken)
                && !tokensToIgnore.has(nextToken)
                && astUtils.isTokenOnSameLine(token, nextToken)
                && !sourceCode.isSpaceBetweenTokens(token, nextToken)
            ) {
                context.report({
                    loc: token.loc,
                    messageId: 'expectedAfter',
                    data: token,
                    fix(fixer: Fixer) {
                        return fixer.insertTextAfter(token, ' ');
                    },
                });
            }
        }

        /**
         * Reports a given token if there are space(s) after the token.
         * @param token A token to report.
         * @param pattern A pattern of the next token to check.
         */
        function unexpectSpaceAfter(token: Token, pattern: RegExp) {
            const nextToken = sourceCode.getTokenAfter(token);

            if (
                nextToken
                && (CHECK_TYPE.test(nextToken.type) || pattern.test(nextToken.value))
                && !isCloseParenOfTemplate(nextToken)
                && !tokensToIgnore.has(nextToken)
                && astUtils.isTokenOnSameLine(token, nextToken)
                && sourceCode.isSpaceBetweenTokens(token, nextToken)
            ) {
                context.report({
                    loc: { start: token.loc.end, end: nextToken.loc.start },
                    messageId: 'unexpectedAfter',
                    data: token,
                    fix(fixer: Fixer) {
                        return fixer.removeRange([token.range[1], nextToken.range[0]]);
                    },
                });
            }
        }

        /**
         * Parses the option object and determines check methods for each keyword.
         * @param options The option object to parse.
         * @returns - Normalized option object.
         *      Keys are keywords (there are for every keyword).
         *      Values are instances of `{"before": function, "after": function}`.
         */
        function parseOptions(
            options: NonNullable<Parameters<typeof rule.create>[0]['options'][0]> = {},
        ) {
            const before = options.before !== false;
            const after = options.after !== false;
            const defaultValue = {
                before: before ? expectSpaceBefore : unexpectSpaceBefore,
                after: after ? expectSpaceAfter : unexpectSpaceAfter,
            };
            const overrides = (options && options.overrides) || {};
            const retv: Record<
                string,
                {
                    before: (token: Token, pattern: RegExp) => void;
                    after: (token: Token, pattern: RegExp) => void;
                }
            > = Object.create(null);

            for (let i = 0; i < KEYS.length; i += 1) {
                const key = KEYS[i]!;
                const override = overrides[key as keyof typeof overrides];

                if (override) {
                    const thisBefore = 'before' in override ? override.before : before;
                    const thisAfter = 'after' in override ? override.after : after;

                    retv[key] = {
                        before: thisBefore ? expectSpaceBefore : unexpectSpaceBefore,
                        after: thisAfter ? expectSpaceAfter : unexpectSpaceAfter,
                    };
                } else {
                    retv[key] = defaultValue;
                }
            }

            return retv;
        }

        const checkMethodMap = parseOptions(context.options[0]);

        /**
         * Reports a given token if usage of spacing followed by the token is
         * invalid.
         * @param token A token to report.
         * @param [pattern] Optional. A pattern of the previous
         *      token to check.
         */
        function checkSpacingBefore(token: Token, pattern?: RegExp) {
            checkMethodMap[token.value]!.before(token, pattern || PREV_TOKEN);
        }

        /**
         * Reports a given token if usage of spacing preceded by the token is
         * invalid.
         * @param token A token to report.
         * @param [pattern] Optional. A pattern of the next
         *      token to check.
         */
        function checkSpacingAfter(token: Token, pattern?: RegExp) {
            checkMethodMap[token.value]!.after(token, pattern || NEXT_TOKEN);
        }

        /**
         * Reports a given token if usage of spacing around the token is invalid.
         * @param token A token to report.
         */
        function checkSpacingAround(token: Token) {
            checkSpacingBefore(token);
            checkSpacingAfter(token);
        }

        /**
         * Reports the first token of a given node if the first token is a keyword
         * and usage of spacing around the token is invalid.
         * @param node A node to report.
         */
        function checkSpacingAroundFirstToken(node: Node | null) {
            const firstToken = node && sourceCode.getFirstToken(node);

            if (firstToken && firstToken.type === 'Keyword') {
                checkSpacingAround(firstToken);
            }
        }

        /**
         * Reports the first token of a given node if the first token is a keyword
         * and usage of spacing followed by the token is invalid.
         *
         * This is used for unary operators (e.g. `typeof`), `function`, and `super`.
         * Other rules are handling usage of spacing preceded by those keywords.
         * @param node A node to report.
         */
        function checkSpacingBeforeFirstToken(node: Node | null) {
            const firstToken = node && sourceCode.getFirstToken(node);

            if (firstToken && firstToken.type === 'Keyword') {
                checkSpacingBefore(firstToken);
            }
        }

        /**
         * Reports the previous token of a given node if the token is a keyword and
         * usage of spacing around the token is invalid.
         * @param node A node to report.
         */
        function checkSpacingAroundTokenBefore(node: Node | null) {
            if (node) {
                const token = sourceCode.getTokenBefore(node, astUtils.isKeywordToken);

                checkSpacingAround(token!);
            }
        }

        /**
         * Reports `async` or `function` keywords of a given node if usage of
         * spacing around those keywords is invalid.
         * @param node A node to report.
         */
        function checkSpacingForFunction(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
        ) {
            const firstToken = node && sourceCode.getFirstToken(node);

            if (
                firstToken
                && ((firstToken.type === 'Keyword' && firstToken.value === 'function')
                    || firstToken.value === 'async')
            ) {
                checkSpacingBefore(firstToken);
            }
        }

        /**
         * Reports `class` and `extends` keywords of a given node if usage of
         * spacing around those keywords is invalid.
         * @param node A node to report.
         */
        function checkSpacingForClass(node: Node<'ClassDeclaration' | 'ClassExpression'>) {
            checkSpacingAroundFirstToken(node);
            checkSpacingAroundTokenBefore(node.superClass!);
        }

        /**
         * Reports `if` and `else` keywords of a given node if usage of spacing
         * around those keywords is invalid.
         * @param node A node to report.
         */
        function checkSpacingForIfStatement(node: Node<'IfStatement'>) {
            checkSpacingAroundFirstToken(node);
            checkSpacingAroundTokenBefore(node.alternate!);
        }

        /**
         * Reports `try`, `catch`, and `finally` keywords of a given node if usage
         * of spacing around those keywords is invalid.
         * @param node A node to report.
         */
        function checkSpacingForTryStatement(node: Node<'TryStatement'>) {
            checkSpacingAroundFirstToken(node);
            checkSpacingAroundFirstToken(node.handler!);
            checkSpacingAroundTokenBefore(node.finalizer!);
        }

        /**
         * Reports `do` and `while` keywords of a given node if usage of spacing
         * around those keywords is invalid.
         * @param node A node to report.
         */
        function checkSpacingForDoWhileStatement(node: Node<'DoWhileStatement'>) {
            checkSpacingAroundFirstToken(node);
            checkSpacingAroundTokenBefore(node.test);
        }

        /**
         * Reports `for` and `in` keywords of a given node if usage of spacing
         * around those keywords is invalid.
         * @param node A node to report.
         */
        function checkSpacingForForInStatement(node: Node<'ForInStatement'>) {
            checkSpacingAroundFirstToken(node);

            const inToken = sourceCode.getTokenBefore(
                node.right,
                astUtils.isNotOpeningParenToken,
            );
            const previousToken = sourceCode.getTokenBefore(inToken!);

            if (previousToken!.type !== 'PrivateIdentifier') {
                checkSpacingBefore(inToken!);
            }

            checkSpacingAfter(inToken!);
        }

        /**
         * Reports `for` and `of` keywords of a given node if usage of spacing
         * around those keywords is invalid.
         * @param node A node to report.
         */
        function checkSpacingForForOfStatement(node: Node<'ForOfStatement'>) {
            if (node.await) {
                checkSpacingBefore(sourceCode.getFirstToken(node, 0)!);
                checkSpacingAfter(sourceCode.getFirstToken(node, 1)!);
            } else {
                checkSpacingAroundFirstToken(node);
            }

            const ofToken = sourceCode.getTokenBefore(
                node.right,
                astUtils.isNotOpeningParenToken,
            );
            const previousToken = sourceCode.getTokenBefore(ofToken!);

            if (previousToken!.type !== 'PrivateIdentifier') {
                checkSpacingBefore(ofToken!);
            }

            checkSpacingAfter(ofToken!);
        }

        /**
         * Reports `import`, `export`, `as`, and `from` keywords of a given node if
         * usage of spacing around those keywords is invalid.
         *
         * This rule handles the `*` token in module declarations.
         *
         *     import*as A from "./a"; /*error Expected space(s) after "import".
         *                               error Expected space(s) before "as".
         * @param node A node to report.
         */
        function checkSpacingForModuleDeclaration(
            node: Node<
                | 'ExportAllDeclaration'
                | 'ExportDefaultDeclaration'
                | 'ExportNamedDeclaration'
                | 'ImportDeclaration'
            >,
        ) {
            const firstToken = sourceCode.getFirstToken(node);

            checkSpacingBefore(firstToken, PREV_TOKEN_M);
            checkSpacingAfter(firstToken, NEXT_TOKEN_M);

            if (node.type === 'ExportDefaultDeclaration') {
                checkSpacingAround(sourceCode.getTokenAfter(firstToken)!);
            }

            if (node.type === 'ExportAllDeclaration' && node.exported) {
                const asToken = sourceCode.getTokenBefore(node.exported);

                checkSpacingBefore(asToken!, PREV_TOKEN_M);
                checkSpacingAfter(asToken!, NEXT_TOKEN_M);
            }

            if ('source' in node && node.source) {
                const fromToken = sourceCode.getTokenBefore(node.source);

                checkSpacingBefore(fromToken!, PREV_TOKEN_M);
                checkSpacingAfter(fromToken!, NEXT_TOKEN_M);
            }
        }

        /**
         * Reports `as` keyword of a given node if usage of spacing around this
         * keyword is invalid.
         * @param node An `ImportSpecifier` node to check.
         */
        function checkSpacingForImportSpecifier(node: Node<'ImportSpecifier'>) {
            if (node.imported.range[0] !== node.local.range[0]) {
                const asToken = sourceCode.getTokenBefore(node.local);

                checkSpacingBefore(asToken!, PREV_TOKEN_M);
            }
        }

        /**
         * Reports `as` keyword of a given node if usage of spacing around this
         * keyword is invalid.
         * @param node An `ExportSpecifier` node to check.
         */
        function checkSpacingForExportSpecifier(node: Node<'ExportSpecifier'>) {
            if (node.local.range[0] !== node.exported.range[0]) {
                const asToken = sourceCode.getTokenBefore(node.exported);

                checkSpacingBefore(asToken!, PREV_TOKEN_M);
                checkSpacingAfter(asToken!, NEXT_TOKEN_M);
            }
        }

        /**
         * Reports `as` keyword of a given node if usage of spacing around this
         * keyword is invalid.
         * @param node A node to report.
         */
        function checkSpacingForImportNamespaceSpecifier(
            node: Node<'ImportNamespaceSpecifier'>,
        ) {
            const asToken = sourceCode.getFirstToken(node, 1);

            checkSpacingBefore(asToken!, PREV_TOKEN_M);
        }

        /**
         * Reports `static`, `get`, and `set` keywords of a given node if usage of
         * spacing around those keywords is invalid.
         * @param node A node to report.
         * @throws If unable to find token get, set, or async beside method name.
         */
        function checkSpacingForProperty(
            node: Node<'MethodDefinition' | 'Property' | 'PropertyDefinition'>,
        ) {
            if ('static' in node && node.static) {
                checkSpacingAroundFirstToken(node);
            }
            if (
                node.kind === 'get'
                || node.kind === 'set'
                || ((node.method || node.type === 'MethodDefinition') && node!.value!.async)
            ) {
                const token = sourceCode.getTokenBefore(node.key, (tok) => {
                    switch (tok.value) {
                        case 'get':
                        case 'set':
                        case 'async':
                            return true;
                        default:
                            return false;
                    }
                });

                if (!token) {
                    throw new Error(
                        'Failed to find token get, set, or async beside method name',
                    );
                }

                checkSpacingAround(token);
            }
        }

        /**
         * Reports `await` keyword of a given node if usage of spacing before
         * this keyword is invalid.
         * @param node A node to report.
         */
        function checkSpacingForAwaitExpression(node: Node<'AwaitExpression'>) {
            checkSpacingBefore(sourceCode.getFirstToken(node));
        }

        return {
            // Statements
            DebuggerStatement: checkSpacingAroundFirstToken,
            WithStatement: checkSpacingAroundFirstToken,

            // Statements - Control flow
            BreakStatement: checkSpacingAroundFirstToken,
            ContinueStatement: checkSpacingAroundFirstToken,
            ReturnStatement: checkSpacingAroundFirstToken,
            ThrowStatement: checkSpacingAroundFirstToken,
            TryStatement: checkSpacingForTryStatement,

            // Statements - Choice
            IfStatement: checkSpacingForIfStatement,
            SwitchStatement: checkSpacingAroundFirstToken,
            SwitchCase: checkSpacingAroundFirstToken,

            // Statements - Loops
            DoWhileStatement: checkSpacingForDoWhileStatement,
            ForInStatement: checkSpacingForForInStatement,
            ForOfStatement: checkSpacingForForOfStatement,
            ForStatement: checkSpacingAroundFirstToken,
            WhileStatement: checkSpacingAroundFirstToken,

            // Statements - Declarations
            ClassDeclaration: checkSpacingForClass,
            ExportNamedDeclaration: checkSpacingForModuleDeclaration,
            ExportDefaultDeclaration: checkSpacingForModuleDeclaration,
            ExportAllDeclaration: checkSpacingForModuleDeclaration,
            FunctionDeclaration: checkSpacingForFunction,
            ImportDeclaration: checkSpacingForModuleDeclaration,
            VariableDeclaration: checkSpacingAroundFirstToken,

            // Expressions
            ArrowFunctionExpression: checkSpacingForFunction,
            AwaitExpression: checkSpacingForAwaitExpression,
            ClassExpression: checkSpacingForClass,
            FunctionExpression: checkSpacingForFunction,
            NewExpression: checkSpacingBeforeFirstToken,
            Super: checkSpacingBeforeFirstToken,
            ThisExpression: checkSpacingBeforeFirstToken,
            UnaryExpression: checkSpacingBeforeFirstToken,
            YieldExpression: checkSpacingBeforeFirstToken,

            // Others
            ImportSpecifier: checkSpacingForImportSpecifier,
            ExportSpecifier: checkSpacingForExportSpecifier,
            ImportNamespaceSpecifier: checkSpacingForImportNamespaceSpecifier,
            MethodDefinition: checkSpacingForProperty,
            PropertyDefinition: checkSpacingForProperty,
            StaticBlock: checkSpacingAroundFirstToken,
            Property: checkSpacingForProperty,

            // To avoid conflicts with `space-infix-ops`, e.g. `a > this.b`
            "BinaryExpression[operator='>']": function onBinaryExpressionOperator(
                node: Node<'BinaryExpression'>,
            ) {
                const operatorToken = sourceCode.getTokenBefore(
                    node.right,
                    astUtils.isNotOpeningParenToken,
                );

                tokensToIgnore.add(operatorToken!);
            },
        };
    },
};

export default rule;
