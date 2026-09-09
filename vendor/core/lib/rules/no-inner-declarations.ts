/**
 * @file Rule to enforce declarations in program or function body root.
 * @author Brandon Mills
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const validParent = new Set([
    'Program',
    'StaticBlock',
    'ExportNamedDeclaration',
    'ExportDefaultDeclaration',
]);
const validBlockStatementParent = new Set([
    'FunctionDeclaration',
    'FunctionExpression',
    'ArrowFunctionExpression',
]);

/**
 * Finds the nearest enclosing context where this rule allows declarations and returns its description.
 * @param node Node to search from.
 * @returns Description. One of "program", "function body", "class static block body".
 */
function getAllowedBodyDescription(node: Node<'FunctionDeclaration' | 'VariableDeclaration'>) {
    let { parent } = node;

    while (parent) {
        if (parent.type === 'StaticBlock') {
            return 'class static block body';
        }

        if (astUtils.isFunction(parent)) {
            return 'function body';
        }

        ({ parent } = parent);
    }

    return 'program';
}

const rule: LegacyRule<[('functions' | 'both')?]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow variable or `function` declarations in nested blocks',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-inner-declarations',
        },

        schema: [
            {
                enum: ['functions', 'both'],
            },
        ],

        messages: {
            moveDeclToRoot: 'Move {{type}} declaration to {{body}} root.',
        },
    },

    create(context) {
        /**
         * Ensure that a given node is at a program or function body's root.
         * @param node Declaration node to check.
         */
        function check(node: Node<'FunctionDeclaration' | 'VariableDeclaration'>) {
            const { parent } = node;

            if (
                parent.type === 'BlockStatement'
                && validBlockStatementParent.has(parent.parent.type)
            ) {
                return;
            }

            if (validParent.has(parent.type)) {
                return;
            }

            context.report({
                node,
                messageId: 'moveDeclToRoot',
                data: {
                    type: node.type === 'FunctionDeclaration' ? 'function' : 'variable',
                    body: getAllowedBodyDescription(node),
                },
            });
        }

        return {
            FunctionDeclaration: check,
            VariableDeclaration(node: Node<'VariableDeclaration'>) {
                if (context.options[0] === 'both' && node.kind === 'var') {
                    check(node);
                }
            },
        };
    },
};

export default rule;
