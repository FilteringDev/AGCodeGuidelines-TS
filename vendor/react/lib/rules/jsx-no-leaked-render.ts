/**
 * @file Prevent problematic leaked values from being rendered
 * @author Mario Beltrán
 */
import { find as dependency0, from as dependency1 } from '../../compat/iterators';

import type {
    RuleContext, Fixer, LegacyRule, Node,
} from '../../types';
import dependency2 from '../util/eslint';
import dependency3 from '../util/docsUrl';
import dependency4 from '../util/report';
import dependency5 from '../util/variable';
import dependency6 from '../util/version';
import dependency7 from '../util/ast';

const find = dependency0;
const from = dependency1;

const { getText } = dependency2;
const docsUrl = dependency3;
const report = dependency4;
const variableUtil = dependency5;
const { testReactVersion } = dependency6;
const { isParenthesized } = dependency7;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const messages = {
    noPotentialLeakedRender:
        'Potential leaked value that might cause unintentionally rendered values or rendering crashes',
};

const COERCE_STRATEGY = 'coerce';
const TERNARY_STRATEGY = 'ternary';
const DEFAULT_VALID_STRATEGIES = [TERNARY_STRATEGY, COERCE_STRATEGY];
const COERCE_VALID_LEFT_SIDE_EXPRESSIONS = ['UnaryExpression', 'BinaryExpression', 'CallExpression'];
const TERNARY_INVALID_ALTERNATE_VALUES = [undefined, null, false];

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function trimLeftNode(node: Node) {
    // Remove double unary expression (boolean coercion), so we avoid trimming valid negations
    if (node.type === 'UnaryExpression' && node.argument.type === 'UnaryExpression') {
        return trimLeftNode(node.argument.argument);
    }

    return node;
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function getIsCoerceValidNestedLogicalExpression(node: Node): boolean {
    if (node.type === 'LogicalExpression') {
        return (
            getIsCoerceValidNestedLogicalExpression(node.left)
            && getIsCoerceValidNestedLogicalExpression(node.right)
        );
    }

    return COERCE_VALID_LEFT_SIDE_EXPRESSIONS.some((validExpression) => validExpression === node.type);
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function extractExpressionBetweenLogicalAnds(node: Node): Node[] {
    if (node.type !== 'LogicalExpression') {
        return [node];
    }
    if (node.operator !== '&&') {
        return [node];
    }
    return ([] as Node[]).concat(
        extractExpressionBetweenLogicalAnds(node.left),
        extractExpressionBetweenLogicalAnds(node.right),
    );
}

/**
 * @param context The rule context.
 * @param fixStrategy The fix strategy value.
 * @param fixer The source edit builder.
 * @param reportedNode The reported node value.
 * @param leftNode The left node value.
 * @param rightNode The right node value.
 * @returns The result of this check.
 */
function ruleFixer(
    context: RuleContext,
    fixStrategy: string | undefined,
    fixer: Fixer,
    reportedNode: Node,
    leftNode: Node,
    rightNode: Node,
) {
    const rightSideText = getText(context, rightNode);

    if (fixStrategy === COERCE_STRATEGY) {
        const expressions = extractExpressionBetweenLogicalAnds(leftNode);
        const newText = expressions
            .map((node: Node) => {
                let nodeText = getText(context, node);
                if (isParenthesized(context, node)) {
                    nodeText = `(${nodeText})`;
                }
                if (
                    node.parent
                    && node.parent.type === 'ConditionalExpression'
                    && node.parent.consequent.value === false
                ) {
                    return `${getIsCoerceValidNestedLogicalExpression(node) ? '' : '!'}${nodeText}`;
                }
                return `${getIsCoerceValidNestedLogicalExpression(node) ? '' : '!!'}${nodeText}`;
            })
            .join(' && ');

        if (
            rightNode.parent
            && rightNode.parent.type === 'ConditionalExpression'
            && rightNode.parent.consequent.value === false
        ) {
            const consequentVal = rightNode.parent.consequent.raw || rightNode.parent.consequent.name;
            const alternateVal = rightNode.parent.alternate.raw || rightNode.parent.alternate.name;
            if (rightNode.parent.test && rightNode.parent.test.type === 'LogicalExpression') {
                return fixer.replaceText(
                    reportedNode,
                    `${newText} ? ${consequentVal} : ${alternateVal}`,
                );
            }
            return fixer.replaceText(reportedNode, `${newText} && ${alternateVal}`);
        }

        if (rightNode.type === 'ConditionalExpression' || rightNode.type === 'LogicalExpression') {
            return fixer.replaceText(reportedNode, `${newText} && (${rightSideText})`);
        }
        if (rightNode.type === 'JSXElement') {
            const rightSideTextLines = rightSideText.split('\n');
            if (rightSideTextLines.length > 1) {
                const rightSideTextLastLine = rightSideTextLines[rightSideTextLines.length - 1];
                const indentSpacesStart = ' '.repeat(rightSideTextLastLine!.search(/\S/));
                const indentSpacesClose = ' '.repeat(rightSideTextLastLine!.search(/\S/) - 2);
                return fixer.replaceText(
                    reportedNode,
                    `${newText} && (\n${indentSpacesStart}${rightSideText}\n${indentSpacesClose})`,
                );
            }
        }
        if (rightNode.type === 'Literal') {
            return null;
        }
        return fixer.replaceText(reportedNode, `${newText} && ${rightSideText}`);
    }

    if (fixStrategy === TERNARY_STRATEGY) {
        let leftSideText = getText(context, trimLeftNode(leftNode));
        if (isParenthesized(context, leftNode)) {
            leftSideText = `(${leftSideText})`;
        }
        return fixer.replaceText(reportedNode, `${leftSideText} ? ${rightSideText} : null`);
    }

    throw new TypeError('Invalid value for "validStrategies" option');
}

const rule: LegacyRule<[{ validStrategies?: ('ternary' | 'coerce')[] }?]> = {
    meta: {
        docs: {
            description: 'Disallow problematic leaked values from being rendered',
            category: 'Possible Errors',
            recommended: false,
            url: docsUrl('jsx-no-leaked-render'),
        },

        messages,

        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    validStrategies: {
                        type: 'array',
                        items: {
                            enum: [TERNARY_STRATEGY, COERCE_STRATEGY],
                        },
                        uniqueItems: true,
                        default: DEFAULT_VALID_STRATEGIES,
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const config = context.options[0] || {};
        const validStrategies = new Set(config.validStrategies || DEFAULT_VALID_STRATEGIES);
        const fixStrategy = find(from(validStrategies), () => true);

        return {
            'JSXExpressionContainer > LogicalExpression[operator="&&"]':
                function onJSXExpressionContainerLogicalExpressionOperator(
                    node: Node<'LogicalExpression'>,
                ) {
                    const leftSide = node.left;

                    const isCoerceValidLeftSide = COERCE_VALID_LEFT_SIDE_EXPRESSIONS.some(
                        (validExpression) => validExpression === leftSide!.type,
                    );
                    if (validStrategies.has(COERCE_STRATEGY)) {
                        if (
                            isCoerceValidLeftSide
                            || getIsCoerceValidNestedLogicalExpression(leftSide!)
                        ) {
                            return;
                        }
                        const leftSideVar = variableUtil.getVariableFromContext(
                            context,
                            node,
                            leftSide!.name!,
                        );
                        if (leftSideVar) {
                            const leftSideValue = leftSideVar.defs
                                && leftSideVar.defs.length
                                && leftSideVar.defs[0]!.node.init
                                && leftSideVar.defs[0]!.node.init.value;
                            if (typeof leftSideValue === 'boolean') {
                                return;
                            }
                        }
                    }

                    if (
                        testReactVersion(context, '>= 18')
                        && leftSide!.type === 'Literal'
                        && leftSide!.value === ''
                    ) {
                        return;
                    }
                    report(context, messages.noPotentialLeakedRender, 'noPotentialLeakedRender', {
                        node,
                        fix(fixer: Fixer) {
                            return ruleFixer(context, fixStrategy, fixer, node, leftSide!, node.right!);
                        },
                    });
                },

            'JSXExpressionContainer > ConditionalExpression':
                function onJSXExpressionContainerConditionalExpression(
                    node: Node<'ConditionalExpression'>,
                ) {
                    if (validStrategies.has(TERNARY_STRATEGY)) {
                        return;
                    }

                    const isValidTernaryAlternate = TERNARY_INVALID_ALTERNATE_VALUES.indexOf(
                        node.alternate!.value as boolean | null | undefined,
                    ) === -1;
                    const isJSXElementAlternate = node.alternate!.type === 'JSXElement';
                    if (isValidTernaryAlternate || isJSXElementAlternate) {
                        return;
                    }

                    report(context, messages.noPotentialLeakedRender, 'noPotentialLeakedRender', {
                        node,
                        fix(fixer: Fixer) {
                            return ruleFixer(
                                context,
                                fixStrategy,
                                fixer,
                                node,
                                node.test!,
                                node.consequent!,
                            );
                        },
                    });
                },
        };
    },
};

export default rule;
