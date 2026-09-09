/**
 * @file A rule to control the use of single variable declarations.
 * @author Ian Christian Myers
 */
import dependency0 from './utils/ast-utils';
import type { Fixer, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Determines whether the given node is in a statement list.
 * @param node node to check
 * @returns `true` if the given node is in a statement list
 */
function isInStatementList(node: Node<'ExportNamedDeclaration' | 'VariableDeclaration'>) {
    return astUtils.STATEMENT_LIST_PARENTS.has(node.parent.type);
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        (
            | 'always'
            | 'never'
            | 'consecutive'
            | {
                separateRequires?: boolean;
                var?: 'always' | 'never' | 'consecutive';
                let?: 'always' | 'never' | 'consecutive';
                const?: 'always' | 'never' | 'consecutive';
            }
            | {
                initialized?: 'always' | 'never' | 'consecutive';
                uninitialized?: 'always' | 'never' | 'consecutive';
            }
        )?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description:
                'Enforce variables to be declared either together or separately in functions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/one-var',
        },

        fixable: 'code',

        schema: [
            {
                oneOf: [
                    {
                        enum: ['always', 'never', 'consecutive'],
                    },
                    {
                        type: 'object',
                        properties: {
                            separateRequires: {
                                type: 'boolean',
                            },
                            var: {
                                enum: ['always', 'never', 'consecutive'],
                            },
                            let: {
                                enum: ['always', 'never', 'consecutive'],
                            },
                            const: {
                                enum: ['always', 'never', 'consecutive'],
                            },
                        },
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            initialized: {
                                enum: ['always', 'never', 'consecutive'],
                            },
                            uninitialized: {
                                enum: ['always', 'never', 'consecutive'],
                            },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        ],

        messages: {
            combineUninitialized:
                "Combine this with the previous '{{type}}' statement with uninitialized variables.",
            combineInitialized:
                "Combine this with the previous '{{type}}' statement with initialized variables.",
            splitUninitialized:
                "Split uninitialized '{{type}}' declarations into multiple statements.",
            splitInitialized:
                "Split initialized '{{type}}' declarations into multiple statements.",
            splitRequires: 'Split requires to be separated into a single block.',
            combine: "Combine this with the previous '{{type}}' statement.",
            split: "Split '{{type}}' declarations into multiple statements.",
        },
    },

    create(context) {
        const MODE_ALWAYS = 'always';
        const MODE_NEVER = 'never';
        const MODE_CONSECUTIVE = 'consecutive';
        type Mode = 'always' | 'never' | 'consecutive';
        type DeclarationKind = 'var' | 'let' | 'const';
        interface ModeOptions {
            separateRequires?: boolean;
            var?: Mode;
            let?: Mode;
            const?: Mode;
            initialized?: Mode;
            uninitialized?: Mode;
        }
        interface ScopeFlags {
            initialized: boolean;
            uninitialized: boolean;
            required?: boolean;
        }
        const mode: Mode | ModeOptions = context.options[0] || MODE_ALWAYS;
        const options: Record<DeclarationKind, { initialized?: Mode; uninitialized?: Mode }> & {
            separateRequires?: boolean;
        } = { var: {}, let: {}, const: {} };

        if (typeof mode === 'string') {
            // simple options configuration with just a string
            options.var = { uninitialized: mode, initialized: mode };
            options.let = { uninitialized: mode, initialized: mode };
            options.const = { uninitialized: mode, initialized: mode };
        } else if (typeof mode === 'object') {
            // options configuration is an object
            options.separateRequires = !!mode.separateRequires;
            options.var = { uninitialized: mode.var, initialized: mode.var };
            options.let = { uninitialized: mode.let, initialized: mode.let };
            options.const = { uninitialized: mode.const, initialized: mode.const };
            if (Object.prototype.hasOwnProperty.call(mode, 'uninitialized')) {
                options.var.uninitialized = mode.uninitialized;
                options.let.uninitialized = mode.uninitialized;
                options.const.uninitialized = mode.uninitialized;
            }
            if (Object.prototype.hasOwnProperty.call(mode, 'initialized')) {
                options.var.initialized = mode.initialized;
                options.let.initialized = mode.initialized;
                options.const.initialized = mode.initialized;
            }
        }

        const { sourceCode } = context;

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        const functionStack: ScopeFlags[] = [];
        const blockStack: Record<'let' | 'const', ScopeFlags>[] = [];

        /**
         * Increments the blockStack counter.
         */
        function startBlock() {
            blockStack.push({
                let: { initialized: false, uninitialized: false },
                const: { initialized: false, uninitialized: false },
            });
        }

        /**
         * Increments the functionStack counter.
         */
        function startFunction() {
            functionStack.push({ initialized: false, uninitialized: false });
            startBlock();
        }

        /**
         * Decrements the blockStack counter.
         */
        function endBlock() {
            blockStack.pop();
        }

        /**
         * Decrements the functionStack counter.
         */
        function endFunction() {
            functionStack.pop();
            endBlock();
        }

        /**
         * Check if a variable declaration is a require.
         * @param decl variable declaration Node
         * @returns if decl is a require, return true; else return false.
         */
        function isRequire(decl: Node<'VariableDeclarator'>) {
            return (
                decl.init
                && decl.init.type === 'CallExpression'
                && decl.init.callee.name === 'require'
            );
        }

        /**
         * Records whether initialized/uninitialized/required variables are defined in current scope.
         * @param statementType node.kind, one of: "var", "let", or "const"
         * @param declarations List of declarations
         * @param currentScope The scope being investigated
         */
        function recordTypes(
            statementType: DeclarationKind,
            declarations: Node<'VariableDeclarator'>[],
            currentScope: ScopeFlags | undefined,
        ) {
            for (let i = 0; i < declarations.length; i += 1) {
                if (declarations![i]!.init === null) {
                    if (
                        options[statementType]
                        && options[statementType].uninitialized === MODE_ALWAYS
                    ) {
                        Object.assign(currentScope!, { uninitialized: true });
                    }
                } else if (
                    options[statementType]
                    && options[statementType].initialized === MODE_ALWAYS
                ) {
                    if (options.separateRequires && isRequire(declarations[i]!)) {
                        Object.assign(currentScope!, { required: true });
                    } else {
                        Object.assign(currentScope!, { initialized: true });
                    }
                }
            }
        }

        /**
         * Determines the current scope (function or block)
         * @param statementType node.kind, one of: "var", "let", or "const"
         * @returns The scope associated with statementType
         */
        function getCurrentScope(statementType: DeclarationKind) {
            let currentScope;

            if (statementType === 'var') {
                currentScope = functionStack[functionStack.length - 1];
            } else if (statementType === 'let') {
                currentScope = blockStack[blockStack.length - 1]!.let;
            } else if (statementType === 'const') {
                currentScope = blockStack[blockStack.length - 1]!.const;
            }
            return currentScope;
        }

        /**
         * Counts the number of initialized and uninitialized declarations in a list of declarations
         * @param declarations List of declarations
         * @returns Counts of 'uninitialized' and 'initialized' declarations
         */
        function countDeclarations(declarations: Node<'VariableDeclarator'>[]) {
            const counts = { uninitialized: 0, initialized: 0 };

            for (let i = 0; i < declarations.length; i += 1) {
                if (declarations![i]!.init === null) {
                    counts.uninitialized += 1;
                } else {
                    counts.initialized += 1;
                }
            }
            return counts;
        }

        /**
         * Determines if there is more than one var statement in the current scope.
         * @param statementType node.kind, one of: "var", "let", or "const"
         * @param declarations List of declarations
         * @returns Returns true if it is the first var declaration, false if not.
         */
        function hasOnlyOneStatement(
            statementType: DeclarationKind,
            declarations: Node<'VariableDeclarator'>[],
        ) {
            const declarationCounts = countDeclarations(declarations);
            const currentOptions = options[statementType] || {};
            const currentScope = getCurrentScope(statementType);
            const hasRequires = declarations.some(isRequire);

            if (
                currentOptions.uninitialized === MODE_ALWAYS
                && currentOptions.initialized === MODE_ALWAYS
            ) {
                if (currentScope!.uninitialized || currentScope!.initialized) {
                    if (!hasRequires) {
                        return false;
                    }
                }
            }

            if (declarationCounts.uninitialized > 0) {
                if (
                    currentOptions.uninitialized === MODE_ALWAYS
                    && currentScope!.uninitialized
                ) {
                    return false;
                }
            }
            if (declarationCounts.initialized > 0) {
                if (currentOptions.initialized === MODE_ALWAYS && currentScope!.initialized) {
                    if (!hasRequires) {
                        return false;
                    }
                }
            }
            if (currentScope!.required && hasRequires) {
                return false;
            }
            recordTypes(statementType, declarations, currentScope);
            return true;
        }

        /**
         * Fixer to join VariableDeclaration's into a single declaration
         * @param declarations The `VariableDeclaration` to join
         * @returns The fixer function
         */
        function joinDeclarations(declarations: Node<'VariableDeclarator'>[]) {
            const declaration = declarations[0];
            const holder = declaration!.parent.parent;
            const body: Node[] = 'body' in holder && Array.isArray(holder.body) ? holder.body : [];
            const currentIndex = body.findIndex(
                (node: Node) => node.range[0] === declaration!.parent.range[0],
            );
            const previousNode = body[currentIndex - 1];

            return (fixer: Fixer) => {
                const type = sourceCode.getTokenBefore(declaration!);
                const prevSemi = sourceCode.getTokenBefore(type!);
                const res: { range: [number, number]; text: string }[] = [];

                if (previousNode && previousNode.kind === sourceCode.getText(type!)) {
                    if (prevSemi!.value === ';') {
                        res.push(fixer.replaceText(prevSemi!, ','));
                    } else {
                        res.push(fixer.insertTextAfter(prevSemi!, ','));
                    }
                    res.push(fixer.replaceText(type!, ''));
                }

                return res;
            };
        }

        /**
         * Fixer to split a VariableDeclaration into individual declarations
         * @param declaration The `VariableDeclaration` to split
         * @returns The fixer function
         */
        function splitDeclarations(declaration: Node<'VariableDeclaration'>) {
            const { parent } = declaration;

            // don't autofix code such as: if (foo) var x, y;
            if (
                !isInStatementList(
                    parent.type === 'ExportNamedDeclaration' ? parent : declaration,
                )
            ) {
                return null;
            }

            return (fixer: Fixer) => declaration.declarations
                .map((declarator) => {
                    const tokenAfterDeclarator = sourceCode.getTokenAfter(declarator);

                    if (tokenAfterDeclarator === null) {
                        return null;
                    }

                    const afterComma = sourceCode.getTokenAfter(tokenAfterDeclarator, {
                        includeComments: true,
                    });

                    if (tokenAfterDeclarator.value !== ',') {
                        return null;
                    }

                    const exportPlacement = declaration.parent.type === 'ExportNamedDeclaration'
                        ? 'export '
                        : '';

                    /**
                     * `var x,y`
                     * tokenAfterDeclarator ^^ afterComma
                     */
                    if (afterComma!.range[0] === tokenAfterDeclarator.range[1]) {
                        return fixer.replaceText(
                            tokenAfterDeclarator,
                            `; ${exportPlacement}${declaration.kind} `,
                        );
                    }

                    /**
                     * `var x,
                     * tokenAfterDeclarator ^
                     *      y`
                     *      ^ afterComma
                     */
                    if (
                        afterComma!.loc.start.line > tokenAfterDeclarator.loc.end.line
                            || afterComma!.type === 'Line'
                            || afterComma!.type === 'Block'
                    ) {
                        let lastComment = afterComma;

                        while (
                            lastComment!.type === 'Line'
                                || lastComment!.type === 'Block'
                        ) {
                            lastComment = sourceCode.getTokenAfter(lastComment!, {
                                includeComments: true,
                            });
                        }

                        return fixer.replaceTextRange(
                            [tokenAfterDeclarator.range[0], lastComment!.range[0]],
                            `;${sourceCode.text.slice(tokenAfterDeclarator.range[1], lastComment!.range[0])}${exportPlacement}${declaration.kind} `,
                        );
                    }

                    return fixer.replaceText(
                        tokenAfterDeclarator,
                        `; ${exportPlacement}${declaration.kind}`,
                    );
                })
                .filter((x) => x !== null);
        }

        /**
         * Checks a given VariableDeclaration node for errors.
         * @param node The VariableDeclaration node to check
         */
        function checkVariableDeclaration(node: Node<'VariableDeclaration'>) {
            const { parent } = node;
            const type = node.kind;

            if (type !== 'var' && type !== 'let' && type !== 'const') {
                return;
            }

            const { declarations } = node;
            const declarationCounts = countDeclarations(declarations);
            const mixedRequires = declarations.some(isRequire) && !declarations.every(isRequire);

            if (options[type].initialized === MODE_ALWAYS) {
                if (options.separateRequires && mixedRequires) {
                    context.report({
                        node,
                        messageId: 'splitRequires',
                    });
                }
            }

            // consecutive
            const body: Node[] = 'body' in parent && Array.isArray(parent.body) ? parent.body : [];
            const nodeIndex = (body.length > 0 && body.indexOf(node)) || 0;

            if (nodeIndex > 0) {
                const previousNode = body[nodeIndex - 1]!;
                const isPreviousNodeDeclaration = previousNode.type === 'VariableDeclaration';
                const declarationsWithPrevious = declarations.concat(
                    'declarations' in previousNode ? previousNode.declarations : [],
                );

                if (
                    isPreviousNodeDeclaration
                    && previousNode.kind === type
                    && !(
                        declarationsWithPrevious.some(isRequire)
                        && !declarationsWithPrevious.every(isRequire)
                    )
                ) {
                    const previousDeclCounts = countDeclarations(previousNode.declarations);

                    if (
                        options[type].initialized === MODE_CONSECUTIVE
                        && options[type].uninitialized === MODE_CONSECUTIVE
                    ) {
                        context.report({
                            node,
                            messageId: 'combine',
                            data: {
                                type,
                            },
                            fix: joinDeclarations(declarations),
                        });
                    } else if (
                        options[type].initialized === MODE_CONSECUTIVE
                        && declarationCounts.initialized > 0
                        && previousDeclCounts.initialized > 0
                    ) {
                        context.report({
                            node,
                            messageId: 'combineInitialized',
                            data: {
                                type,
                            },
                            fix: joinDeclarations(declarations),
                        });
                    } else if (
                        options[type].uninitialized === MODE_CONSECUTIVE
                        && declarationCounts.uninitialized > 0
                        && previousDeclCounts.uninitialized > 0
                    ) {
                        context.report({
                            node,
                            messageId: 'combineUninitialized',
                            data: {
                                type,
                            },
                            fix: joinDeclarations(declarations),
                        });
                    }
                }
            }

            // always
            if (!hasOnlyOneStatement(type, declarations)) {
                if (
                    options[type].initialized === MODE_ALWAYS
                    && options[type].uninitialized === MODE_ALWAYS
                ) {
                    context.report({
                        node,
                        messageId: 'combine',
                        data: {
                            type,
                        },
                        fix: joinDeclarations(declarations),
                    });
                } else {
                    if (
                        options[type].initialized === MODE_ALWAYS
                        && declarationCounts.initialized > 0
                    ) {
                        context.report({
                            node,
                            messageId: 'combineInitialized',
                            data: {
                                type,
                            },
                            fix: joinDeclarations(declarations),
                        });
                    }
                    if (
                        options[type].uninitialized === MODE_ALWAYS
                        && declarationCounts.uninitialized > 0
                    ) {
                        if (
                            'left' in parent
                            && parent.left === node
                            && (node.parent.type === 'ForInStatement'
                                || node.parent.type === 'ForOfStatement')
                        ) {
                            return;
                        }
                        context.report({
                            node,
                            messageId: 'combineUninitialized',
                            data: {
                                type,
                            },
                            fix: joinDeclarations(declarations),
                        });
                    }
                }
            }

            // never
            if (parent.type !== 'ForStatement' || parent.init !== node) {
                const totalDeclarations = declarationCounts.uninitialized + declarationCounts.initialized;

                if (totalDeclarations > 1) {
                    if (
                        options[type].initialized === MODE_NEVER
                        && options[type].uninitialized === MODE_NEVER
                    ) {
                        // both initialized and uninitialized
                        context.report({
                            node,
                            messageId: 'split',
                            data: {
                                type,
                            },
                            fix: splitDeclarations(node),
                        });
                    } else if (
                        options[type].initialized === MODE_NEVER
                        && declarationCounts.initialized > 0
                    ) {
                        // initialized
                        context.report({
                            node,
                            messageId: 'splitInitialized',
                            data: {
                                type,
                            },
                            fix: splitDeclarations(node),
                        });
                    } else if (
                        options[type].uninitialized === MODE_NEVER
                        && declarationCounts.uninitialized > 0
                    ) {
                        // uninitialized
                        context.report({
                            node,
                            messageId: 'splitUninitialized',
                            data: {
                                type,
                            },
                            fix: splitDeclarations(node),
                        });
                    }
                }
            }
        }

        //--------------------------------------------------------------------------
        // Public API
        //--------------------------------------------------------------------------

        return {
            Program: startFunction,
            FunctionDeclaration: startFunction,
            FunctionExpression: startFunction,
            ArrowFunctionExpression: startFunction,
            StaticBlock: startFunction, // StaticBlock creates a new scope for `var` variables

            BlockStatement: startBlock,
            ForStatement: startBlock,
            ForInStatement: startBlock,
            ForOfStatement: startBlock,
            SwitchStatement: startBlock,
            VariableDeclaration: checkVariableDeclaration,
            'ForStatement:exit': endBlock,
            'ForOfStatement:exit': endBlock,
            'ForInStatement:exit': endBlock,
            'SwitchStatement:exit': endBlock,
            'BlockStatement:exit': endBlock,

            'Program:exit': endFunction,
            'FunctionDeclaration:exit': endFunction,
            'FunctionExpression:exit': endFunction,
            'ArrowFunctionExpression:exit': endFunction,
            'StaticBlock:exit': endFunction,
        };
    },
};

export default rule;
