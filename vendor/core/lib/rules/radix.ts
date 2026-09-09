/**
 * @file Rule to flag use of parseInt without a radix argument
 * @author James Allardice
 */
import dependency0 from './utils/ast-utils';
import type {
    Fixer, LegacyRule, Node, Reference, Variable,
} from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const MODE_ALWAYS = 'always';
const MODE_AS_NEEDED = 'as-needed';

const validRadixValues = new Set(Array.from({ length: 37 - 2 }, (_, index) => index + 2));

/**
 * Checks whether a given variable is shadowed or not.
 * @param variable A variable to check.
 * @returns `true` if the variable is shadowed.
 */
function isShadowed(variable: Variable) {
    return variable.defs.length >= 1;
}

/**
 * Checks whether a given node is a MemberExpression of `parseInt` method or not.
 * @param node A node to check.
 * @returns `true` if the node is a MemberExpression of `parseInt`
 *      method.
 */
function isParseIntMethod(node: Node) {
    return (
        node.type === 'MemberExpression'
        && !node.computed
        && node.property.type === 'Identifier'
        && node.property.name === 'parseInt'
    );
}

/**
 * Checks whether a given node is a valid value of radix or not.
 *
 * The following values are invalid.
 *
 * - A literal except integers between 2 and 36.
 * - undefined.
 * @param radix A node of radix to check.
 * @returns `true` if the node is valid.
 */
function isValidRadix(radix: Node) {
    return !(
        (radix.type === 'Literal'
            && (typeof radix.value !== 'number' || !validRadixValues.has(radix.value)))
        || (radix.type === 'Identifier' && radix.name === 'undefined')
    );
}

/**
 * Checks whether a given node is a default value of radix or not.
 * @param radix A node of radix to check.
 * @returns `true` if the node is the literal node of `10`.
 */
function isDefaultRadix(radix: Node) {
    return radix.type === 'Literal' && radix.value === 10;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[('always' | 'as-needed')?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description:
                'Enforce the consistent use of the radix argument when using `parseInt()`',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/radix',
        },

        hasSuggestions: true,

        schema: [
            {
                enum: ['always', 'as-needed'],
            },
        ],

        messages: {
            missingParameters: 'Missing parameters.',
            redundantRadix: 'Redundant radix parameter.',
            missingRadix: 'Missing radix parameter.',
            invalidRadix: 'Invalid radix parameter, must be an integer between 2 and 36.',
            addRadixParameter10: 'Add radix parameter `10` for parsing decimal numbers.',
        },
    },

    create(context) {
        const mode = context.options[0] || MODE_ALWAYS;
        const { sourceCode } = context;

        /**
         * Checks the arguments of a given CallExpression node and reports it if it
         * offends this rule.
         * @param node A CallExpression node to check.
         */
        function checkArguments(node: Node<'CallExpression'>) {
            const args = node.arguments;

            switch (args.length) {
                case 0:
                    context.report({
                        node,
                        messageId: 'missingParameters',
                    });
                    break;

                case 1:
                    if (mode === MODE_ALWAYS) {
                        context.report({
                            node,
                            messageId: 'missingRadix',
                            suggest: [
                                {
                                    messageId: 'addRadixParameter10',
                                    fix(fixer: Fixer) {
                                        const tokens = sourceCode.getTokens(node);
                                        const lastToken = tokens[tokens.length - 1]; // Parenthesis.
                                        // May or may not be a comma.
                                        const secondToLastToken = tokens[tokens.length - 2];
                                        const hasTrailingComma = secondToLastToken!.type === 'Punctuator'
                                            && secondToLastToken!.value === ',';

                                        return fixer.insertTextBefore(
                                            lastToken!,
                                            hasTrailingComma ? ' 10,' : ', 10',
                                        );
                                    },
                                },
                            ],
                        });
                    }
                    break;

                default:
                    if (mode === MODE_AS_NEEDED && isDefaultRadix(args[1]!)) {
                        context.report({
                            node,
                            messageId: 'redundantRadix',
                        });
                    } else if (!isValidRadix(args[1]!)) {
                        context.report({
                            node,
                            messageId: 'invalidRadix',
                        });
                    }
                    break;
            }
        }

        return {
            'Program:exit': function onProgramExit(node: Node<'Program'>) {
                const scope = sourceCode.getScope(node);
                let variable;

                // Check `parseInt()`
                variable = astUtils.getVariableByName(scope, 'parseInt');
                if (variable && !isShadowed(variable)) {
                    variable.references.forEach((reference: Reference) => {
                        const idNode = reference.identifier;

                        if (astUtils.isCallee(idNode)) {
                            checkArguments(idNode.parent);
                        }
                    });
                }

                // Check `Number.parseInt()`
                variable = astUtils.getVariableByName(scope, 'Number');
                if (variable && !isShadowed(variable)) {
                    variable.references.forEach((reference: Reference) => {
                        const parentNode = reference.identifier.parent;
                        const maybeCallee = parentNode.parent.type === 'ChainExpression'
                            ? parentNode.parent
                            : parentNode;

                        if (isParseIntMethod(parentNode) && astUtils.isCallee(maybeCallee)) {
                            checkArguments(maybeCallee.parent);
                        }
                    });
                }
            },
        };
    },
};

export default rule;
