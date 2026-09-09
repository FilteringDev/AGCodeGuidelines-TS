import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent missing React when using JSX
 * @author Glen Mailer
 */
import dependency0 from '../util/variable';
import dependency1 from '../util/pragma';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/report';

const variableUtil = dependency0;
const pragmaUtil = dependency1;
const docsUrl = dependency2;
const report = dependency3;

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

const messages = {
    notInScope: "'{{name}}' must be in scope when using JSX",
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow missing React when using JSX',
            category: 'Possible Errors',
            recommended: true,
            url: docsUrl('react-in-jsx-scope'),
        },

        messages,

        schema: [],
    },

    create(context) {
        const pragma = pragmaUtil.getFromContext(context);

        /**
         * @param node The node to inspect.
         */
        function checkIfReactIsInScope(node: Node) {
            if (variableUtil.getVariableFromContext(context, node, pragma)) {
                return;
            }
            report(context, messages.notInScope, 'notInScope', {
                node,
                data: {
                    name: pragma,
                },
            });
        }

        return {
            JSXOpeningElement: checkIfReactIsInScope,
            JSXOpeningFragment: checkIfReactIsInScope,
        };
    },
};

export default rule;
