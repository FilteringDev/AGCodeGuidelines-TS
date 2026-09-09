import dependency0 from 'array-includes';
import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file Disallow useless fragments
 */
import dependency1 from '../util/pragma';
import dependency2 from '../util/ast';
import dependency3 from '../util/jsx';
import dependency4 from '../util/docsUrl';
import dependency5 from '../util/report';
import dependency6 from '../util/eslint';

const arrayIncludes = dependency0;

const pragmaUtil = dependency1;
const astUtil = dependency2;
const jsxUtil = dependency3;
const docsUrl = dependency4;
const report = dependency5;
const { getText } = dependency6;

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isJSXText(node: Node) {
    return !!node && (node.type === 'JSXText' || node.type === 'Literal');
}

/**
 * @param text The value to inspect.
 * @returns The result of this check.
 */
function isOnlyWhitespace(text: string) {
    return text.trim().length === 0;
}

/**
 * @param node The value to inspect.
 * @returns The result of this check.
 */
function isNonspaceJSXTextOrJSXCurly(node: Node) {
    return (isJSXText(node) && !isOnlyWhitespace(node.raw!)) || node.type === 'JSXExpressionContainer';
}

/**
 * Somehow fragment like this is useful: <Foo content={<>ee eeee eeee ...</>} />
 * @param node The value to inspect.
 * @returns The result of this check.
 */
function isFragmentWithOnlyTextAndIsNotChild(node: Node) {
    return (
        node.children!.length === 1
        && isJSXText(node.children![0]!)
        && !(node.parent.type === 'JSXElement' || node.parent.type === 'JSXFragment')
    );
}

/**
 * @param text The value to inspect.
 * @returns The result of this check.
 */
function trimLikeReact(text: string) {
    const leadingSpaces = /^\s*/.exec(text)![0];
    const trailingSpaces = /\s*$/.exec(text)![0];

    const start = arrayIncludes(leadingSpaces, '\n') ? leadingSpaces.length : 0;
    const end = arrayIncludes(trailingSpaces, '\n') ? text.length - trailingSpaces.length : text.length;

    return text.slice(start, end);
}

/**
 * Test if node is like `<Fragment key={_}>_</Fragment>`
 * @param node The value to inspect.
 * @returns The result of this check.
 */
function isKeyedElement(node: Node<'JSXElement'>) {
    return (
        node.type === 'JSXElement'
        && node.openingElement.attributes
        && node.openingElement.attributes.some(jsxUtil.isJSXAttributeKey)
    );
}

/**
 * @param node The value to inspect.
 * @returns The result of this check.
 */
function containsCallExpression(node: Node) {
    return node && node.type === 'JSXExpressionContainer' && astUtil.isCallExpression(node.expression);
}

const messages = {
    NeedsMoreChildren:
        'Fragments should contain more than one child - otherwise, there’s no need for a Fragment at all.',
    ChildOfHtmlElement: 'Passing a fragment to an HTML element is useless.',
};

const rule: LegacyRule<[{ allowExpressions?: boolean; [key: string]: unknown }?]> = {
    meta: {
        type: 'suggestion',
        fixable: 'code',
        docs: {
            description: 'Disallow unnecessary fragments',
            category: 'Possible Errors',
            recommended: false,
            url: docsUrl('jsx-no-useless-fragment'),
        },
        messages,
        schema: [
            {
                type: 'object',
                properties: {
                    allowExpressions: {
                        type: 'boolean',
                    },
                },
            },
        ],
    },

    create(context) {
        const config = context.options[0] || {};
        const allowExpressions = config.allowExpressions || false;

        const reactPragma = pragmaUtil.getFromContext(context);
        const fragmentPragma = pragmaUtil.getFragmentFromContext(context);

        /**
         * Test whether a node is an padding spaces trimmed by react runtime.
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function isPaddingSpaces(node: Node) {
            return isJSXText(node) && isOnlyWhitespace(node.raw!) && arrayIncludes(node.raw!, '\n');
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isFragmentWithSingleExpression(node: Node) {
            const children = node && node.children!.filter((child) => !isPaddingSpaces(child));
            return children && children.length === 1 && children[0]!.type === 'JSXExpressionContainer';
        }

        /**
         * Test whether a JSXElement has less than two children, excluding paddings spaces.
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function hasLessThanTwoChildren(node: Node<'JSXElement'> | Node<'JSXFragment'>) {
            if (!node || !node.children) {
                return true;
            }

            const nonPaddingChildren: Node[] = node.children.filter((child) => !isPaddingSpaces(child));

            if (nonPaddingChildren.length < 2) {
                return !containsCallExpression(nonPaddingChildren[0]!);
            }

            return undefined;
        }

        /**
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function isChildOfHtmlElement(node: Node<'JSXElement'> | Node<'JSXFragment'>) {
            return (
                node.parent.type === 'JSXElement'
                && node.parent.openingElement.name.type === 'JSXIdentifier'
                && /^[a-z]+$/.test(node.parent.openingElement.name.name)
            );
        }

        /**
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function isChildOfComponentElement(node: Node<'JSXElement'> | Node<'JSXFragment'>) {
            return (
                node.parent.type === 'JSXElement'
                && !isChildOfHtmlElement(node)
                && !jsxUtil.isFragment(node.parent, reactPragma, fragmentPragma)
            );
        }

        /**
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function canFix(node: Node<'JSXElement' | 'JSXFragment'>) {
            // Not safe to fix fragments without a jsx parent.
            if (!(node.parent.type === 'JSXElement' || node.parent.type === 'JSXFragment')) {
                // const a = <></>
                if (node.children!.length === 0) {
                    return false;
                }

                // const a = <>cat {meow}</>
                if (node.children!.some(isNonspaceJSXTextOrJSXCurly)) {
                    return false;
                }
            }

            // Not safe to fix `<Eeee><>foo</></Eeee>` because `Eeee` might require its children be a ReactElement.
            if (isChildOfComponentElement(node)) {
                return false;
            }

            // old TS parser can't handle this one
            if (node.type === 'JSXFragment' && (!node.openingFragment || !node.closingFragment)) {
                return false;
            }

            return true;
        }

        /**
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function getFix(node: Node<'JSXElement' | 'JSXFragment'>) {
            if (!canFix(node)) {
                return undefined;
            }

            return function fix(fixer: Fixer) {
                const opener = node.type === 'JSXFragment' ? node.openingFragment : node.openingElement;
                const closer = node.type === 'JSXFragment' ? node.closingFragment : node.closingElement;

                const childrenText = opener!.selfClosing
                    ? ''
                    : getText(context).slice(opener!.range[1], closer!.range[0]);

                return fixer.replaceText(node, trimLikeReact(childrenText));
            };
        }

        /**
         * @param node The node to inspect.
         */
        function checkNode(node: Node<'JSXElement' | 'JSXFragment'>) {
            if (isKeyedElement(node as Node<'JSXElement'>)) {
                return;
            }

            if (
                hasLessThanTwoChildren(node)
                && !isFragmentWithOnlyTextAndIsNotChild(node)
                && !(allowExpressions && isFragmentWithSingleExpression(node))
            ) {
                report(context, messages.NeedsMoreChildren, 'NeedsMoreChildren', {
                    node,
                    fix: getFix(node),
                });
            }

            if (isChildOfHtmlElement(node)) {
                report(context, messages.ChildOfHtmlElement, 'ChildOfHtmlElement', {
                    node,
                    fix: getFix(node),
                });
            }
        }

        return {
            JSXElement(node: Node<'JSXElement'>) {
                if (jsxUtil.isFragment(node, reactPragma, fragmentPragma)) {
                    checkNode(node);
                }
            },
            JSXFragment: checkNode,
        };
    },
};

export default rule;
