import type {
    Fixer, LegacyRule, Node, Token,
} from '../../types';
/**
 * @file Disallow multiple spaces between inline JSX props
 * @author Adrian Moennich
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/eslint';
import dependency2 from '../util/report';
import dependency3 from '../util/props';

const docsUrl = dependency0;
const eslintUtil = dependency1;
const report = dependency2;
const propsUtil = dependency3;

const { getSourceCode } = eslintUtil;
const { getText } = eslintUtil;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noLineGap: 'Expected no line gap between “{{prop1}}” and “{{prop2}}”',
    onlyOneSpace: 'Expected only one space between “{{prop1}}” and “{{prop2}}”',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow multiple spaces between inline JSX props',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-props-no-multi-spaces'),
        },
        fixable: 'code',

        messages,

        schema: [],
    },

    create(context) {
        const sourceCode = getSourceCode(context);

        /**
         * @returns The result of this check.
         * @param propNode The prop node value.
         */
        function getPropName(
            propNode: Node<
                | 'JSXSpreadAttribute'
                | 'JSXIdentifier'
                | 'JSXMemberExpression'
                | 'JSXAttribute'
                | 'JSXOpeningElement'
                | 'JSXNamespacedName'
                | 'MemberExpression'
            >,
        ): string | Node<'JSXIdentifier'> | undefined {
            switch (propNode.type) {
                case 'JSXSpreadAttribute':
                    return getText(context, propNode.argument);
                case 'JSXIdentifier':
                    return propNode.name;
                case 'JSXMemberExpression':
                    return `${getPropName(propNode.object)}.${propNode.property.name}`;
                default:
                    return propNode.name
                        ? propNode.name.name
                        : `${getText(context, propNode.object)}.${propNode.property!.name}`;
                        // needed for typescript-eslint parser
            }
        }

        // First and second must be adjacent nodes
        /**
         * @returns The result of this check.
         * @param first The first value.
         * @param second The second value.
         */
        function hasEmptyLines(first: Node, second: Node) {
            const comments = sourceCode.getCommentsBefore ? sourceCode.getCommentsBefore(second) : [];
            const nodes = ([] as (Node | Token)[]).concat(first, comments, second);

            for (let i = 1; i < nodes.length; i += 1) {
                const prev = nodes[i - 1];
                const curr = nodes[i];
                if (curr!.loc.start.line - prev!.loc.end.line >= 2) {
                    return true;
                }
            }

            return false;
        }

        /**
         * @param prev The prev value.
         * @param node The node to inspect.
         */
        function checkSpacing(
            prev: Parameters<typeof getPropName>[0],
            node: Node<'JSXAttribute' | 'JSXSpreadAttribute'>,
        ) {
            if (hasEmptyLines(prev, node)) {
                report(context, messages.noLineGap, 'noLineGap', {
                    node,
                    data: {
                        prop1: getPropName(prev),
                        prop2: getPropName(node),
                    },
                });
            }

            if (prev!.loc.end.line !== node.loc.end.line) {
                return;
            }

            const between = getSourceCode(context).text.slice(prev.range[1], node.range[0]);

            if (between !== ' ') {
                report(context, messages.onlyOneSpace, 'onlyOneSpace', {
                    node,
                    data: {
                        prop1: getPropName(prev),
                        prop2: getPropName(node),
                    },
                    fix(fixer: Fixer) {
                        return fixer.replaceTextRange([prev.range[1], node.range[0]], ' ');
                    },
                });
            }
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function containsGenericType(node: Node) {
            const nodeTypeArguments = propsUtil.getTypeArguments(node);
            if (typeof nodeTypeArguments === 'undefined') {
                return false;
            }

            return nodeTypeArguments!.type === 'TSTypeParameterInstantiation';
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function getGenericNode(node: Node<'JSXOpeningElement'>) {
            const { name } = node;
            if (containsGenericType(node)) {
                const nodeTypeArguments = propsUtil.getTypeArguments(node);

                return {
                    ...node,
                    range: [name!.range[0], nodeTypeArguments!.range[1]] as [number, number],
                };
            }

            return name;
        }

        return {
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                node.attributes.reduce<Parameters<typeof getPropName>[0]>((prev, prop) => {
                    checkSpacing(prev, prop);
                    return prop;
                }, getGenericNode(node));
            },
        };
    },
};

export default rule;
