import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent variables used in JSX to be marked as unused
 * @author Yannick Croissant
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/eslint';

const docsUrl = dependency0;
const { markVariableAsUsed } = dependency1;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const isTagNameRe = /^[a-z]/;
const isTagName = (name: string) => isTagNameRe.test(name);

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow variables used in JSX to be incorrectly marked as unused',
            category: 'Best Practices',
            recommended: true,
            url: docsUrl('jsx-uses-vars'),
        },
        schema: [],
    },

    create(context) {
        return {
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                let name;
                if (node.name.namespace) {
                    // <Foo:Bar>
                    return;
                }
                if (node.name.name) {
                    // <Foo>
                    name = node.name.name;
                    // Exclude lowercase tag names like <div>
                    if (isTagName(name)) {
                        return;
                    }
                } else if (node.name.object) {
                    // <Foo...Bar>
                    let parent = node.name.object;
                    while (parent.object) {
                        parent = parent.object;
                    }
                    name = parent.name;
                } else {
                    return;
                }

                markVariableAsUsed(name as string, node, context);
            },
        };
    },
};

export default rule;
