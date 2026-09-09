/**
 * @file Rule to disallow a duplicate case label.
 * @author Dieter Oberkofler
 * @author Burak Yigit Kaya
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

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow duplicate case labels',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-duplicate-case',
        },

        schema: [],

        messages: {
            unexpected: 'Duplicate case label.',
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * Determines whether the two given nodes are considered to be equal.
         * @param a First node.
         * @param b Second node.
         * @returns `true` if the nodes are considered to be equal.
         */
        function equal(a: Node, b: Node) {
            if (a.type !== b.type) {
                return false;
            }

            return astUtils.equalTokens(a, b, sourceCode);
        }
        return {
            SwitchStatement(node: Node<'SwitchStatement'>) {
                const previousTests: Node[] = [];

                node.cases.forEach((switchCase) => {
                    if (switchCase.test) {
                        const { test } = switchCase;

                        if (previousTests.some((previousTest) => equal(previousTest, test))) {
                            context.report({ node: switchCase, messageId: 'unexpected' });
                        } else {
                            previousTests.push(test);
                        }
                    }
                });
            },
        };
    },
};

export default rule;
