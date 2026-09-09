import type { Node, LegacyRule, RuleContext } from '../../types';
import { getPhysicalFilename } from '../../utils/contextCompat';
import resolve from '../../utils/resolve';
import moduleVisitor from '../../utils/moduleVisitor';
import docsUrl from '../docsUrl';

/**
 * @file Forbids a module from importing itself
 */

/**
 * Is importing self.
 * @param context The rule context.
 * @param node The node to inspect.
 * @param requireName The require name value.
 */
function isImportingSelf(context: RuleContext, node: Node, requireName: string) {
    const filePath = getPhysicalFilename(context);

    // If the input is from stdin, this test can't fail
    if (filePath !== '<text>' && filePath === resolve(requireName, context)) {
        context.report({
            node,
            message: 'Module imports itself.',
        });
    }
}

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',
        docs: {
            category: 'Static analysis',
            description: 'Forbid a module from importing itself.',
            recommended: true,
            url: docsUrl('no-self-import'),
        },

        schema: [],
    },
    create(context) {
        return moduleVisitor(
            (source, node: Node) => {
                isImportingSelf(context, node, source.value);
            },
            { commonjs: true },
        );
    },
};
export default rule;
