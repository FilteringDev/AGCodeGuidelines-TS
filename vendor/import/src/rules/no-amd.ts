import type { LegacyRule, Node } from '../../types';
import { getScope } from '../../utils/contextCompat';
import docsUrl from '../docsUrl';

/**
 * @file Rule to prefer imports to AMD
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'suggestion',
        docs: {
            category: 'Module systems',
            description: 'Forbid AMD `require` and `define` calls.',
            url: docsUrl('no-amd'),
        },
        schema: [],
    },

    create(context) {
        return {
            CallExpression(node: Node<'CallExpression'>) {
                if (getScope(context, node).type !== 'module') {
                    return;
                }

                if (node.callee.type !== 'Identifier') {
                    return;
                }
                if (node.callee.name !== 'require' && node.callee.name !== 'define') {
                    return;
                }

                // todo: capture define((require, module, exports) => {}) form?
                if (node.arguments.length !== 2) {
                    return;
                }

                const modules = node.arguments[0];
                if (modules!.type !== 'ArrayExpression') {
                    return;
                }

                // todo: check second arg type? (identifier or callback)

                context.report(node, `Expected imports instead of AMD ${node.callee.name}().`);
            },
        };
    },
};
export default rule;
