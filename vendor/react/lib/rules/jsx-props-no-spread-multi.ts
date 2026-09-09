import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent JSX prop spreading the same expression multiple times
 * @author Simon Schick
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/report';

const docsUrl = dependency0;
const report = dependency1;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noMultiSpreading: 'Spreading the same expression multiple times is forbidden',
};

const rule: LegacyRule = {
    meta: {
        docs: {
            description: 'Disallow JSX prop spreading the same identifier multiple times',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('jsx-props-no-spread-multi'),
        },
        messages,
    },

    create(context) {
        return {
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                const spreads = node.attributes.filter(
                    (attr) => attr.type === 'JSXSpreadAttribute' && attr.argument.type === 'Identifier',
                );
                if (spreads.length < 2) {
                    return;
                }
                // We detect duplicate expressions by their identifier
                const identifierNames = new Set();
                spreads.forEach((spread) => {
                    if (identifierNames.has(spread.argument!.name)) {
                        report(context, messages.noMultiSpreading, 'noMultiSpreading', {
                            node: spread,
                        });
                    }
                    identifierNames.add(spread.argument!.name);
                });
            },
        };
    },
};

export default rule;
