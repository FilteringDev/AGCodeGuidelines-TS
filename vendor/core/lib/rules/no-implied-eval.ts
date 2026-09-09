/**
 * @file Rule to flag use of implied eval via setTimeout and setInterval
 * @author James Allardice
 */
import dependency1 from '../../compat/eslint-utils';
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node, Variable } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;
const { getStaticValue } = dependency1;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow the use of `eval()`-like methods',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-implied-eval',
        },

        schema: [],

        messages: {
            impliedEval: 'Implied eval. Consider passing a function instead of a string.',
        },
    },

    create(context) {
        const GLOBAL_CANDIDATES = Object.freeze(['global', 'window', 'globalThis']);
        const EVAL_LIKE_FUNC_PATTERN = /^(?:set(?:Interval|Timeout)|execScript)$/u;
        const { sourceCode } = context;

        /**
         * Checks whether a node is evaluated as a string or not.
         * @param node A node to check.
         * @returns True if the node is evaluated as a string.
         */
        function isEvaluatedString(node: Node): boolean {
            if (
                (node.type === 'Literal' && typeof node.value === 'string')
                || node.type === 'TemplateLiteral'
            ) {
                return true;
            }
            if (node.type === 'BinaryExpression' && node.operator === '+') {
                return isEvaluatedString(node.left) || isEvaluatedString(node.right);
            }
            return false;
        }

        /**
         * Reports if the `CallExpression` node has evaluated argument.
         * @param node A CallExpression to check.
         */
        function reportImpliedEvalCallExpression(node: Node<'CallExpression'>) {
            const [firstArgument] = node.arguments;

            if (firstArgument) {
                const staticValue = getStaticValue(firstArgument, sourceCode.getScope(node));
                const isStaticString = staticValue && typeof staticValue.value === 'string';
                const isString = isStaticString || isEvaluatedString(firstArgument);

                if (isString) {
                    context.report({
                        node,
                        messageId: 'impliedEval',
                    });
                }
            }
        }

        /**
         * Reports calls of `implied eval` via the global references.
         * @param globalVar A global variable to check.
         */
        function reportImpliedEvalViaGlobal(globalVar: Variable) {
            const { references, name } = globalVar;

            references.forEach((ref) => {
                const { identifier } = ref;
                let node = identifier.parent;

                while (astUtils.isSpecificMemberAccess(node, null, name)) {
                    node = node.parent;
                }

                if (astUtils.isSpecificMemberAccess(node, null, EVAL_LIKE_FUNC_PATTERN)) {
                    const calleeNode = node.parent.type === 'ChainExpression' ? node.parent : node;
                    const { parent } = calleeNode;

                    if (parent.type === 'CallExpression' && parent.callee === calleeNode) {
                        reportImpliedEvalCallExpression(parent);
                    }
                }
            });
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            CallExpression(node: Node<'CallExpression'>) {
                if (astUtils.isSpecificId(node.callee, EVAL_LIKE_FUNC_PATTERN)) {
                    reportImpliedEvalCallExpression(node);
                }
            },
            'Program:exit': function onProgramExit(node: Node<'Program'>) {
                const globalScope = sourceCode.getScope(node);

                GLOBAL_CANDIDATES.map((candidate) => astUtils.getVariableByName(globalScope, candidate))
                    .filter(
                        (globalVar): globalVar is Variable => !!globalVar && globalVar.defs.length === 0,
                    )
                    .forEach(reportImpliedEvalViaGlobal);
            },
        };
    },
};

export default rule;
