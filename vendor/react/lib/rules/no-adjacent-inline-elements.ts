import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent adjacent inline elements not separated by whitespace.
 * @author Sean Hayes
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/isCreateElement';
import dependency2 from '../util/report';
import dependency3 from '../util/ast';

const docsUrl = dependency0;
const isCreateElement = dependency1;
const report = dependency2;
const astUtil = dependency3;

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

// https://developer.mozilla.org/en-US/docs/Web/HTML/Inline_elements
const inlineNames = [
    'a',
    'b',
    'big',
    'i',
    'small',
    'tt',
    'abbr',
    'acronym',
    'cite',
    'code',
    'dfn',
    'em',
    'kbd',
    'strong',
    'samp',
    'time',
    'var',
    'bdo',
    'br',
    'img',
    'map',
    'object',
    'q',
    'script',
    'span',
    'sub',
    'sup',
    'button',
    'input',
    'label',
    'select',
    'textarea',
];
// Note: raw &nbsp; will be transformed into \u00a0.
const whitespaceRegex = /(?:^\s|\s$)/;

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isInline(node: Node) {
    if (node.type === 'Literal') {
        // Regular whitespace will be removed.
        const { value } = node;
        // To properly separate inline elements, each end of the literal will need
        // whitespace.
        return !whitespaceRegex.test(value as string);
    }
    if (
        node.type === 'JSXElement'
        && inlineNames.indexOf(node.openingElement.name.name as string) > -1
    ) {
        return true;
    }
    if (astUtil.isCallExpression(node) && inlineNames.indexOf(node.arguments[0]!.value as string) > -1) {
        return true;
    }
    return false;
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    inlineElement:
        'Child elements which render as inline HTML elements should be separated by a space or wrapped in block level elements.',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow adjacent inline elements not separated by whitespace.',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('no-adjacent-inline-elements'),
        },
        schema: [],

        messages,
    },
    create(context) {
        /**
         * @param node The node to inspect.
         * @param children The children value.
         */
        function validate(node: Node, children: (Node | null)[] | undefined) {
            let currentIsInline = false;
            let previousIsInline = false;
            if (!children) {
                return;
            }
            for (let i = 0; i < children.length; i += 1) {
                currentIsInline = isInline(children[i]!);
                if (previousIsInline && currentIsInline) {
                    report(context, messages.inlineElement, 'inlineElement', {
                        node,
                    });
                    return;
                }
                previousIsInline = currentIsInline;
            }
        }
        return {
            JSXElement(node: Node<'JSXElement'>) {
                validate(node, node.children);
            },
            CallExpression(node: Node<'CallExpression'>) {
                if (!isCreateElement(context, node)) {
                    return;
                }
                if (node.arguments.length < 2 || !node.arguments[2]) {
                    return;
                }
                const children = 'elements' in node.arguments[2] ? node.arguments[2].elements : undefined;
                validate(node, children);
            },
        };
    },
};

export default rule;
