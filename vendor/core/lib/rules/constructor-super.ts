/**
 * @file A rule to verify `super()` callings in constructor.
 * @author Toru Nagashima
 */
import type {
    CodePath, CodePathSegment, LegacyRule, Node,
} from '../../../types';

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks all segments in a set and returns true if any are reachable.
 * @param segments The segments to check.
 * @returns True if any segment is reachable; false otherwise.
 */
function isAnySegmentReachable(segments: Set<CodePathSegment>) {
    return Array.from(segments).some((segment) => segment.reachable);
}

/**
 * Checks whether or not a given node is a constructor.
 * @param node A node to check. This node type is one of
 *   `Program`, `FunctionDeclaration`, `FunctionExpression`, and
 *   `ArrowFunctionExpression`.
 * @returns `true` if the node is a constructor.
 */
function isConstructorFunction(node: Node) {
    return (
        node.type === 'FunctionExpression'
        && node.parent.type === 'MethodDefinition'
        && node.parent.kind === 'constructor'
    );
}

/**
 * Checks whether a given node can be a constructor or not.
 * @param node A node to check.
 * @returns `true` if the node can be a constructor.
 */
function isPossibleConstructor(node: Node | null): boolean {
    if (!node) {
        return false;
    }

    switch (node.type) {
        case 'ClassExpression':
        case 'FunctionExpression':
        case 'ThisExpression':
        case 'MemberExpression':
        case 'CallExpression':
        case 'NewExpression':
        case 'ChainExpression':
        case 'YieldExpression':
        case 'TaggedTemplateExpression':
        case 'MetaProperty':
            return true;

        case 'Identifier':
            return node.name !== 'undefined';

        case 'AssignmentExpression':
            if (['=', '&&='].includes(node.operator)) {
                return isPossibleConstructor(node.right);
            }

            if (['||=', '??='].includes(node.operator)) {
                return isPossibleConstructor(node.left) || isPossibleConstructor(node.right);
            }

            /**
             * All other assignment operators are mathematical assignment operators (arithmetic or bitwise).
             * An assignment expression with a mathematical operator can either evaluate to a primitive value,
             * or throw, depending on the operands. Thus, it cannot evaluate to a constructor function.
             */
            return false;

        case 'LogicalExpression':
            /**
             * If the && operator short-circuits, the left side was falsy and therefore not a constructor, and if
             * it doesn't short-circuit, it takes the value from the right side, so the right side must always be a
             * possible constructor. A future improvement could verify that the left side could be truthy by
             * excluding falsy literals.
             */
            if (node.operator === '&&') {
                return isPossibleConstructor(node.right);
            }

            return isPossibleConstructor(node.left) || isPossibleConstructor(node.right);

        case 'ConditionalExpression':
            return (
                isPossibleConstructor(node.alternate) || isPossibleConstructor(node.consequent)
            );

        case 'SequenceExpression': {
            const lastExpression = node.expressions[node.expressions.length - 1];

            return isPossibleConstructor(lastExpression!);
        }

        default:
            return false;
    }
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Require `super()` calls in constructors',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/constructor-super',
        },

        schema: [],

        messages: {
            missingSome: "Lacked a call of 'super()' in some code paths.",
            missingAll: "Expected to call 'super()'.",

            duplicate: "Unexpected duplicate 'super()'.",
            badSuper: "Unexpected 'super()' because 'super' is not a constructor.",
            unexpected: "Unexpected 'super()'.",
        },
    },

    create(context) {
        /**
         * {{hasExtends: boolean, scope: Scope, codePath: CodePath}[]}
         * Information for each constructor.
         * - upper:      Information of the upper constructor.
         * - hasExtends: A flag which shows whether own class has a valid `extends`
         *               part.
         * - scope:      The scope of own class.
         * - codePath:   The code path object of the constructor.
         */
        interface FunctionState {
            upper: FunctionState | null;
            isConstructor: boolean;
            hasExtends: boolean;
            superIsConstructor: boolean;
            codePath: CodePath;
            currentSegments: Set<CodePathSegment>;
        }
        let funcInfo: FunctionState | null = null;

        /**
         * {Map<string, {calledInSomePaths: boolean, calledInEveryPaths: boolean}>}
         * Information for each code path segment.
         * - calledInSomePaths:  A flag of be called `super()` in some code paths.
         * - calledInEveryPaths: A flag of be called `super()` in all code paths.
         * - validNodes:
         */
        let segInfoMap: Record<
            string,
            { calledInSomePaths: boolean; calledInEveryPaths: boolean; validNodes: Node[] }
        > = Object.create(null);

        /**
         * Gets the flag which shows `super()` is called in some paths.
         * @param segment A code path segment to get.
         * @returns The flag which shows `super()` is called in some paths
         */
        function isCalledInSomePath(segment: CodePathSegment) {
            return segment.reachable && segInfoMap[segment.id]!.calledInSomePaths;
        }

        /**
         * Gets the flag which shows `super()` is called in all paths.
         * @param segment A code path segment to get.
         * @returns The flag which shows `super()` is called in all paths.
         */
        function isCalledInEveryPath(segment: CodePathSegment) {
            /**
             * If specific segment is the looped segment of the current segment,
             * skip the segment.
             * If not skipped, this never becomes true after a loop.
             */
            if (
                segment.nextSegments.length === 1
                && segment!.nextSegments[0]!.isLoopedPrevSegment(segment)
            ) {
                return true;
            }
            return segment.reachable && segInfoMap[segment.id]!.calledInEveryPaths;
        }

        return {
            /**
             * Stacks a constructor information.
             * @param codePath A code path which was started.
             * @param node The current node.
             */
            onCodePathStart(codePath: CodePath, node: Node) {
                if (isConstructorFunction(node)) {
                    // Class > ClassBody > MethodDefinition > FunctionExpression
                    // The constructor predicate establishes the class/method/function parent chain.
                    const classNode = node.parent.parent.parent as Node<
                        'ClassDeclaration' | 'ClassExpression'
                    >;
                    const { superClass } = classNode;

                    funcInfo = {
                        upper: funcInfo,
                        isConstructor: true,
                        hasExtends: Boolean(superClass),
                        superIsConstructor: isPossibleConstructor(superClass!),
                        codePath,
                        currentSegments: new Set(),
                    };
                } else {
                    funcInfo = {
                        upper: funcInfo,
                        isConstructor: false,
                        hasExtends: false,
                        superIsConstructor: false,
                        codePath,
                        currentSegments: new Set(),
                    };
                }
            },

            /**
             * Pops a constructor information.
             * And reports if `super()` lacked.
             * @param codePath A code path which was ended.
             * @param node The current node.
             */
            onCodePathEnd(codePath: CodePath, node: Node) {
                const { hasExtends } = funcInfo!;

                // Pop.
                funcInfo = funcInfo!.upper;

                if (!hasExtends) {
                    return;
                }

                // Reports if `super()` lacked.
                const segments = codePath.returnedSegments;
                const calledInEveryPaths = segments.every(isCalledInEveryPath);
                const calledInSomePaths = segments.some(isCalledInSomePath);

                if (!calledInEveryPaths) {
                    context.report({
                        messageId: calledInSomePaths ? 'missingSome' : 'missingAll',
                        node: node.parent,
                    });
                }
            },

            /**
             * Initialize information of a given code path segment.
             * @param segment A code path segment to initialize.
             */
            onCodePathSegmentStart(segment: CodePathSegment) {
                funcInfo!.currentSegments.add(segment);

                if (!(funcInfo && funcInfo.isConstructor && funcInfo.hasExtends)) {
                    return;
                }

                // Initialize info.
                const info: (typeof segInfoMap)[string] = {
                    calledInSomePaths: false,
                    calledInEveryPaths: false,
                    validNodes: [],
                };
                segInfoMap[segment.id] = info;

                // When there are previous segments, aggregates these.
                const { prevSegments } = segment;

                if (prevSegments.length > 0) {
                    info.calledInSomePaths = prevSegments.some(isCalledInSomePath);
                    info.calledInEveryPaths = prevSegments.every(isCalledInEveryPath);
                }
            },

            onUnreachableCodePathSegmentStart(segment: CodePathSegment) {
                funcInfo!.currentSegments.add(segment);
            },

            onUnreachableCodePathSegmentEnd(segment: CodePathSegment) {
                funcInfo!.currentSegments.delete(segment);
            },

            onCodePathSegmentEnd(segment: CodePathSegment) {
                funcInfo!.currentSegments.delete(segment);
            },

            /**
             * Update information of the code path segment when a code path was
             * looped.
             * @param fromSegment The code path segment of the
             *      end of a loop.
             * @param toSegment A code path segment of the head
             *      of a loop.
             */
            onCodePathSegmentLoop(fromSegment: CodePathSegment, toSegment: CodePathSegment) {
                if (!(funcInfo && funcInfo.isConstructor && funcInfo.hasExtends)) {
                    return;
                }

                // Update information inside of the loop.
                const isRealLoop = toSegment.prevSegments.length >= 2;

                funcInfo.codePath.traverseSegments(
                    { first: toSegment, last: fromSegment },
                    (segment: CodePathSegment) => {
                        const segmentInfo = segInfoMap[segment.id];
                        const { prevSegments } = segment;

                        // Updates flags.
                        segmentInfo!.calledInSomePaths = prevSegments.some(isCalledInSomePath);
                        segmentInfo!.calledInEveryPaths = prevSegments.every(isCalledInEveryPath);

                        // If flags become true anew, reports the valid nodes.
                        if (segmentInfo!.calledInSomePaths || isRealLoop) {
                            const nodes = segmentInfo!.validNodes;

                            segmentInfo!.validNodes = [];

                            for (let i = 0; i < nodes.length; i += 1) {
                                const node = nodes[i]!;

                                context.report({
                                    messageId: 'duplicate',
                                    node,
                                });
                            }
                        }
                    },
                );
            },

            /**
             * Checks for a call of `super()`.
             * @param node A CallExpression node to check.
             */
            'CallExpression:exit': function onCallExpressionExit(node: Node<'CallExpression'>) {
                if (!(funcInfo && funcInfo.isConstructor)) {
                    return;
                }

                // Skips except `super()`.
                if (node.callee.type !== 'Super') {
                    return;
                }

                // Reports if needed.
                if (funcInfo.hasExtends) {
                    const segments = funcInfo.currentSegments;
                    let duplicate = false;
                    const info = Array.from(segments).reduce<(typeof segInfoMap)[string] | null
                    >((previous, segment) => {
                        if (segment.reachable) {
                            const segmentInfo = segInfoMap[segment.id]!;

                            duplicate = duplicate || segmentInfo.calledInSomePaths;
                            segmentInfo.calledInEveryPaths = true;
                            segmentInfo.calledInSomePaths = segmentInfo.calledInEveryPaths;
                            return segmentInfo;
                        }
                        return previous;
                    }, null);

                    if (info) {
                        if (duplicate) {
                            context.report({
                                messageId: 'duplicate',
                                node,
                            });
                        } else if (!funcInfo.superIsConstructor) {
                            context.report({
                                messageId: 'badSuper',
                                node,
                            });
                        } else {
                            info.validNodes.push(node);
                        }
                    }
                } else if (isAnySegmentReachable(funcInfo.currentSegments)) {
                    context.report({
                        messageId: 'unexpected',
                        node,
                    });
                }
            },

            /**
             * Set the mark to the returned path as `super()` was called.
             * @param node A ReturnStatement node to check.
             */
            ReturnStatement(node: Node<'ReturnStatement'>) {
                if (!(funcInfo && funcInfo.isConstructor && funcInfo.hasExtends)) {
                    return;
                }

                // Skips if no argument.
                if (!node.argument) {
                    return;
                }

                // Returning argument is a substitute of 'super()'.
                const segments = funcInfo.currentSegments;

                Array.from(segments).forEach((segment) => {
                    if (segment.reachable) {
                        const segmentInfo = segInfoMap[segment.id];

                        segmentInfo!.calledInEveryPaths = true;
                        segmentInfo!.calledInSomePaths = segmentInfo!.calledInEveryPaths;
                    }
                });
            },

            /**
             * Resets state.
             */
            'Program:exit': function onProgramExit() {
                segInfoMap = Object.create(null);
            },
        };
    },
};

export default rule;
