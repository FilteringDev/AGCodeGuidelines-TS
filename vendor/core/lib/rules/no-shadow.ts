/**
 * @file Rule to flag on declaring variables already declared in the outer scope
 * @author Ilya Volodin
 */
import dependency0 from './utils/ast-utils';
import type {
    LegacyRule, Node, Scope, Variable,
} from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const FUNC_EXPR_NODE_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const CALL_EXPR_NODE_TYPE = new Set(['CallExpression']);
const FOR_IN_OF_TYPE = /^For(?:In|Of)Statement$/u;
const SENTINEL_TYPE = /^(?:(?:Function|Class)(?:Declaration|Expression)|ArrowFunctionExpression|CatchClause|ImportDeclaration|ExportNamedDeclaration)$/u;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        {
            builtinGlobals?: boolean;
            hoist?: 'all' | 'functions' | 'never';
            allow?: string[];
            ignoreOnInitialization?: boolean;
        }?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description:
                'Disallow variable declarations from shadowing variables declared in the outer scope',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-shadow',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    builtinGlobals: { type: 'boolean', default: false },
                    hoist: { enum: ['all', 'functions', 'never'], default: 'functions' },
                    allow: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    ignoreOnInitialization: { type: 'boolean', default: false },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            noShadow:
                "'{{name}}' is already declared in the upper scope on line {{shadowedLine}} column {{shadowedColumn}}.",
            noShadowGlobal: "'{{name}}' is already a global variable.",
        },
    },

    create(context) {
        const options = {
            builtinGlobals: context.options[0] && context.options[0].builtinGlobals,
            hoist: (context.options[0] && context.options[0].hoist) || 'functions',
            allow: (context.options[0] && context.options[0].allow) || [],
            ignoreOnInitialization:
                context.options[0] && context.options[0].ignoreOnInitialization,
        };
        const { sourceCode } = context;

        /**
         * Checks whether or not a given location is inside of the range of a given node.
         * @param node An node to check.
         * @param location A location to check.
         * @returns `true` if the location is inside of the range of the node.
         */
        function isInRange(node: Node, location: number) {
            return node && node.range[0] <= location && location <= node.range[1];
        }

        /**
         * Searches from the current node through its ancestry to find a matching node.
         * @param node a node to get.
         * @param match a callback that checks whether or not the node verifies its condition or not.
         * @returns the matching node.
         */
        function findSelfOrAncestor(node: Node, match: (Node: Node) => boolean) {
            let currentNode = node;

            while (currentNode && !match(currentNode)) {
                currentNode = currentNode.parent;
            }
            return currentNode;
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
         * Checks if a variable and a shadowedVariable have the same init pattern ancestor.
         * @param variable a variable to check.
         * @param shadowedVariable a shadowedVariable to check.
         * @returns Whether or not the variable and the shadowedVariable have the same init pattern ancestor.
         */
        function isInitPatternNode(variable: Variable, shadowedVariable: Variable) {
            const outerDef = shadowedVariable.defs[0];

            if (!outerDef) {
                return false;
            }

            const { variableScope } = variable.scope;

            if (
                !(
                    FUNC_EXPR_NODE_TYPES.has(variableScope.block.type)
                    && getOuterScope(variableScope) === shadowedVariable.scope
                )
            ) {
                return false;
            }

            const fun = variableScope.block;
            const { parent } = fun;

            const callExpression = findSelfOrAncestor(parent, (node) => CALL_EXPR_NODE_TYPE.has(node.type));

            if (!callExpression) {
                return false;
            }

            let node: Node = outerDef.name;
            const location = callExpression.range[1];

            while (node) {
                if (node.type === 'VariableDeclarator') {
                    if (isInRange(node.init!, location)) {
                        return true;
                    }
                    if (
                        FOR_IN_OF_TYPE.test(node.parent.parent.type)
                        && 'right' in node.parent.parent
                        && isInRange(node.parent.parent.right, location)
                    ) {
                        return true;
                    }
                    break;
                } else if (node.type === 'AssignmentPattern') {
                    if (isInRange(node.right, location)) {
                        return true;
                    }
                } else if (SENTINEL_TYPE.test(node.type)) {
                    break;
                }

                node = node.parent;
            }

            return false;
        }

        /**
         * Check if variable name is allowed.
         * @param variable The variable to check.
         * @returns Whether or not the variable name is allowed.
         */
        function isAllowed(variable: Variable) {
            return options.allow.includes(variable.name!);
        }

        /**
         * Checks if a variable of the class name in the class scope of ClassDeclaration.
         *
         * ClassDeclaration creates two variables of its name into its outer scope and its class scope.
         * So we should ignore the variable in the class scope.
         * @param variable The variable to check.
         * @returns Whether or not the variable of the class name in the class scope of ClassDeclaration.
         */
        function isDuplicatedClassNameVariable(variable: Variable) {
            const { block } = variable.scope;

            return block.type === 'ClassDeclaration' && block.id === variable.identifiers[0];
        }

        /**
         * Checks if a variable is inside the initializer of scopeVar.
         *
         * To avoid reporting at declarations such as `var a = function a() {};`.
         * But it should report `var a = function(a) {};` or `var a = function() { function a() {} };`.
         * @param variable The variable to check.
         * @param scopeVar The scope variable to look for.
         * @returns Whether or not the variable is inside initializer of scopeVar.
         */
        function isOnInitializer(variable: Variable, scopeVar: Variable) {
            const outerScope = scopeVar.scope;
            const outerDef = scopeVar.defs[0];
            const outer = outerDef && outerDef.parent && outerDef.parent.range;
            const innerScope = variable.scope;
            const innerDef = variable.defs[0];
            const inner = innerDef && innerDef.name.range;

            return (
                outer
                && inner
                && outer[0] < inner[0]
                && inner[1] < outer[1]
                && ((innerDef.type === 'FunctionName'
                    && innerDef.node.type === 'FunctionExpression')
                    || innerDef.node.type === 'ClassExpression')
                && outerScope === innerScope.upper
            );
        }

        /**
         * Get a range of a variable's identifier node.
         * @param variable The variable to get.
         * @returns The range of the variable's identifier node.
         */
        function getNameRange(variable: Variable) {
            const def = variable.defs[0];

            return def && def.name.range;
        }

        /**
         * Get declared line and column of a variable.
         * @param variable The variable to get.
         * @returns The declared line and column of the variable.
         */
        function getDeclaredLocation(variable: Variable) {
            const identifier = variable.identifiers[0];
            let obj;

            if (identifier) {
                obj = {
                    global: false,
                    line: identifier.loc.start.line,
                    column: identifier.loc.start.column + 1,
                };
            } else {
                obj = {
                    global: true,
                };
            }
            return obj;
        }

        /**
         * Checks if a variable is in TDZ of scopeVar.
         * @param variable The variable to check.
         * @param scopeVar The variable of TDZ.
         * @returns Whether or not the variable is in TDZ of scopeVar.
         */
        function isInTdz(variable: Variable, scopeVar: Variable) {
            const outerDef = scopeVar.defs[0];
            const inner = getNameRange(variable);
            const outer = getNameRange(scopeVar);

            return (
                inner
                && outer
                && inner[1] < outer[0]
                // Excepts FunctionDeclaration if is {"hoist":"function"}.
                && (options.hoist !== 'functions'
                    || !outerDef
                    || outerDef.node.type !== 'FunctionDeclaration')
            );
        }

        /**
         * Checks the current context for shadowed variables.
         * @param scope Fixme
         */
        function checkForShadows(scope: Scope) {
            const { variables } = scope;

            variables.forEach((variable) => {
                // Skips "arguments" or variables of a class name in the class scope of ClassDeclaration.
                if (
                    variable!.identifiers.length === 0
                    || isDuplicatedClassNameVariable(variable!)
                    || isAllowed(variable!)
                ) {
                    return;
                }

                // Gets shadowed variable.
                const shadowed = astUtils.getVariableByName(scope.upper, variable!.name);

                if (
                    shadowed
                    && (shadowed.identifiers.length > 0
                        || (options.builtinGlobals && 'writeable' in shadowed))
                    && !isOnInitializer(variable!, shadowed)
                    && !(
                        options.ignoreOnInitialization && isInitPatternNode(variable!, shadowed)
                    )
                    && !(options.hoist !== 'all' && isInTdz(variable!, shadowed))
                ) {
                    const location = getDeclaredLocation(shadowed);
                    const messageId = location.global ? 'noShadowGlobal' : 'noShadow';
                    const data: {
                        name: string;
                        shadowedLine?: number;
                        shadowedColumn?: number;
                    } = {
                        name: variable!.name,
                    };

                    if (!location.global) {
                        data.shadowedLine = location.line;
                        data.shadowedColumn = location.column;
                    }
                    context.report({
                        node: variable!.identifiers[0]!,
                        messageId,
                        data,
                    });
                }
            });
        }

        return {
            'Program:exit': function onProgramExit(node: Node<'Program'>) {
                const globalScope = sourceCode.getScope(node);
                const stack = globalScope.childScopes.slice();

                while (stack.length) {
                    const scope = stack.pop();

                    stack.push(...scope!.childScopes);
                    checkForShadows(scope!);
                }
            },
        };
    },
};

export default rule;
