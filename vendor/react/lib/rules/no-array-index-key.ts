import type { RuleContext, LegacyRule, Node } from '../../types';
/**
 * @file Prevent usage of Array index in keys
 * @author Joe Lencioni
 */
import dependency0 from '../../compat/hasown';
import dependency1 from '../util/ast';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/pragma';
import dependency4 from '../util/report';
import dependency5 from '../util/variable';

const has = dependency0;
const astUtil = dependency1;
const docsUrl = dependency2;
const pragma = dependency3;
const report = dependency4;
const variableUtil = dependency5;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/**
 * @param node The node to inspect.
 * @param context The rule context.
 * @returns The result of this check.
 */
function isCreateCloneElement(node: Node, context: RuleContext) {
    if (!node) {
        return false;
    }

    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
        return (
            node.object
            && node.object.name === pragma.getFromContext(context)
            && ['createElement', 'cloneElement'].indexOf(node.property.name!) !== -1
        );
    }

    if (node.type === 'Identifier') {
        const variable = variableUtil.findVariableByName(context, node, node.name);
        if (variable && variable.type === 'ImportSpecifier') {
            return variable.parent.source!.value === 'react';
        }
    }

    return false;
}

const messages = {
    noArrayIndex: 'Do not use Array index in keys',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow usage of Array index in keys',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('no-array-index-key'),
        },

        messages,

        schema: [],
    },

    create(context) {
        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------
        const indexParamNames: string[] = [];
        const iteratorFunctionsToIndexParamPosition: Record<string, number> = {
            every: 1,
            filter: 1,
            find: 1,
            findIndex: 1,
            flatMap: 1,
            forEach: 1,
            map: 1,
            reduce: 2,
            reduceRight: 2,
            some: 1,
        };

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isArrayIndex(node: Node) {
            return node.type === 'Identifier' && indexParamNames.indexOf(node.name) !== -1;
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isUsingReactChildren(node: Node) {
            const { callee } = node;
            if (!callee || !callee.property || !callee.object) {
                return null;
            }

            const isReactChildMethod = ['map', 'forEach'].indexOf(callee.property.name!) > -1;
            if (!isReactChildMethod) {
                return null;
            }

            const obj = callee.object;
            if (obj && obj.name === 'Children') {
                return true;
            }
            if (obj && obj.object && obj.object.name === pragma.getFromContext(context)) {
                return true;
            }

            return false;
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function getMapIndexParamName(node: Node) {
            const { callee } = node;
            if (callee!.type !== 'MemberExpression' && callee!.type !== 'OptionalMemberExpression') {
                return null;
            }
            if (callee!.property!.type !== 'Identifier') {
                return null;
            }
            if (!has(iteratorFunctionsToIndexParamPosition, callee!.property!.name!)) {
                return null;
            }

            const name = callee!.property!.name as keyof typeof iteratorFunctionsToIndexParamPosition;

            const callbackArg = isUsingReactChildren(node) ? node.arguments![1] : node.arguments![0];

            if (!callbackArg) {
                return null;
            }

            if (!astUtil.isFunctionLikeExpression(callbackArg)) {
                return null;
            }

            const { params } = callbackArg;

            const indexParamPosition = iteratorFunctionsToIndexParamPosition[name]!;
            if (params.length < indexParamPosition + 1) {
                return null;
            }

            return params[indexParamPosition]!.name;
        }

        /**
         * @returns The result of this check.
         * @param side The side value.
         */
        function getIdentifiersFromBinaryExpression(
            side: Node,
        ): Node<'Identifier'> | Node<'Identifier'>[] | null {
            if (side.type === 'Identifier') {
                return side;
            }

            if (side.type === 'BinaryExpression') {
                // recurse
                const left = getIdentifiersFromBinaryExpression(side.left);
                const right = getIdentifiersFromBinaryExpression(side.right);
                return ([] as (Node<'Identifier'> | null)[])
                    .concat(left, right)
                    .filter((node): node is Node<'Identifier'> => Boolean(node));
            }

            return null;
        }

        /**
         * @param node The node to inspect.
         */
        function checkPropValue(node: Node) {
            if (isArrayIndex(node)) {
                // key={bar}
                report(context, messages.noArrayIndex, 'noArrayIndex', {
                    node,
                });
                return;
            }

            if (node.type === 'TemplateLiteral') {
                // key={`foo-${bar}`}
                node.expressions.filter(isArrayIndex).forEach(() => {
                    report(context, messages.noArrayIndex, 'noArrayIndex', {
                        node,
                    });
                });

                return;
            }

            if (node.type === 'BinaryExpression') {
                // key={'foo' + bar}
                const identifiers = getIdentifiersFromBinaryExpression(node) as Node<'Identifier'>[];

                identifiers.filter(isArrayIndex).forEach(() => {
                    report(context, messages.noArrayIndex, 'noArrayIndex', {
                        node,
                    });
                });

                return;
            }

            if (
                astUtil.isCallExpression(node)
                && node.callee
                && node.callee.type === 'MemberExpression'
                && node.callee.object
                && isArrayIndex(node.callee.object)
                && node.callee.property
                && node.callee.property.type === 'Identifier'
                && node.callee.property.name === 'toString'
            ) {
                // key={bar.toString()}
                report(context, messages.noArrayIndex, 'noArrayIndex', {
                    node,
                });
                return;
            }

            if (
                astUtil.isCallExpression(node)
                && node.callee
                && node.callee.type === 'Identifier'
                && node.callee.name === 'String'
                && Array.isArray(node.arguments)
                && node.arguments.length > 0
                && isArrayIndex(node.arguments[0]!)
            ) {
                // key={String(bar)}
                report(context, messages.noArrayIndex, 'noArrayIndex', {
                    node: node.arguments[0]!,
                });
            }
        }

        /**
         * @param node The node to inspect.
         */
        function popIndex(node: Node) {
            const mapIndexParamName = getMapIndexParamName(node);
            if (!mapIndexParamName) {
                return;
            }

            indexParamNames.pop();
        }

        return {
            'CallExpression, OptionalCallExpression': function onCallExpressionOptionalCallExpression(
                node: Node<'CallExpression' | 'OptionalCallExpression'>,
            ) {
                if (isCreateCloneElement(node.callee, context) && node.arguments.length > 1) {
                    // React.createElement
                    if (!indexParamNames.length) {
                        return;
                    }

                    const props = node.arguments[1];

                    if (props!.type !== 'ObjectExpression') {
                        return;
                    }

                    props!.properties!.forEach((prop) => {
                        if (!prop.key || prop.key.name !== 'key') {
                            // { ...foo }
                            // { foo: bar }
                            return;
                        }

                        checkPropValue(prop.value!);
                    });

                    return;
                }

                const mapIndexParamName = getMapIndexParamName(node);
                if (!mapIndexParamName) {
                    return;
                }

                indexParamNames.push(mapIndexParamName);
            },

            JSXAttribute(node: Node<'JSXAttribute'>) {
                if (node.name.name !== 'key') {
                    // foo={bar}
                    return;
                }

                if (!indexParamNames.length) {
                    // Not inside a call expression that we think has an index param.
                    return;
                }

                const { value } = node;
                if (!value || value.type !== 'JSXExpressionContainer') {
                    // key='foo' or just simply 'key'
                    return;
                }

                checkPropValue(value.expression);
            },

            'CallExpression:exit': popIndex,
            'OptionalCallExpression:exit': popIndex,
        };
    },
};

export default rule;
