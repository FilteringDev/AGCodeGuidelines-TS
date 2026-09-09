/**
 * @file Comments inside children section of tag should be placed inside braces.
 * @author Ben Vinegar
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/eslint';
import dependency2 from '../util/report';
import type { LegacyRule, Node, RuleContext } from '../../types';

const docsUrl = dependency0;
const { getText } = dependency1;
const report = dependency2;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    putCommentInBraces: 'Comments inside children section of tag should be placed inside braces',
};

/**
 * @param context The value to inspect.
 * @param node The value to inspect.
 */
function checkText(context: RuleContext, node: Node) {
    // since babel-eslint has the wrong node.raw, we'll get the source text
    const rawValue = getText(context, node);
    if (/^\s*\/(\/|\*)/m.test(rawValue)) {
        // inside component, e.g. <div>literal</div>
        if (
            node.parent.type !== 'JSXAttribute'
            && node.parent.type !== 'JSXExpressionContainer'
            && node.parent.type.indexOf('JSX') !== -1
        ) {
            report(context, messages.putCommentInBraces, 'putCommentInBraces', {
                node,
            });
        }
    }
}

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow comments from being inserted as text nodes',
            category: 'Possible Errors',
            recommended: true,
            url: docsUrl('jsx-no-comment-textnodes'),
        },

        messages,

        schema: [],
    },

    create(context) {
        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        return {
            Literal(node: Node<'Literal'>) {
                checkText(context, node);
            },
            JSXText(node: Node<'JSXText'>) {
                checkText(context, node);
            },
        };
    },
};

export default rule;
