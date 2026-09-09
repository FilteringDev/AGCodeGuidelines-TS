/**
 * @file Checks for unreachable code due to return, throws, break, and continue.
 * @author Joel Feenstra
 */
import type {
    CodePathSegment, LegacyRule, Node, SourceCode, Token,
} from '../../../types';

type ConstructorInfo = { upper: ConstructorInfo | null; hasSuperCall: boolean };

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * upper Info about the constructor that encloses this constructor.
 * hasSuperCall The flag about having `super()` expressions.
 */

/**
 * Checks whether or not a given variable declarator has the initializer.
 * @param node A VariableDeclarator node to check.
 * @returns `true` if the node has the initializer.
 */
function isInitialized(node: Node<'VariableDeclarator'>) {
    return Boolean(node.init);
}

/**
 * Checks all segments in a set and returns true if all are unreachable.
 * @param segments The segments to check.
 * @returns True if all segments are unreachable; false otherwise.
 */
function areAllSegmentsUnreachable(segments: Set<CodePathSegment>) {
    return !Array.from(segments).some((segment) => segment.reachable);
}

/**
 * The class to distinguish consecutive unreachable statements.
 */
class ConsecutiveRange {
    declare private sourceCode: SourceCode;

    declare startNode: Node | null;

    declare private endNode: Node | null;

    constructor(sourceCode: SourceCode) {
        this.sourceCode = sourceCode;
        this.startNode = null;
        this.endNode = null;
    }

    /**
     * The location object of this range.
     * @returns The first and last source positions.
     */
    getLocation() {
        return {
            start: this.startNode!.loc.start,
            end: this.endNode!.loc.end,
        };
    }

    /**
     * Tests whether this range is empty.
     * @returns Whether no source nodes have been collected.
     */
    isEmpty() {
        return !(this.startNode && this.endNode);
    }

    /**
     * Checks whether the given node is inside of this range.
     * @param node The node to check.
     * @returns `true` if the node is inside of this range.
     */
    contains(node: Node | Token) {
        return (
            node.range[0] >= this.startNode!.range[0] && node.range[1] <= this.endNode!.range[1]
        );
    }

    /**
     * Checks whether the given node is consecutive to this range.
     * @param node The node to check.
     * @returns `true` if the node is consecutive to this range.
     */
    isConsecutive(node: Node) {
        return this.contains(this.sourceCode.getTokenBefore(node)!);
    }

    /**
     * Merges the given node to this range.
     * @param node The node to merge.
     */
    merge(node: Node) {
        this.endNode = node;
    }

    /**
     * Resets this range by the given node or null.
     * @param node The node to reset, or null.
     */
    reset(node: Node | null) {
        this.endNode = node;
        this.startNode = this.endNode;
    }
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description:
                'Disallow unreachable code after `return`, `throw`, `continue`, and `break` statements',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-unreachable',
        },

        schema: [],

        messages: {
            unreachableCode: 'Unreachable code.',
        },
    },

    create(context) {
        let constructorInfo: ConstructorInfo | null = null;

        const range: ConsecutiveRange = new ConsecutiveRange(context.sourceCode);

        const codePathSegments: Array<Set<CodePathSegment>> = [];

        let currentCodePathSegments: Set<CodePathSegment> = new Set();

        /**
         * Reports a given node if it's unreachable.
         * @param node A statement node to report.
         */
        function reportIfUnreachable(node?: Node) {
            let nextNode = null;

            if (
                node
                && (node.type === 'PropertyDefinition'
                    || areAllSegmentsUnreachable(currentCodePathSegments))
            ) {
                // Store this statement to distinguish consecutive statements.
                if (range.isEmpty()) {
                    range.reset(node);
                    return;
                }

                // Skip if this statement is inside of the current range.
                if (range.contains(node)) {
                    return;
                }

                // Merge if this statement is consecutive to the current range.
                if (range.isConsecutive(node)) {
                    range.merge(node);
                    return;
                }

                nextNode = node;
            }

            /**
             * Report the current range since this statement is reachable or is
             * not consecutive to the current range.
             */
            if (!range.isEmpty()) {
                context.report({
                    messageId: 'unreachableCode',
                    loc: range.getLocation(),
                    node: range.startNode!,
                });
            }

            // Update the current range.
            range.reset(nextNode);
        }

        return {
            // Manages the current code path.
            onCodePathStart() {
                codePathSegments.push(currentCodePathSegments);
                currentCodePathSegments = new Set();
            },

            onCodePathEnd() {
                currentCodePathSegments = codePathSegments.pop()!;
            },

            onUnreachableCodePathSegmentStart(segment: CodePathSegment) {
                currentCodePathSegments.add(segment);
            },

            onUnreachableCodePathSegmentEnd(segment: CodePathSegment) {
                currentCodePathSegments.delete(segment);
            },

            onCodePathSegmentEnd(segment: CodePathSegment) {
                currentCodePathSegments.delete(segment);
            },

            onCodePathSegmentStart(segment: CodePathSegment) {
                currentCodePathSegments.add(segment);
            },

            // Registers for all statement nodes (excludes FunctionDeclaration).
            BlockStatement: reportIfUnreachable,
            BreakStatement: reportIfUnreachable,
            ClassDeclaration: reportIfUnreachable,
            ContinueStatement: reportIfUnreachable,
            DebuggerStatement: reportIfUnreachable,
            DoWhileStatement: reportIfUnreachable,
            ExpressionStatement: reportIfUnreachable,
            ForInStatement: reportIfUnreachable,
            ForOfStatement: reportIfUnreachable,
            ForStatement: reportIfUnreachable,
            IfStatement: reportIfUnreachable,
            ImportDeclaration: reportIfUnreachable,
            LabeledStatement: reportIfUnreachable,
            ReturnStatement: reportIfUnreachable,
            SwitchStatement: reportIfUnreachable,
            ThrowStatement: reportIfUnreachable,
            TryStatement: reportIfUnreachable,

            VariableDeclaration(node: Node<'VariableDeclaration'>) {
                if (node.kind !== 'var' || node.declarations.some(isInitialized)) {
                    reportIfUnreachable(node);
                }
            },

            WhileStatement: reportIfUnreachable,
            WithStatement: reportIfUnreachable,
            ExportNamedDeclaration: reportIfUnreachable,
            ExportDefaultDeclaration: reportIfUnreachable,
            ExportAllDeclaration: reportIfUnreachable,

            'Program:exit': function onProgramExit() {
                reportIfUnreachable();
            },

            /**
             * Instance fields defined in a subclass are never created if the constructor of the subclass
             * doesn't call `super()`, so their definitions are unreachable code.
             */
            "MethodDefinition[kind='constructor']":
                function onMethodDefinitionKindConstructor() {
                    constructorInfo = {
                        upper: constructorInfo,
                        hasSuperCall: false,
                    };
                },
            "MethodDefinition[kind='constructor']:exit":
                function onMethodDefinitionKindConstructorExit(node: Node<'MethodDefinition'>) {
                    const { hasSuperCall } = constructorInfo!;

                    constructorInfo = constructorInfo!.upper;

                    // skip typescript constructors without the body
                    if (!node.value.body) {
                        return;
                    }

                    // A constructor method belongs to the enclosing class body.
                    const classDefinition = node.parent.parent as Node<
                        'ClassDeclaration' | 'ClassExpression'
                    >;

                    if (classDefinition.superClass && !hasSuperCall) {
                        classDefinition.body.body.forEach((element) => {
                            if (element.type === 'PropertyDefinition' && !element.static) {
                                reportIfUnreachable(element);
                            }
                        });
                    }
                },
            'CallExpression > Super.callee': function onCallExpressionSuperCallee() {
                if (constructorInfo) {
                    constructorInfo.hasSuperCall = true;
                }
            },
        };
    },
};

export default rule;
