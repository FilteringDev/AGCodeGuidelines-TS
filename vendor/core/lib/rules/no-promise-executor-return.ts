import type {
    SourceCode, Fixer, LegacyRule, Node, Scope, Token,
} from '../../../types';
/**
 * @file Rule to disallow returning values from Promise executor functions
 * @author Milos Djermanovic
 */
import dependency0 from '../../compat/eslint-utils';
import dependency1 from './utils/ast-utils';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const { findVariable } = dependency0;
const astUtils = dependency1;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const functionTypesToCheck = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

/**
 * Determines whether the given identifier node is a reference to a global variable.
 * @param node `Identifier` node to check.
 * @param scope Scope to which the node belongs.
 * @returns True if the identifier is a reference to a global variable.
 */
function isGlobalReference(node: Node<'Identifier'>, scope: Scope) {
    const variable = findVariable(scope, node);

    return variable !== null && variable.scope.type === 'global' && variable.defs.length === 0;
}

/**
 * Finds function's outer scope.
 * @param scope Function's own scope.
 * @returns Function's outer scope.
 */
function getOuterScope(scope: Scope) {
    const { upper } = scope;

    if (upper!.type === 'function-expression-name') {
        return upper!.upper;
    }
    return upper;
}

/**
 * Determines whether the given function node is used as a Promise executor.
 * @param node The node to check.
 * @param scope Function's own scope.
 * @returns `true` if the node is a Promise executor.
 */
function isPromiseExecutor(node: Node, scope: Scope) {
    const { parent } = node;

    return (
        parent.type === 'NewExpression'
        && parent.arguments[0] === node
        && parent.callee.type === 'Identifier'
        && parent.callee.name === 'Promise'
        && isGlobalReference(parent.callee, getOuterScope(scope)!)
    );
}

/**
 * Checks if the given node is a void expression.
 * @param node The node to check.
 * @returns - `true` if the node is a void expression
 */
function expressionIsVoid(node: Node) {
    return node.type === 'UnaryExpression' && node.operator === 'void';
}

/**
 * Fixes the linting error by prepending "void " to the given node
 * @param sourceCode context given by context.sourceCode
 * @param node The node to fix.
 * @param fixer The fixer object provided by ESLint.
 * @returns - An array of fix objects to apply to the node.
 */
function voidPrependFixer(sourceCode: SourceCode, node: Node, fixer: Fixer) {
    // prepending `void ` will fail if the node has a lower precedence than void
    const requiresParens = astUtils.getPrecedence(node)
            < astUtils.getPrecedence({ type: 'UnaryExpression', operator: 'void' })
        // check if there are parentheses around the node to avoid redundant parentheses
        && !astUtils.isParenthesised(sourceCode, node);

    // avoid parentheses issues
    const returnOrArrowToken = sourceCode.getTokenBefore(
        node,
        node.parent.type === 'ArrowFunctionExpression'
            ? astUtils.isArrowToken
            : (token: Token) => token.type === 'Keyword' && token.value === 'return',
    );

    const firstToken = sourceCode.getTokenAfter(returnOrArrowToken!);
    // is return token, as => allows void to be adjacent

    const prependSpace = returnOrArrowToken!.value === 'return'
        // If two tokens (return and "(") are adjacent
        && returnOrArrowToken!.range[1] === firstToken!.range[0];

    return [
        fixer.insertTextBefore(
            firstToken!,
            `${prependSpace ? ' ' : ''}void ${requiresParens ? '(' : ''}`,
        ),
        fixer.insertTextAfter(node, requiresParens ? ')' : ''),
    ];
}

/**
 * Fixes the linting error by `wrapping {}` around the given node's body.
 * @param sourceCode context given by context.sourceCode
 * @param node The node to fix.
 * @param fixer The fixer object provided by ESLint.
 * @returns - An array of fix objects to apply to the node.
 */
function curlyWrapFixer(
    sourceCode: SourceCode,
    node: Node<'ArrowFunctionExpression'>,
    fixer: Fixer,
) {
    // https://github.com/eslint/eslint/pull/17282#issuecomment-1592795923
    const arrowToken = sourceCode.getTokenBefore(node.body, astUtils.isArrowToken);
    const firstToken = sourceCode.getTokenAfter(arrowToken!);
    const lastToken = sourceCode.getLastToken(node);

    return [fixer.insertTextBefore(firstToken!, '{'), fixer.insertTextAfter(lastToken, '}')];
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ allowVoid?: boolean }?]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow returning values from Promise executor functions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-promise-executor-return',
        },

        hasSuggestions: true,

        schema: [
            {
                type: 'object',
                properties: {
                    allowVoid: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            returnsValue: 'Return values from promise executor functions cannot be read.',

            // arrow and function suggestions
            prependVoid: 'Prepend `void` to the expression.',

            // only arrow suggestions
            wrapBraces: 'Wrap the expression in `{}`.',
        },
    },

    create(context) {
        interface FuncInfoState {
            upper: FuncInfoState | null;
            shouldCheck: boolean;
        }
        let funcInfo: FuncInfoState | null = null;
        const { sourceCode } = context;
        const { allowVoid = false } = context.options[0] || {};

        return {
            onCodePathStart(_, node: Node) {
                funcInfo = {
                    upper: funcInfo,
                    shouldCheck:
                        functionTypesToCheck.has(node.type)
                        && isPromiseExecutor(node, sourceCode.getScope(node)),
                };

                if (
                    // Is a Promise executor
                    funcInfo.shouldCheck
                    && node.type === 'ArrowFunctionExpression'
                    && node.expression
                    // Except void
                    && !(allowVoid && expressionIsVoid(node.body))
                ) {
                    const suggest: {
                        messageId: string;
                        fix(fixer: Fixer): { range: [number, number]; text: string }[];
                    }[] = [];

                    // prevent useless refactors
                    if (allowVoid) {
                        suggest.push({
                            messageId: 'prependVoid',
                            fix(fixer: Fixer) {
                                return voidPrependFixer(sourceCode, node.body, fixer);
                            },
                        });
                    }

                    // Do not suggest wrapping an unnamed FunctionExpression in braces as that would be invalid
                    // syntax.
                    if (!(node.body.type === 'FunctionExpression' && !node.body.id)) {
                        suggest.push({
                            messageId: 'wrapBraces',
                            fix(fixer: Fixer) {
                                return curlyWrapFixer(sourceCode, node, fixer);
                            },
                        });
                    }

                    context.report({
                        node: node.body,
                        messageId: 'returnsValue',
                        suggest,
                    });
                }
            },

            onCodePathEnd() {
                funcInfo = funcInfo!.upper;
            },

            ReturnStatement(node: Node<'ReturnStatement'>) {
                if (!(funcInfo!.shouldCheck && node.argument)) {
                    return;
                }

                // node is `return <expression>`
                if (!allowVoid) {
                    context.report({ node, messageId: 'returnsValue' });
                    return;
                }

                if (expressionIsVoid(node.argument)) {
                    return;
                }

                // allowVoid && !expressionIsVoid
                context.report({
                    node,
                    messageId: 'returnsValue',
                    suggest: [
                        {
                            messageId: 'prependVoid',
                            fix(fixer: Fixer) {
                                return voidPrependFixer(sourceCode, node.argument!, fixer);
                            },
                        },
                    ],
                });
            },
        };
    },
};

export default rule;
