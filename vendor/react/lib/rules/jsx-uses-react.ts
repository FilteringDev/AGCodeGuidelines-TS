import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent React to be marked as unused
 * @author Glen Mailer
 */
import dependency0 from '../util/pragma';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/eslint';

const pragmaUtil = dependency0;
const docsUrl = dependency1;
const { markVariableAsUsed } = dependency2;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow React to be incorrectly marked as unused',
            category: 'Best Practices',
            recommended: true,
            url: docsUrl('jsx-uses-react'),
        },
        schema: [],
    },

    create(context) {
        const pragma = pragmaUtil.getFromContext(context);
        const fragment = pragmaUtil.getFragmentFromContext(context);

        /**
         * @param node The value to inspect.
         */
        function handleOpeningElement(node: Node) {
            markVariableAsUsed(pragma, node, context);
        }
        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        return {
            JSXOpeningElement: handleOpeningElement,
            JSXOpeningFragment: handleOpeningElement,
            JSXFragment(node: Node<'JSXFragment'>) {
                markVariableAsUsed(fragment, node, context);
            },
        };
    },
};

export default rule;
