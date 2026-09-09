import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent usage of isMounted
 * @author Joe Lencioni
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/eslint';
import dependency2 from '../util/report';

const docsUrl = dependency0;
const { getAncestors } = dependency1;
const report = dependency2;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noIsMounted: 'Do not use isMounted',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow usage of isMounted',
            category: 'Best Practices',
            recommended: true,
            url: docsUrl('no-is-mounted'),
        },

        messages,

        schema: [],
    },

    create(context) {
        return {
            CallExpression(node: Node<'CallExpression'>) {
                const { callee } = node;
                if (callee.type !== 'MemberExpression') {
                    return;
                }
                if (
                    callee.object.type !== 'ThisExpression'
                    || !('name' in callee.property)
                    || callee.property.name !== 'isMounted'
                ) {
                    return;
                }
                const ancestors = getAncestors(context, node);
                for (let i = 0, j = ancestors.length; i < j; i += 1) {
                    if (ancestors[i]!.type === 'Property' || ancestors[i]!.type === 'MethodDefinition') {
                        report(context, messages.noIsMounted, 'noIsMounted', {
                            node: callee,
                        });
                        break;
                    }
                }
            },
        };
    },
};

export default rule;
