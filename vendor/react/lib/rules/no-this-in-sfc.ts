/**
 * @file Report "this" being used in stateless functional components.
 */
import dependency0 from '../util/Components';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/report';
import type { LegacyRule, Node } from '../../types';

const Components = dependency0;
const docsUrl = dependency1;
const report = dependency2;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noThisInSFC: 'Stateless functional components should not use `this`',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow `this` from being used in stateless functional components',
            category: 'Possible Errors',
            recommended: false,
            url: docsUrl('no-this-in-sfc'),
        },

        messages,

        schema: [],
    },

    create: Components.detect((context, components, utils) => ({
        MemberExpression(node: Node<'MemberExpression'>) {
            if (node.object.type === 'ThisExpression') {
                const component = components.get(utils.getParentStatelessComponent(node));
                if (
                    !component
                    || (component.node
                        && component.node.parent
                        && component.node.parent.type === 'Property')
                ) {
                    return;
                }
                report(context, messages.noThisInSFC, 'noThisInSFC', {
                    node,
                });
            }
        },
    })),
};

export default rule;
