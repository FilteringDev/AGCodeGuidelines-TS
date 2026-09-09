/**
 * @file A rule to disallow using `this`/`super` before `super()`.
 * @author Toru Nagashima
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

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow `this`/`super` before calling `super()` in constructors',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-this-before-super',
        },

        schema: [],

        messages: {
            noBeforeSuper: "'{{kind}}' is not allowed before 'super()'.",
        },
    },

    create(context) {
        /**
         * Information for each constructor.
         * - upper:      Information of the upper constructor.
         * - hasExtends: A flag which shows whether the owner class has a valid
         *   `extends` part.
         * - scope:      The scope of the owner class.
         * - codePath:   The code path of this constructor.
         */
        interface FuncInfoState {
            upper: FuncInfoState | null;
            isConstructor: boolean;
            hasExtends: boolean;
            codePath: CodePath;
            currentSegments: Set<CodePathSegment>;
        }
        let funcInfo: FuncInfoState | null = null;

        /**
         * Information for each code path segment.
         * Each key is the id of a code path segment.
         * Each value is an object:
         * - superCalled:  The flag which shows `super()` called in all code paths.
         * - invalidNodes: The array of invalid ThisExpression and Super nodes.
         */
        let segInfoMap: Record<string, {
            superCalled: boolean;
            invalidNodes: Node<'Super' | 'ThisExpression'>[];
        }> = Object.create(null);

        /**
         * Gets whether or not `super()` is called in a given code path segment.
         * @param segment A code path segment to get.
         * @returns `true` if `super()` is called.
         */
        function isCalled(segment: CodePathSegment) {
            return !segment.reachable || segInfoMap[segment.id]!.superCalled;
        }

        /**
         * Checks whether or not this is in a constructor.
         * @returns `true` if this is in a constructor.
         */
        function isInConstructorOfDerivedClass() {
            return Boolean(funcInfo && funcInfo.isConstructor && funcInfo.hasExtends);
        }

        /**
         * Determines if every segment in a set has been called.
         * @param segments The segments to search.
         * @returns True if every segment has been called; false otherwise.
         */
        function isEverySegmentCalled(segments: Set<CodePathSegment>) {
            return !Array.from(segments).some((segment) => !isCalled(segment));
        }

        /**
         * Checks whether or not this is before `super()` is called.
         * @returns `true` if this is before `super()` is called.
         */
        function isBeforeCallOfSuper() {
            return (
                isInConstructorOfDerivedClass()
                && !isEverySegmentCalled(funcInfo!.currentSegments)
            );
        }

        /**
         * Sets a given node as invalid.
         * @param node A node to set as invalid. This is one of
         *      a ThisExpression and a Super.
         */
        function setInvalid(node: Node<'Super' | 'ThisExpression'>) {
            const segments = funcInfo!.currentSegments;

            Array.from(segments).forEach((segment) => {
                if (segment.reachable) {
                    segInfoMap[segment.id]!.invalidNodes.push(node);
                }
            });
        }

        /**
         * Sets the current segment as `super` was called.
         */
        function setSuperCalled() {
            const segments = funcInfo!.currentSegments;

            Array.from(segments).forEach((segment) => {
                if (segment.reachable) {
                    segInfoMap[segment.id]!.superCalled = true;
                }
            });
        }

        return {
            /**
             * Adds information of a constructor into the stack.
             * @param codePath A code path which was started.
             * @param node The current node.
             */
            onCodePathStart(codePath: CodePath, node: Node) {
                if (isConstructorFunction(node)) {
                    // Class > ClassBody > MethodDefinition > FunctionExpression
                    // Constructor functions are values of methods in class bodies.
                    const classNode = node.parent.parent.parent as Node<
                        'ClassDeclaration' | 'ClassExpression'
                    >;

                    funcInfo = {
                        upper: funcInfo,
                        isConstructor: true,
                        hasExtends: Boolean(
                            classNode.superClass
                                && !astUtils.isNullOrUndefined(classNode.superClass),
                        ),
                        codePath,
                        currentSegments: new Set(),
                    };
                } else {
                    funcInfo = {
                        upper: funcInfo,
                        isConstructor: false,
                        hasExtends: false,
                        codePath,
                        currentSegments: new Set(),
                    };
                }
            },

            /**
             * Removes the top of stack item.
             *
             * And this traverses all segments of this code path then reports every
             * invalid node.
             * @param codePath A code path which was ended.
             */
            onCodePathEnd(codePath: CodePath) {
                const isDerivedClass = funcInfo!.hasExtends;

                funcInfo = funcInfo!.upper;
                if (!isDerivedClass) {
                    return;
                }

                codePath.traverseSegments((segment: CodePathSegment, controller) => {
                    const info = segInfoMap[segment.id];

                    for (let i = 0; i < info!.invalidNodes.length; i += 1) {
                        const invalidNode = info!.invalidNodes[i];

                        context.report({
                            messageId: 'noBeforeSuper',
                            node: invalidNode!,
                            data: {
                                kind: invalidNode!.type === 'Super' ? 'super' : 'this',
                            },
                        });
                    }

                    if (info!.superCalled) {
                        controller.skip();
                    }
                });
            },

            /**
             * Initialize information of a given code path segment.
             * @param segment A code path segment to initialize.
             */
            onCodePathSegmentStart(segment: CodePathSegment) {
                funcInfo!.currentSegments.add(segment);

                if (!isInConstructorOfDerivedClass()) {
                    return;
                }

                // Initialize info.
                segInfoMap[segment.id] = {
                    superCalled:
                        segment.prevSegments.length > 0 && segment.prevSegments.every(isCalled),
                    invalidNodes: [],
                };
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
                if (!isInConstructorOfDerivedClass()) {
                    return;
                }

                // Update information inside of the loop.
                funcInfo!.codePath.traverseSegments(
                    { first: toSegment, last: fromSegment },
                    (segment: CodePathSegment, controller) => {
                        const info = segInfoMap[segment.id];

                        if (info!.superCalled) {
                            info!.invalidNodes = [];
                            controller.skip();
                        } else if (
                            segment.prevSegments.length > 0
                            && segment.prevSegments.every(isCalled)
                        ) {
                            info!.superCalled = true;
                            info!.invalidNodes = [];
                        }
                    },
                );
            },

            /**
             * Reports if this is before `super()`.
             * @param node A target node.
             */
            ThisExpression(node: Node<'ThisExpression'>) {
                if (isBeforeCallOfSuper()) {
                    setInvalid(node);
                }
            },

            /**
             * Reports if this is before `super()`.
             * @param node A target node.
             */
            Super(node: Node<'Super'>) {
                if (!astUtils.isCallee(node) && isBeforeCallOfSuper()) {
                    setInvalid(node);
                }
            },

            /**
             * Marks `super()` called.
             * @param node A target node.
             */
            'CallExpression:exit': function onCallExpressionExit(node: Node<'CallExpression'>) {
                if (node.callee.type === 'Super' && isBeforeCallOfSuper()) {
                    setSuperCalled();
                }
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
