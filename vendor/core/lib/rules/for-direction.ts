/**
 * @file enforce "for" loop update clause moving the counter in the right direction.(for-direction)
 * @author Aladdin-ADD<hh_2013@foxmail.com>
 */
import dependency0 from '../../compat/eslint-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const { getStaticValue } = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description:
                'Enforce "for" loop update clause moving the counter in the right direction',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/for-direction',
        },

        fixable: null,
        schema: [],

        messages: {
            incorrectDirection:
                'The update clause in this loop moves the variable in the wrong direction.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * report an error.
         * @param node the node to report.
         */
        function report(node: Node<'ForStatement'>) {
            context.report({
                node,
                messageId: 'incorrectDirection',
            });
        }

        /**
         * check the right side of the assignment
         * @param update UpdateExpression to check
         * @param dir expected direction that could either be turned around or invalidated
         * @returns return dir, the negated dir, or zero if the counter does not change or the direction is not
         * clear
         */
        function getRightDirection(update: Node<'AssignmentExpression'>, dir: number) {
            const staticValue = getStaticValue(update.right, sourceCode.getScope(update));

            if (
                staticValue
                && ['bigint', 'boolean', 'number'].includes(typeof staticValue.value)
            ) {
                const sign = Math.sign(Number(staticValue.value)) || 0; // convert NaN to 0

                return dir * sign;
            }
            return 0;
        }

        /**
         * check UpdateExpression add/sub the counter
         * @param update UpdateExpression to check
         * @param counter variable name to check
         * @returns if add return 1, if sub return -1, if nochange, return 0
         */
        function getUpdateDirection(update: Node<'UpdateExpression'>, counter: string) {
            if (update.argument.type === 'Identifier' && update.argument.name === counter) {
                if (update.operator === '++') {
                    return 1;
                }
                if (update.operator === '--') {
                    return -1;
                }
            }
            return 0;
        }

        /**
         * check AssignmentExpression add/sub the counter
         * @param update AssignmentExpression to check
         * @param counter variable name to check
         * @returns if add return 1, if sub return -1, if nochange, return 0
         */
        function getAssignmentDirection(update: Node<'AssignmentExpression'>, counter: string) {
            if (update.left.name === counter) {
                if (update.operator === '+=') {
                    return getRightDirection(update, 1);
                }
                if (update.operator === '-=') {
                    return getRightDirection(update, -1);
                }
            }
            return 0;
        }

        return {
            ForStatement(node: Node<'ForStatement'>) {
                if (node.test && node.test.type === 'BinaryExpression' && node.update) {
                    const counterPositions = ['left', 'right'] as const;
                    for (let positionIndex = 0; positionIndex < counterPositions.length; positionIndex += 1) {
                        const counterPosition = counterPositions[positionIndex]!;
                        if (!(node.test[counterPosition].type !== 'Identifier')) {
                            const counter = node.test[counterPosition].name;
                            const { operator } = node.test;
                            const { update } = node;

                            let wrongDirection;

                            if (operator === '<' || operator === '<=') {
                                wrongDirection = counterPosition === 'left' ? -1 : 1;
                            } else if (operator === '>' || operator === '>=') {
                                wrongDirection = counterPosition === 'left' ? 1 : -1;
                            } else {
                                return;
                            }

                            if (update.type === 'UpdateExpression') {
                                if (getUpdateDirection(update, counter) === wrongDirection) {
                                    report(node);
                                }
                            } else if (
                                update.type === 'AssignmentExpression'
                                && getAssignmentDirection(update, counter) === wrongDirection
                            ) {
                                report(node);
                            }
                        }
                    }
                }
            },
        };
    },
};

export default rule;
