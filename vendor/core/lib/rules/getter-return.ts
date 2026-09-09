/**
 * @file Enforces that a return statement is present in property getters.
 * @author Aladdin-ADD(hh_2013@foxmail.com)
 */
import dependency0 from './utils/ast-utils';
import type {
    CodePath, CodePathSegment, LegacyRule, Node,
} from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const TARGET_NODE_TYPE = /^(?:Arrow)?FunctionExpression$/u;

/**
 * Checks all segments in a set and returns true if any are reachable.
 * @param segments The segments to check.
 * @returns True if any segment is reachable; false otherwise.
 */
function isAnySegmentReachable(segments: Iterable<CodePathSegment>) {
    return Array.from(segments).some((segment) => segment.reachable);
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ allowImplicit?: boolean }?]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Enforce `return` statements in getters',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/getter-return',
        },

        fixable: null,

        schema: [
            {
                type: 'object',
                properties: {
                    allowImplicit: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            expected: 'Expected to return a value in {{name}}.',
            expectedAlways: 'Expected {{name}} to always return a value.',
        },
    },

    create(context) {
        const options = context.options[0] || { allowImplicit: false };
        const { sourceCode } = context;

        interface FuncInfoState {
            hasReturn: boolean;
            upper: null | FuncInfoState;
            codePath: null | CodePath;
            shouldCheck: boolean;
            node: null | Node;
            currentSegments: Set<CodePathSegment>;
        }
        let funcInfo: FuncInfoState = {
            upper: null,
            codePath: null,
            hasReturn: false,
            shouldCheck: false,
            node: null,
            currentSegments: new Set(),
        };

        /**
         * Checks whether or not the last code path segment is reachable.
         * Then reports this function if the segment is reachable.
         *
         * If the last code path segment is reachable, there are paths which are not
         * returned or thrown.
         * @param node A node to check.
         */
        function checkLastSegment(
            node: Node<'ArrowFunctionExpression' | 'FunctionExpression'>,
        ) {
            if (funcInfo.shouldCheck && isAnySegmentReachable(funcInfo.currentSegments)) {
                context.report({
                    node,
                    loc: astUtils.getFunctionHeadLoc(node, sourceCode),
                    messageId: funcInfo.hasReturn ? 'expectedAlways' : 'expected',
                    data: {
                        name: astUtils.getFunctionNameWithKind(funcInfo.node!),
                    },
                });
            }
        }

        /**
         * Checks whether a node means a getter function.
         * @param node a node to check.
         * @returns if node means a getter, return true; else return false.
         */
        function isGetter(node: Node) {
            const { parent } = node;

            if (
                TARGET_NODE_TYPE.test(node.type)
                && astUtils.isFunction(node)
                && node.body.type === 'BlockStatement'
            ) {
                if (parent.kind === 'get') {
                    return true;
                }
                if (
                    parent.type === 'Property'
                    && astUtils.getStaticPropertyName(parent) === 'get'
                    && parent.parent.type === 'ObjectExpression'
                ) {
                    // Object.defineProperty() or Reflect.defineProperty()
                    if (parent.parent.parent.type === 'CallExpression') {
                        const callNode = parent.parent.parent.callee;

                        if (
                            astUtils.isSpecificMemberAccess(
                                callNode,
                                'Object',
                                'defineProperty',
                            )
                            || astUtils.isSpecificMemberAccess(
                                callNode,
                                'Reflect',
                                'defineProperty',
                            )
                        ) {
                            return true;
                        }
                    }

                    // Object.defineProperties() or Object.create()
                    if (
                        parent.parent.parent.type === 'Property'
                        && parent.parent.parent.parent.type === 'ObjectExpression'
                        && parent.parent.parent.parent.parent.type === 'CallExpression'
                    ) {
                        const callNode = parent.parent.parent.parent.parent.callee;

                        return (
                            astUtils.isSpecificMemberAccess(
                                callNode,
                                'Object',
                                'defineProperties',
                            ) || astUtils.isSpecificMemberAccess(callNode, 'Object', 'create')
                        );
                    }
                }
            }
            return false;
        }
        return {
            // Stacks this function's information.
            onCodePathStart(codePath: CodePath, node: Node) {
                funcInfo = {
                    upper: funcInfo,
                    codePath,
                    hasReturn: false,
                    shouldCheck: isGetter(node),
                    node,
                    currentSegments: new Set(),
                };
            },

            // Pops this function's information.
            onCodePathEnd() {
                funcInfo = funcInfo.upper!;
            },
            onUnreachableCodePathSegmentStart(segment: CodePathSegment) {
                funcInfo.currentSegments.add(segment);
            },

            onUnreachableCodePathSegmentEnd(segment: CodePathSegment) {
                funcInfo.currentSegments.delete(segment);
            },

            onCodePathSegmentStart(segment: CodePathSegment) {
                funcInfo.currentSegments.add(segment);
            },

            onCodePathSegmentEnd(segment: CodePathSegment) {
                funcInfo.currentSegments.delete(segment);
            },

            // Checks the return statement is valid.
            ReturnStatement(node: Node<'ReturnStatement'>) {
                if (funcInfo.shouldCheck) {
                    funcInfo.hasReturn = true;

                    // if allowImplicit: false, should also check node.argument
                    if (!options.allowImplicit && !node.argument) {
                        context.report({
                            node,
                            messageId: 'expected',
                            data: {
                                name: astUtils.getFunctionNameWithKind(funcInfo.node!),
                            },
                        });
                    }
                }
            },

            // Reports a given function if the last path is reachable.
            'FunctionExpression:exit': checkLastSegment,
            'ArrowFunctionExpression:exit': checkLastSegment,
        };
    },
};

export default rule;
