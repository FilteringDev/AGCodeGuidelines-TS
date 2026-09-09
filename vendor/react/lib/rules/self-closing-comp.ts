import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file Prevent extra closing tags for components without children
 * @author Yannick Croissant
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/jsx';
import dependency2 from '../util/report';

const docsUrl = dependency0;
const jsxUtil = dependency1;
const report = dependency2;

const optionDefaults = { component: true, html: true };

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isComponent(node: Node<'JSXOpeningElement'>) {
    return (
        node.name
        && (node.name.type === 'JSXIdentifier' || node.name.type === 'JSXMemberExpression')
        && !jsxUtil.isDOMComponent(node)
    );
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function childrenIsEmpty(node: Node) {
    return node.parent.children!.length === 0;
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function childrenIsMultilineSpaces(node: Node) {
    const childrens = node.parent.children;

    return (
        childrens!.length === 1
        && (childrens![0]!.type === 'Literal' || childrens![0]!.type === 'JSXText')
        && (childrens![0]!.value as string).indexOf('\n') !== -1
        && (childrens![0]!.value as string).replace(/(?!\xA0)\s/g, '') === ''
    );
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    notSelfClosing: 'Empty components are self-closing',
};

const rule: LegacyRule<[{ component?: boolean; html?: boolean }?]> = {
    meta: {
        docs: {
            description: 'Disallow extra closing tags for components without children',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('self-closing-comp'),
        },
        fixable: 'code',

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    component: {
                        default: optionDefaults.component,
                        type: 'boolean',
                    },
                    html: {
                        default: optionDefaults.html,
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isShouldBeSelfClosed(node: Node<'JSXOpeningElement'>) {
            const configuration = { ...optionDefaults, ...context.options[0] };
            return (
                ((configuration.component && isComponent(node))
                    || (configuration.html && jsxUtil.isDOMComponent(node)))
                && !node.selfClosing
                && (childrenIsEmpty(node) || childrenIsMultilineSpaces(node))
            );
        }

        return {
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                if (!isShouldBeSelfClosed(node)) {
                    return;
                }
                report(context, messages.notSelfClosing, 'notSelfClosing', {
                    node,
                    fix(fixer: Fixer) {
                        // Represents the last character of the JSXOpeningElement, the '>' character
                        const openingElementEnding = node.range[1] - 1;
                        // Represents the last character of the JSXClosingElement, the '>' character
                        const closingElementEnding = node.parent.closingElement!.range[1];

                        // Replace />.*<\/.*>/ with '/>'
                        const range: [number, number] = [openingElementEnding, closingElementEnding];
                        return fixer.replaceTextRange(range, ' />');
                    },
                });
            },
        };
    },
};

export default rule;
