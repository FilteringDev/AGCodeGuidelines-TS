import dependency0 from 'jsx-ast-utils/elementType.js';
import type { LegacyRule, Node } from '../../types';
/**
 * @file Enforce that namespaces are not used in React elements
 * @author Yacine Hmito
 */
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/isCreateElement';
import dependency3 from '../util/report';

const elementType = dependency0;
const docsUrl = dependency1;
const isCreateElement = dependency2;
const report = dependency3;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noNamespace: 'React component {{name}} must not be in a namespace, as React does not support them',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Enforce that namespaces are not used in React elements',
            category: 'Possible Errors',
            recommended: false,
            url: docsUrl('no-namespace'),
        },

        messages,

        schema: [],
    },

    create(context) {
        return {
            CallExpression(node: Node<'CallExpression'>) {
                if (
                    isCreateElement(context, node)
                    && node.arguments.length > 0
                    && node.arguments[0]!.type === 'Literal'
                ) {
                    const name = node.arguments[0]!.value;
                    if (typeof name !== 'string' || name.indexOf(':') === -1) {
                        return undefined;
                    }
                    report(context, messages.noNamespace, 'noNamespace', {
                        node,
                        data: {
                            name,
                        },
                    });
                }

                return undefined;
            },
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                const name = elementType(node);
                if (typeof name !== 'string' || name.indexOf(':') === -1) {
                    return undefined;
                }
                report(context, messages.noNamespace, 'noNamespace', {
                    node,
                    data: {
                        name,
                    },
                });

                return undefined;
            },
        };
    },
};

export default rule;
