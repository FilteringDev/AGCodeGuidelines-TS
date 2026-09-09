/**
 * @file Disallow the use of process.exit()
 * @author Nicholas C. Zakas
 * @deprecated in ESLint v7.0.0
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        deprecated: true,

        replacedBy: [],

        type: 'suggestion',

        docs: {
            description: 'Disallow the use of `process.exit()`',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-process-exit',
        },

        schema: [],

        messages: {
            noProcessExit: "Don't use process.exit(); throw an error instead.",
        },
    },

    create(context) {
        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            "CallExpression > MemberExpression.callee[object.name = 'process'][property.name = 'exit']":
                function onCallExpressionMemberExpressionCalleeObjectNameProcessPropertyNameExit(
                    node: Node<'MemberExpression'>,
                ) {
                    context.report({ node: node.parent, messageId: 'noProcessExit' });
                },
        };
    },
};

export default rule;
