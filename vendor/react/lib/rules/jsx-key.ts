/**
 * @file Report missing `key` props in iterators/collection literals.
 * @author Ben Mosher
 */
import dependency0 from 'jsx-ast-utils/hasProp.js';
import dependency1 from 'jsx-ast-utils/propName.js';
import dependency2 from 'object.values';
import type { LegacyRule, Node } from '../../types';
import dependency3 from '../util/docsUrl';
import dependency4 from '../util/pragma';
import dependency5 from '../util/report';
import dependency6 from '../util/ast';
import dependency7 from '../util/eslint';

const hasProp = dependency0;
const propName = dependency1;
const values = dependency2;
const docsUrl = dependency3;
const pragmaUtil = dependency4;
const report = dependency5;
const astUtil = dependency6;
const { getText } = dependency7;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const defaultOptions = {
    checkFragmentShorthand: false,
    checkKeyMustBeforeSpread: false,
    warnOnDuplicates: false,
};

const messages = {
    missingIterKey: 'Missing "key" prop for element in iterator',
    missingIterKeyUsePrag:
        'Missing "key" prop for element in iterator. Shorthand fragment syntax does not support providing keys. Use {{reactPrag}}.{{fragPrag}} instead',
    missingArrayKey: 'Missing "key" prop for element in array',
    missingArrayKeyUsePrag:
        'Missing "key" prop for element in array. Shorthand fragment syntax does not support providing keys. Use {{reactPrag}}.{{fragPrag}} instead',
    keyBeforeSpread:
        '`key` prop must be placed before any `{...spread}, to avoid conflicting with React’s new JSX transform: https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html`',
    nonUniqueKeys: '`key` prop must be unique',
};

const rule: LegacyRule<
    [
        {
            checkFragmentShorthand?: boolean;
            checkKeyMustBeforeSpread?: boolean;
            warnOnDuplicates?: boolean;
        }?,
    ]
> = {
    meta: {
        docs: {
            description: 'Disallow missing `key` props in iterators/collection literals',
            category: 'Possible Errors',
            recommended: true,
            url: docsUrl('jsx-key'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    checkFragmentShorthand: {
                        type: 'boolean',
                        default: defaultOptions.checkFragmentShorthand,
                    },
                    checkKeyMustBeforeSpread: {
                        type: 'boolean',
                        default: defaultOptions.checkKeyMustBeforeSpread,
                    },
                    warnOnDuplicates: {
                        type: 'boolean',
                        default: defaultOptions.warnOnDuplicates,
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const options = { ...defaultOptions, ...context.options[0] };
        const { checkFragmentShorthand } = options;
        const { checkKeyMustBeforeSpread } = options;
        const { warnOnDuplicates } = options;
        const reactPragma = pragmaUtil.getFromContext(context);
        const fragmentPragma = pragmaUtil.getFragmentFromContext(context);

        /**
         * @returns The result of this check.
         * @param attributes The attributes value.
         */
        function isKeyAfterSpread(attributes: Node<'JSXAttribute' | 'JSXSpreadAttribute'>[]) {
            let hasFoundSpread = false;
            return attributes.some((attribute) => {
                if (attribute.type === 'JSXSpreadAttribute') {
                    hasFoundSpread = true;
                    return false;
                }
                if (attribute.type !== 'JSXAttribute') {
                    return false;
                }
                return hasFoundSpread && propName(attribute) === 'key';
            });
        }

        /**
         * @param node The node to inspect.
         */
        function checkIteratorElement(node: Node) {
            if (node.type === 'JSXElement') {
                if (!hasProp(node.openingElement.attributes, 'key')) {
                    report(context, messages.missingIterKey, 'missingIterKey', { node });
                } else {
                    const attrs = node.openingElement.attributes;

                    if (checkKeyMustBeforeSpread && isKeyAfterSpread(attrs)) {
                        report(context, messages.keyBeforeSpread, 'keyBeforeSpread', { node });
                    }
                }
            } else if (checkFragmentShorthand && node.type === 'JSXFragment') {
                report(context, messages.missingIterKeyUsePrag, 'missingIterKeyUsePrag', {
                    node,
                    data: {
                        reactPrag: reactPragma,
                        fragPrag: fragmentPragma,
                    },
                });
            }
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         * @param [collected] The collected value.
         */
        function getReturnStatements(node: Node, collected?: Node<'ReturnStatement'>[]) {
            const returnStatements = collected || [];
            if (node.type === 'IfStatement') {
                if (node.consequent) {
                    getReturnStatements(node.consequent, returnStatements);
                }
                if (node.alternate) {
                    getReturnStatements(node.alternate, returnStatements);
                }
            } else if (node.type === 'ReturnStatement') {
                returnStatements.push(node);
            } else if (Array.isArray(node.body)) {
                node.body.forEach((item) => {
                    if (item.type === 'IfStatement') {
                        getReturnStatements(item, returnStatements);
                    }

                    if (item.type === 'ReturnStatement') {
                        returnStatements.push(item);
                    }
                });
            }

            return returnStatements;
        }

        /**
         * Checks if the given node is a function expression or arrow function,
         * and checks if there is a missing key prop in return statement's arguments
         * @param node The value to inspect.
         */
        function checkFunctionsBlockStatement(node: Node) {
            if (astUtil.isFunctionLikeExpression(node)) {
                if (node.body.type === 'BlockStatement') {
                    getReturnStatements(node.body)
                        .filter((returnStatement) => returnStatement && returnStatement.argument)
                        .forEach((returnStatement) => {
                            checkIteratorElement(returnStatement.argument!);
                        });
                }
            }
        }

        /**
         * Checks if the given node is an arrow function that has an JSX Element or JSX Fragment in its body,
         * and the JSX is missing a key prop
         * @param node The value to inspect.
         */
        function checkArrowFunctionWithJSX(
            node: Node<'FunctionExpression' | 'ArrowFunctionExpression'>,
        ) {
            const isArrFn = node && node.type === 'ArrowFunctionExpression';
            const shouldCheckNode = (n: Node) => n && (n.type === 'JSXElement' || n.type === 'JSXFragment');
            if (isArrFn && shouldCheckNode(node.body)) {
                checkIteratorElement(node.body);
            }
            if (node.body!.type === 'ConditionalExpression') {
                if (shouldCheckNode(node.body!.consequent)) {
                    checkIteratorElement(node.body!.consequent);
                }
                if (shouldCheckNode(node.body!.alternate)) {
                    checkIteratorElement(node.body!.alternate);
                }
            } else if (node.body!.type === 'LogicalExpression' && shouldCheckNode(node.body!.right)) {
                checkIteratorElement(node.body!.right);
            }
        }

        const childrenToArraySelector = `:matches(
      CallExpression
        [callee.object.object.name=${reactPragma}]
        [callee.object.property.name=Children]
        [callee.property.name=toArray],
      CallExpression
        [callee.object.name=Children]
        [callee.property.name=toArray]
    )`.replace(/\s/g, '');
        let isWithinChildrenToArray = false;

        const seen = new WeakSet<Node>();

        return {
            [childrenToArraySelector]() {
                isWithinChildrenToArray = true;
            },

            [`${childrenToArraySelector}:exit`]() {
                isWithinChildrenToArray = false;
            },

            'ArrayExpression, JSXElement > JSXElement': function onArrayExpressionJSXElementJSXElement(
                node: Node,
            ) {
                if (isWithinChildrenToArray) {
                    return;
                }

                const jsx = (
                    node.type === 'ArrayExpression' ? node.elements : node.parent.children
                )!.filter((x) => x && x.type === 'JSXElement');
                if (jsx.length === 0) {
                    return;
                }

                const map: Record<string, Node<'JSXAttribute' | 'JSXSpreadAttribute'>[]> = {};
                jsx.forEach((element) => {
                    const attrs = element!.openingElement!.attributes;
                    const keys = attrs.filter((x) => x.name && x.name.name === 'key');

                    if (keys.length === 0) {
                        if (node.type === 'ArrayExpression') {
                            report(context, messages.missingArrayKey, 'missingArrayKey', {
                                node: element!,
                            });
                        }
                    } else {
                        keys.forEach((attr) => {
                            const value = getText(context, attr.value);
                            if (!map[value]) {
                                map[value] = [];
                            }
                            map[value].push(attr);

                            if (checkKeyMustBeforeSpread && isKeyAfterSpread(attrs)) {
                                report(context, messages.keyBeforeSpread, 'keyBeforeSpread', {
                                    node: node.type === 'ArrayExpression' ? node : node.parent,
                                });
                            }
                        });
                    }
                });

                if (warnOnDuplicates) {
                    values(map)
                        .filter((v) => v.length > 1)
                        .forEach((v) => {
                            v.forEach((n) => {
                                if (!seen.has(n)) {
                                    seen.add(n);
                                    report(context, messages.nonUniqueKeys, 'nonUniqueKeys', {
                                        node: n,
                                    });
                                }
                            });
                        });
                }
            },

            JSXFragment(node: Node<'JSXFragment'>) {
                if (!checkFragmentShorthand || isWithinChildrenToArray) {
                    return;
                }

                if (node.parent.type === 'ArrayExpression') {
                    report(context, messages.missingArrayKeyUsePrag, 'missingArrayKeyUsePrag', {
                        node,
                        data: {
                            reactPrag: reactPragma,
                            fragPrag: fragmentPragma,
                        },
                    });
                }
            },

            // Array.prototype.map

            ['CallExpression[callee.type="MemberExpression"][callee.property.name="map"],'
            + '       CallExpression[callee.type="OptionalMemberExpression"][callee.property.name="map"],'
            + '       OptionalCallExpression[callee.type="MemberExpression"][callee.property.name="map"],'
            + '       OptionalCallExpression[callee.type="OptionalMemberExpression"][callee.property.name="map"]']:
                function onCallExpressionCalleeTypeMemberExpressionCalleePr(node: Node) {
                    if (isWithinChildrenToArray) {
                        return;
                    }

                    const fn = node.arguments!.length > 0 && node.arguments![0];
                    if (!fn || !astUtil.isFunctionLikeExpression(fn as Node)) {
                        return;
                    }

                    checkArrowFunctionWithJSX(
                        fn as Node<'FunctionExpression' | 'ArrowFunctionExpression'>,
                    );

                    checkFunctionsBlockStatement(fn as Node);
                },

            // Array.from
            'CallExpression[callee.type="MemberExpression"][callee.property.name="from"]':
                function onCallExpressionCalleeTypeMemberExpressionCalleePropertyNameFrom(node: Node) {
                    if (isWithinChildrenToArray) {
                        return;
                    }

                    const fn = node.arguments!.length > 1 && node.arguments![1];
                    if (!astUtil.isFunctionLikeExpression(fn as Node)) {
                        return;
                    }

                    checkArrowFunctionWithJSX(
                        fn as Node<'FunctionExpression' | 'ArrowFunctionExpression'>,
                    );

                    checkFunctionsBlockStatement(fn as Node);
                },
        };
    },
};

export default rule;
