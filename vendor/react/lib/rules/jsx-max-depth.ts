import dependency1 from 'array-includes';
import type { LegacyRule, Node, Reference } from '../../types';
/**
 * @file Validate JSX maximum depth
 * @author Chris<wfsr@foxmail.com>
 */
import dependency0 from '../../compat/hasown';
import dependency2 from '../util/variable';
import dependency3 from '../util/jsx';
import dependency4 from '../util/docsUrl';
import dependency5 from '../util/report';

const has = dependency0;
const includes = dependency1;
const variableUtil = dependency2;
const jsxUtil = dependency3;
const docsUrl = dependency4;
const reportC = dependency5;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    wrongDepth: 'Expected the depth of nested jsx elements to be <= {{needed}}, but found {{found}}.',
};

const rule: LegacyRule<[{ max?: number }?]> = {
    meta: {
        docs: {
            description: 'Enforce JSX maximum depth',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-max-depth'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    max: {
                        type: 'integer',
                        minimum: 0,
                    },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const DEFAULT_DEPTH = 2;

        const option = context.options[0] || {};
        const maxDepth = has(option, 'max') ? option.max : DEFAULT_DEPTH;

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isExpression(node: Node) {
            return node.type === 'JSXExpressionContainer';
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function hasJSX(node: Node) {
            return jsxUtil.isJSX(node) || (isExpression(node) && jsxUtil.isJSX(node.expression));
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isLeaf(node: Node) {
            const { children } = node;

            return !children || children.length === 0 || !children.some(hasJSX);
        }

        /**
         * @returns The result of this check.
         * @param initialNode The initial node value.
         */
        function getDepth(initialNode: Node) {
            let node = initialNode;

            let count = 0;

            while (jsxUtil.isJSX(node.parent) || isExpression(node.parent)) {
                node = node.parent;
                if (jsxUtil.isJSX(node)) {
                    count += 1;
                }
            }

            return count;
        }

        /**
         * @param node The node to inspect.
         * @param depth The depth value.
         */
        function report(node: Node, depth: number) {
            reportC(context, messages.wrongDepth, 'wrongDepth', {
                node,
                data: {
                    found: depth,
                    needed: maxDepth,
                },
            });
        }

        /**
         * @returns The result of this check.
         * @param startNode The start node value.
         * @param name The name to inspect.
         * @param previousReferences The previous references value.
         */
        function findJSXElementOrFragment(
            startNode: Node,
            name: string,
            previousReferences: Reference[],
        ): Node<'JSXElement' | 'JSXFragment'> | false | null | undefined {
            /**
             * @returns The result of this check.
             * @param refs The refs value.
             * @param prevRefs The prev refs value.
             */
            function find(
                refs: Reference[],
                prevRefs: Reference[],
            ): Node<'JSXElement' | 'JSXFragment'> | false | null | undefined {
                for (let i = refs.length - 1; i >= 0; i -= 1) {
                    if (typeof refs[i]!.writeExpr !== 'undefined') {
                        const { writeExpr } = refs[i]!;

                        return (
                            (jsxUtil.isJSX(writeExpr) && writeExpr)
                            || (writeExpr
                                && writeExpr.type === 'Identifier'
                                && findJSXElementOrFragment(startNode, writeExpr.name, prevRefs))
                        );
                    }
                }

                return null;
            }

            const variable = variableUtil.getVariableFromContext(context, startNode, name);
            if (variable && variable.references) {
                const containDuplicates = previousReferences.some((ref) => includes(variable.references, ref));

                // Prevent getting stuck in circular references
                if (containDuplicates) {
                    return false;
                }

                return find(variable.references, previousReferences.concat(variable.references));
            }

            return false;
        }

        /**
         * @param initialBaseDepth The initial base depth value.
         * @param children The children value.
         */
        function checkDescendant(initialBaseDepth: number, children: Node[] | undefined) {
            let baseDepth = initialBaseDepth;

            baseDepth += 1;
            (children || [])
                .filter((node: Node) => hasJSX(node))
                .forEach((node: Node) => {
                    if (baseDepth > maxDepth!) {
                        report(node, baseDepth);
                    } else if (!isLeaf(node)) {
                        checkDescendant(baseDepth, node.children);
                    }
                });
        }

        /**
         * @param node The node to inspect.
         */
        function handleJSX(node: Node) {
            if (!isLeaf(node)) {
                return;
            }

            const depth = getDepth(node);
            if (depth > maxDepth!) {
                report(node, depth);
            }
        }

        return {
            JSXElement: handleJSX,
            JSXFragment: handleJSX,

            JSXExpressionContainer(node: Node<'JSXExpressionContainer'>) {
                if (node.expression.type !== 'Identifier') {
                    return;
                }

                const element = findJSXElementOrFragment(node, node.expression.name, []);

                if (element) {
                    const baseDepth = getDepth(node);
                    checkDescendant(baseDepth, element.children);
                }
            },
        };
    },
};

export default rule;
