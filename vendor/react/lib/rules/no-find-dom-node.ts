import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent usage of findDOMNode
 * @author Yannick Croissant
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/report';

const docsUrl = dependency0;
const report = dependency1;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noFindDOMNode:
        'Do not use findDOMNode. It doesn’t work with function components and is deprecated in StrictMode. See https://reactjs.org/docs/react-dom.html#finddomnode',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow usage of findDOMNode',
            category: 'Best Practices',
            recommended: true,
            url: docsUrl('no-find-dom-node'),
        },

        messages,

        schema: [],
    },

    create(context) {
        return {
            CallExpression(node: Node<'CallExpression'>) {
                const { callee } = node;

                const isFindDOMNode = ('name' in callee && callee.name === 'findDOMNode')
                    || ('property' in callee
                        && callee.property
                        && 'name' in callee.property
                        && callee.property.name === 'findDOMNode');

                if (!isFindDOMNode) {
                    return;
                }

                report(context, messages.noFindDOMNode, 'noFindDOMNode', {
                    node: callee,
                });
            },
        };
    },
};

export default rule;
