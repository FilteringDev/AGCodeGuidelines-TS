import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent string definitions for references and prevent referencing this.refs
 * @author Tom Hastjarjanto
 */
import dependency0 from '../util/componentUtil';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/report';
import dependency3 from '../util/version';

const componentUtil = dependency0;
const docsUrl = dependency1;
const report = dependency2;
const { testReactVersion } = dependency3;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    thisRefsDeprecated: 'Using this.refs is deprecated.',
    stringInRefDeprecated: 'Using string literals in ref attributes is deprecated.',
};

const rule: LegacyRule<[{ noTemplateLiterals?: boolean }?]> = {
    meta: {
        docs: {
            description: 'Disallow using string references',
            category: 'Best Practices',
            recommended: true,
            url: docsUrl('no-string-refs'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    noTemplateLiterals: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const checkRefsUsage = testReactVersion(context, '< 18.3.0');
        // `this.refs` is writable in React 18.3.0 and later, see https://github.com/facebook/react/pull/28867
        const detectTemplateLiterals = context.options[0]
            ? context.options[0].noTemplateLiterals
            : false;
        /**
         * Checks if we are using refs
         * @param node The AST node being checked.
         * @returns True if we are using refs, false if not.
         */
        function isRefsUsage(node: Node) {
            return !!(
                (componentUtil.getParentES6Component(context, node)
                    || componentUtil.getParentES5Component(context, node))
                && node.object!.type === 'ThisExpression'
                && node.property!.name === 'refs'
            );
        }

        /**
         * Checks if we are using a ref attribute
         * @param node The AST node being checked.
         * @returns True if we are using a ref attribute, false if not.
         */
        function isRefAttribute(node: Node): node is Node<'JSXAttribute'> {
            return node.type === 'JSXAttribute' && !!node.name && node.name.name === 'ref';
        }

        /**
         * Checks if a node contains a string value
         * @param node The AST node being checked.
         * @returns True if the node contains a string value, false if not.
         */
        function containsStringLiteral(node: Node<'JSXAttribute'>) {
            return !!node.value && node.value.type === 'Literal' && typeof node.value.value === 'string';
        }

        /**
         * Checks if a node contains a string value within a jsx expression
         * @param node The AST node being checked.
         * @returns True if the node contains a string value within a jsx expression, false if not.
         */
        function containsStringExpressionContainer(node: Node<'JSXAttribute'>) {
            return (
                !!node.value
                && node.value.type === 'JSXExpressionContainer'
                && node.value.expression
                && ((node.value.expression.type === 'Literal'
                    && typeof node.value.expression.value === 'string')
                    || (node.value.expression.type === 'TemplateLiteral' && detectTemplateLiterals))
            );
        }

        return {
            MemberExpression(node: Node<'MemberExpression'>) {
                if (checkRefsUsage && isRefsUsage(node)) {
                    report(context, messages.thisRefsDeprecated, 'thisRefsDeprecated', {
                        node,
                    });
                }
            },

            JSXAttribute(node: Node<'JSXAttribute'>) {
                if (
                    isRefAttribute(node)
                    && (containsStringLiteral(node) || containsStringExpressionContainer(node))
                ) {
                    report(context, messages.stringInRefDeprecated, 'stringInRefDeprecated', {
                        node,
                    });
                }
            },
        };
    },
};

export default rule;
