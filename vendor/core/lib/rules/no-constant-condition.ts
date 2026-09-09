/**
 * @file Rule to flag use constant conditions
 * @author Christian Schulz <http://rndm.de>
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

const { isConstant } = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ checkLoops?: boolean }?]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow constant expressions in conditions',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-constant-condition',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    checkLoops: {
                        type: 'boolean',
                        default: true,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            unexpected: 'Unexpected constant condition.',
        },
    },

    create(context) {
        const options = context.options[0] || {};
        const checkLoops = options.checkLoops !== false;
        const loopSetStack: Set<
            Node<'WhileStatement' | 'DoWhileStatement' | 'ForStatement'>
        >[] = [];
        const { sourceCode } = context;

        let loopsInCurrentScope: Set<
            Node<'WhileStatement' | 'DoWhileStatement' | 'ForStatement'>
        > = new Set();

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Tracks when the given node contains a constant condition.
         * @param node The AST node to check.
         */
        function trackConstantConditionLoop(
            node: Node<'DoWhileStatement' | 'ForStatement' | 'WhileStatement'>,
        ) {
            if (node.test && isConstant(sourceCode.getScope(node), node.test, true)) {
                loopsInCurrentScope.add(node);
            }
        }

        /**
         * Reports when the set contains the given constant condition node
         * @param node The AST node to check.
         */
        function checkConstantConditionLoopInSet(
            node: Node<'DoWhileStatement' | 'ForStatement' | 'WhileStatement'>,
        ) {
            if (loopsInCurrentScope.has(node)) {
                loopsInCurrentScope.delete(node);
                context.report({ node: node.test!, messageId: 'unexpected' });
            }
        }

        /**
         * Reports when the given node contains a constant condition.
         * @param node The AST node to check.
         */
        function reportIfConstant(node: Node<'ConditionalExpression' | 'IfStatement'>) {
            if (node.test && isConstant(sourceCode.getScope(node), node.test, true)) {
                context.report({ node: node.test, messageId: 'unexpected' });
            }
        }

        /**
         * Stores current set of constant loops in loopSetStack temporarily
         * and uses a new set to track constant loops
         */
        function enterFunction() {
            loopSetStack.push(loopsInCurrentScope);
            loopsInCurrentScope = new Set();
        }

        /**
         * Reports when the set still contains stored constant conditions
         */
        function exitFunction() {
            loopsInCurrentScope = loopSetStack.pop()!;
        }

        /**
         * Checks node when checkLoops option is enabled
         * @param node The AST node to check.
         */
        function checkLoop(node: Node<'DoWhileStatement' | 'ForStatement' | 'WhileStatement'>) {
            if (checkLoops) {
                trackConstantConditionLoop(node);
            }
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            ConditionalExpression: reportIfConstant,
            IfStatement: reportIfConstant,
            WhileStatement: checkLoop,
            'WhileStatement:exit': checkConstantConditionLoopInSet,
            DoWhileStatement: checkLoop,
            'DoWhileStatement:exit': checkConstantConditionLoopInSet,
            ForStatement: checkLoop,
            'ForStatement > .test': (node: Node) => checkLoop(node.parent as Node<'ForStatement'>),
            'ForStatement:exit': checkConstantConditionLoopInSet,
            FunctionDeclaration: enterFunction,
            'FunctionDeclaration:exit': exitFunction,
            FunctionExpression: enterFunction,
            'FunctionExpression:exit': exitFunction,
            YieldExpression: () => loopsInCurrentScope.clear(),
        };
    },
};

export default rule;
