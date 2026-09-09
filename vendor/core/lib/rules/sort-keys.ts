/**
 * @file Rule to require object keys to be sorted
 * @author Toru Nagashima
 */
import dependency1 from 'natural-compare';
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node, Token } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;
const naturalCompare = dependency1;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Gets the property name of the given `Property` node.
 *
 * - If the property's key is an `Identifier` node, this returns the key's name
 *   whether it's a computed property or not.
 * - If the property has a static name, this returns the static name.
 * - Otherwise, this returns null.
 * @param node The `Property` node to get.
 * @returns The property name or null.
 */
function getPropertyName(node: Node<'Property'>) {
    const staticName = astUtils.getStaticPropertyName(node);

    if (staticName !== null) {
        return staticName;
    }

    return node.key.name || null;
}

/**
 * Functions which check that the given 2 names are in specific order.
 *
 * Postfix `I` is meant insensitive.
 * Postfix `N` is meant natural.
 */
const isValidOrders = {
    asc(a: string, b: string) {
        return a <= b;
    },
    ascI(a: string, b: string) {
        return a.toLowerCase() <= b.toLowerCase();
    },
    ascN(a: string, b: string) {
        return naturalCompare(a, b) <= 0;
    },
    ascIN(a: string, b: string) {
        return naturalCompare(a.toLowerCase(), b.toLowerCase()) <= 0;
    },
    desc(a: string, b: string) {
        return isValidOrders.asc(b, a);
    },
    descI(a: string, b: string) {
        return isValidOrders.ascI(b, a);
    },
    descN(a: string, b: string) {
        return isValidOrders.ascN(b, a);
    },
    descIN(a: string, b: string) {
        return isValidOrders.ascIN(b, a);
    },
};

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        ('asc' | 'desc')?,
        {
            caseSensitive?: boolean;
            natural?: boolean;
            minKeys?: number;
            allowLineSeparatedGroups?: boolean;
        }?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Require object keys to be sorted',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/sort-keys',
        },

        schema: [
            {
                enum: ['asc', 'desc'],
            },
            {
                type: 'object',
                properties: {
                    caseSensitive: {
                        type: 'boolean',
                        default: true,
                    },
                    natural: {
                        type: 'boolean',
                        default: false,
                    },
                    minKeys: {
                        type: 'integer',
                        minimum: 2,
                        default: 2,
                    },
                    allowLineSeparatedGroups: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            sortKeys:
                "Expected object keys to be in {{natural}}{{insensitive}}{{order}}ending order. '{{thisName}}' should be before '{{prevName}}'.",
        },
    },

    create(context) {
        // Parse options.
        const order = context.options[0] || 'asc';
        const options = context.options[1];
        const insensitive = options && options.caseSensitive === false;
        const natural = options && options.natural;
        const minKeys = options && options.minKeys;
        const allowLineSeparatedGroups = (options && options.allowLineSeparatedGroups) || false;
        const isValidOrder = isValidOrders[
            `${order}${insensitive ? 'I' : ''}${natural ? 'N' : ''}` as keyof typeof isValidOrders
        ];

        // The stack to save the previous property's name for each object literals.
        interface StackState {
            prevName: null | string;
            prevNode: Node<'Property'> | null;
            prevBlankLine: boolean;
            upper: StackState | null;
            numKeys: number;
        }
        let stack: StackState | null = null;
        const { sourceCode } = context;

        return {
            ObjectExpression(node: Node<'ObjectExpression'>) {
                stack = {
                    upper: stack,
                    prevNode: null,
                    prevBlankLine: false,
                    prevName: null,
                    numKeys: node.properties.length,
                };
            },

            'ObjectExpression:exit': function onObjectExpressionExit() {
                stack = stack!.upper;
            },

            SpreadElement(node: Node<'SpreadElement'>) {
                if (node.parent.type === 'ObjectExpression') {
                    stack!.prevName = null;
                }
            },

            Property(node: Node<'Property'>) {
                if (node.parent.type === 'ObjectPattern') {
                    return;
                }

                const { prevName } = stack!;
                const { numKeys } = stack!;
                const thisName = getPropertyName(node);

                // Get tokens between current node and previous node
                const tokens = stack!.prevNode
                    && sourceCode.getTokensBetween(stack!.prevNode, node, {
                        includeComments: true,
                    });

                let isBlankLineBetweenNodes = stack!.prevBlankLine;

                if (tokens) {
                    // check blank line between tokens
                    tokens.forEach((token: Token, index) => {
                        const previousToken = tokens[index - 1];

                        if (
                            previousToken
                            && token.loc.start.line - previousToken.loc.end.line > 1
                        ) {
                            isBlankLineBetweenNodes = true;
                        }
                    });

                    // check blank line between the current node and the last token
                    if (
                        !isBlankLineBetweenNodes
                        && node.loc.start.line - tokens[tokens.length - 1]!.loc.end.line > 1
                    ) {
                        isBlankLineBetweenNodes = true;
                    }

                    // check blank line between the first token and the previous node
                    if (
                        !isBlankLineBetweenNodes
                        && tokens[0]!.loc.start.line - stack!.prevNode!.loc.end.line > 1
                    ) {
                        isBlankLineBetweenNodes = true;
                    }
                }

                stack!.prevNode = node;

                if (thisName !== null) {
                    stack!.prevName = thisName;
                }

                if (allowLineSeparatedGroups && isBlankLineBetweenNodes) {
                    stack!.prevBlankLine = thisName === null;
                    return;
                }

                if (prevName === null || thisName === null || numKeys < minKeys!) {
                    return;
                }

                if (!isValidOrder(prevName, thisName)) {
                    context.report({
                        node,
                        loc: node.key.loc,
                        messageId: 'sortKeys',
                        data: {
                            thisName,
                            prevName,
                            order,
                            insensitive: insensitive ? 'insensitive ' : '',
                            natural: natural ? 'natural ' : '',
                        },
                    });
                }
            },
        };
    },
};

export default rule;
