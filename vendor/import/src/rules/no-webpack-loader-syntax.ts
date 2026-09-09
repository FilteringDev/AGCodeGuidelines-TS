import type { Node, LegacyRule, RuleContext } from '../../types';
import moduleVisitor from '../../utils/moduleVisitor';
import docsUrl from '../docsUrl';

/**
 * Report if non standard.
 * @param context The rule context.
 * @param node The node to inspect.
 * @param name The name to inspect.
 */
function reportIfNonStandard(context: RuleContext, node: Node, name: string) {
    if (name && name.indexOf('!') !== -1) {
        context.report(
            node,
            `Unexpected '!' in '${name}'. Do not use import syntax to configure webpack loaders.`,
        );
    }
}

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',
        docs: {
            category: 'Static analysis',
            description: 'Forbid webpack loader syntax in imports.',
            url: docsUrl('no-webpack-loader-syntax'),
        },
        schema: [],
    },

    create(context) {
        return moduleVisitor(
            (source, node: Node) => {
                reportIfNonStandard(context, node, source.value);
            },
            { commonjs: true },
        );
    },
};
export default rule;
