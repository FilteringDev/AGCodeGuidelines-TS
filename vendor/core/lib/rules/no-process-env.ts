/**
 * @file Disallow the use of process.env()
 * @author Vignesh Anand
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
            description: 'Disallow the use of `process.env`',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-process-env',
        },

        schema: [],

        messages: {
            unexpectedProcessEnv: 'Unexpected use of process.env.',
        },
    },

    create(context) {
        return {
            MemberExpression(node: Node<'MemberExpression'>) {
                const objectName = node.object.name;
                const propertyName = node.property.name;

                if (
                    objectName === 'process'
                    && !node.computed
                    && propertyName
                    && propertyName === 'env'
                ) {
                    context.report({ node, messageId: 'unexpectedProcessEnv' });
                }
            },
        };
    },
};

export default rule;
