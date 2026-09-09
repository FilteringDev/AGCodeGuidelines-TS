import type {
    Variable, LegacyRule, Node, Scope,
} from '../../../types';
/**
 * @file Rule to flag when the same variable is declared more then once.
 * @author Ilya Volodin
 */
import dependency0 from './utils/ast-utils';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ builtinGlobals?: boolean }?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow variable redeclaration',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-redeclare',
        },

        messages: {
            redeclared: "'{{id}}' is already defined.",
            redeclaredAsBuiltin: "'{{id}}' is already defined as a built-in global variable.",
            redeclaredBySyntax: "'{{id}}' is already defined by a variable declaration.",
        },

        schema: [
            {
                type: 'object',
                properties: {
                    builtinGlobals: { type: 'boolean', default: true },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const options = {
            builtinGlobals: Boolean(
                context.options.length === 0 || context!.options[0]!.builtinGlobals,
            ),
        };
        const { sourceCode } = context;

        /**
         * Iterate declarations of a given variable.
         * @param variable The variable object to iterate declarations.
         * @yields The declarations.
         */
        function* iterateDeclarations(variable: Variable) {
            if (
                options.builtinGlobals
                && (variable.eslintImplicitGlobalSetting === 'readonly'
                    || variable.eslintImplicitGlobalSetting === 'writable')
            ) {
                yield { type: 'builtin' };
            }

            const declaredIdentifiers = variable.identifiers;
            for (let identifierIndex = 0; identifierIndex < declaredIdentifiers.length; identifierIndex += 1) {
                const id = declaredIdentifiers[identifierIndex]!;
                yield { type: 'syntax', node: id, loc: id.loc };
            }

            if (variable.eslintExplicitGlobalComments) {
                const globalComments = variable.eslintExplicitGlobalComments;
                for (let commentIndex = 0; commentIndex < globalComments.length; commentIndex += 1) {
                    const comment = globalComments[commentIndex]!;
                    yield {
                        type: 'comment',
                        node: comment,
                        loc: astUtils.getNameLocationInGlobalDirectiveComment(
                            sourceCode,
                            comment,
                            variable.name,
                        ),
                    };
                }
            }
        }

        /**
         * Find variables in a given scope and flag redeclared ones.
         * @param scope An eslint-scope scope object.
         */
        function findVariablesInScope(scope: Scope) {
            scope.variables.forEach((variable) => {
                const [declaration, ...extraDeclarations] = iterateDeclarations(variable);

                if (extraDeclarations.length === 0) {
                    return;
                }

                /**
                 * If the type of a declaration is different from the type of
                 * the first declaration, it shows the location of the first
                 * declaration.
                 */
                const detailMessageId = declaration!.type === 'builtin'
                    ? 'redeclaredAsBuiltin'
                    : 'redeclaredBySyntax';
                const data = { id: variable.name };

                // Report extra declarations.
                extraDeclarations.forEach(({ type, node, loc }) => {
                    const messageId = type === declaration!.type ? 'redeclared' : detailMessageId;

                    context.report({
                        node,
                        loc: loc!,
                        messageId,
                        data,
                    });
                });
            });
        }

        /**
         * Find variables in the current scope.
         * @param node The node of the current scope.
         */
        function checkForBlock(
            node: Node<
                | 'ArrowFunctionExpression'
                | 'BlockStatement'
                | 'ForInStatement'
                | 'ForOfStatement'
                | 'ForStatement'
                | 'FunctionDeclaration'
                | 'FunctionExpression'
                | 'StaticBlock'
                | 'SwitchStatement'
            >,
        ) {
            const scope = sourceCode.getScope(node);

            /**
             * In ES5, some node type such as `BlockStatement` doesn't have that scope.
             * `scope.block` is a different node in such a case.
             */
            if (scope.block === node) {
                findVariablesInScope(scope);
            }
        }

        return {
            Program(node: Node<'Program'>) {
                const scope = sourceCode.getScope(node);

                findVariablesInScope(scope);

                // Node.js or ES modules has a special scope.
                if (
                    scope.type === 'global'
                    && scope.childScopes[0]
                    // The special scope's block is the Program node.
                    && scope.block === scope.childScopes[0].block
                ) {
                    findVariablesInScope(scope.childScopes[0]);
                }
            },

            FunctionDeclaration: checkForBlock,
            FunctionExpression: checkForBlock,
            ArrowFunctionExpression: checkForBlock,

            StaticBlock: checkForBlock,

            BlockStatement: checkForBlock,
            ForStatement: checkForBlock,
            ForInStatement: checkForBlock,
            ForOfStatement: checkForBlock,
            SwitchStatement: checkForBlock,
        };
    },
};

export default rule;
