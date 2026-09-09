import dependency0 from 'jsx-ast-utils/elementType.js';
import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file Enforce shorthand or standard form for React fragments.
 * @author Alex Zherdev
 */
import dependency1 from '../util/pragma';
import dependency2 from '../util/variable';
import dependency3 from '../util/version';
import dependency4 from '../util/docsUrl';
import dependency5 from '../util/report';
import dependency6 from '../util/eslint';

const elementType = dependency0;
const pragmaUtil = dependency1;
const variableUtil = dependency2;
const { testReactVersion } = dependency3;
const docsUrl = dependency4;
const report = dependency5;
const { getText } = dependency6;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/**
 * @param source The source text.
 * @param node The node to inspect.
 * @param text The text value.
 * @returns The result of this check.
 */
function replaceNode(source: string, node: Node, text: string) {
    return `${source.slice(0, node.range[0])}${text}${source.slice(node.range[1])}`;
}

const messages = {
    fragmentsNotSupported:
        'Fragments are only supported starting from React v16.2. Please disable the `react/jsx-fragments` rule in `eslint` settings or upgrade your version of React.',
    preferPragma: 'Prefer {{react}}.{{fragment}} over fragment shorthand',
    preferFragment: 'Prefer fragment shorthand over {{react}}.{{fragment}}',
};

const rule: LegacyRule<[('syntax' | 'element')?]> = {
    meta: {
        docs: {
            description: 'Enforce shorthand or standard form for React fragments',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-fragments'),
        },
        fixable: 'code',

        messages,

        schema: [
            {
                enum: ['syntax', 'element'],
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || 'syntax';
        const reactPragma = pragmaUtil.getFromContext(context);
        const fragmentPragma = pragmaUtil.getFragmentFromContext(context);
        const openFragShort = '<>';
        const closeFragShort = '</>';
        const openFragLong = `<${reactPragma}.${fragmentPragma}>`;
        const closeFragLong = `</${reactPragma}.${fragmentPragma}>`;

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function reportOnReactVersion(node: Node) {
            if (!testReactVersion(context, '>= 16.2.0')) {
                report(context, messages.fragmentsNotSupported, 'fragmentsNotSupported', {
                    node,
                });
                return true;
            }

            return false;
        }

        /**
         * @returns The result of this check.
         * @param jsxFragment The jsx fragment value.
         */
        function getFixerToLong(jsxFragment: Node<'JSXFragment'>) {
            if (!jsxFragment.closingFragment || !jsxFragment.openingFragment) {
                // the old TS parser crashes here
                // TODO: FIXME: can we fake these two descriptors?
                return null;
            }
            return function fix(fixer: Fixer) {
                let source = getText(context);
                source = replaceNode(source, jsxFragment.closingFragment, closeFragLong);
                source = replaceNode(source, jsxFragment.openingFragment, openFragLong);
                const lengthDiff = openFragLong.length
                    - getText(context, jsxFragment.openingFragment).length
                    + closeFragLong.length
                    - getText(context, jsxFragment.closingFragment).length;
                const { range } = jsxFragment;
                return fixer.replaceTextRange(range, source.slice(range[0], range[1] + lengthDiff));
            };
        }

        /**
         * @returns The result of this check.
         * @param jsxElement The jsx element value.
         */
        function getFixerToShort(jsxElement: Node) {
            return function fix(fixer: Fixer) {
                let source = getText(context);
                let lengthDiff;
                if (jsxElement.closingElement) {
                    source = replaceNode(source, jsxElement.closingElement, closeFragShort);
                    source = replaceNode(source, jsxElement.openingElement, openFragShort);
                    lengthDiff = getText(context, jsxElement.openingElement).length
                        - openFragShort.length
                        + getText(context, jsxElement.closingElement).length
                        - closeFragShort.length;
                } else {
                    source = replaceNode(
                        source,
                        jsxElement.openingElement!,
                        `${openFragShort}${closeFragShort}`,
                    );
                    lengthDiff = getText(context, jsxElement.openingElement).length
                        - openFragShort.length
                        - closeFragShort.length;
                }

                const { range } = jsxElement;
                return fixer.replaceTextRange(range, source.slice(range[0], range[1] - lengthDiff));
            };
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         * @param name The name to inspect.
         */
        function refersToReactFragment(node: Node, name: string) {
            const variableInit = variableUtil.findVariableByName(context, node, name);
            if (!variableInit) {
                return false;
            }

            // const { Fragment } = React;
            if (variableInit.type === 'Identifier' && variableInit.name === reactPragma) {
                return true;
            }

            // const Fragment = React.Fragment;
            if (
                variableInit.type === 'MemberExpression'
                && variableInit.object.type === 'Identifier'
                && variableInit.object.name === reactPragma
                && variableInit.property.type === 'Identifier'
                && variableInit.property.name === fragmentPragma
            ) {
                return true;
            }

            // const { Fragment } = require('react');
            if (
                variableInit.callee
                && variableInit.callee.name === 'require'
                && variableInit.arguments
                && variableInit.arguments[0]
                && variableInit.arguments[0].value === 'react'
            ) {
                return true;
            }

            return false;
        }

        const jsxElements: Node<'JSXElement'>[] = [];
        const fragmentNames = new Set([`${reactPragma}.${fragmentPragma}`]);

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        return {
            JSXElement(node: Node<'JSXElement'>) {
                jsxElements.push(node);
            },

            JSXFragment(node: Node<'JSXFragment'>) {
                if (reportOnReactVersion(node)) {
                    return;
                }

                if (configuration === 'element') {
                    report(context, messages.preferPragma, 'preferPragma', {
                        node,
                        data: {
                            react: reactPragma,
                            fragment: fragmentPragma,
                        },
                        fix: getFixerToLong(node),
                    });
                }
            },

            ImportDeclaration(node: Node<'ImportDeclaration'>) {
                if (node.source && node.source.value === 'react') {
                    node.specifiers.forEach((spec) => {
                        if (
                            'imported' in spec
                            && spec.imported
                            && 'name' in spec.imported
                            && spec.imported.name === fragmentPragma
                        ) {
                            if (spec.local) {
                                fragmentNames.add(spec.local.name);
                            }
                        }
                    });
                }
            },

            'Program:exit': function onProgramExit() {
                jsxElements.forEach((node: Node) => {
                    const openingEl = node.openingElement;
                    const elName = elementType(openingEl!);

                    if (fragmentNames.has(elName) || refersToReactFragment(node, elName)) {
                        if (reportOnReactVersion(node)) {
                            return;
                        }

                        const attrs = openingEl!.attributes;
                        if (configuration === 'syntax' && !(attrs && attrs.length > 0)) {
                            report(context, messages.preferFragment, 'preferFragment', {
                                node,
                                data: {
                                    react: reactPragma,
                                    fragment: fragmentPragma,
                                },
                                fix: getFixerToShort(node),
                            });
                        }
                    }
                });
            },
        };
    },
};

export default rule;
