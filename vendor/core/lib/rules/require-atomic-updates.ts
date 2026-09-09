/**
 * @file disallow assignments that can lead to race conditions due to usage of `await` or `yield`
 * @author Teddy Katz
 * @author Toru Nagashima
 */
import type {
    CodePath,
    CodePathSegment,
    LegacyRule,
    Node,
    Reference,
    Scope,
    Variable,
} from '../../../types';

/**
 * Make the map from identifiers to each reference.
 * @param scope The scope to get references.
 * @param [outReferenceMap] The map from identifier nodes to each reference object.
 * @returns `referenceMap`.
 */
function createReferenceMap(
    scope: Scope,
    outReferenceMap: Map<Node<'Identifier'>, Reference> = new Map(),
) {
    scope.references.forEach((reference) => {
        if (reference.resolved === null) {
            return;
        }

        outReferenceMap.set(reference.identifier, reference);
    });
    scope.childScopes.forEach((childScope) => {
        if (childScope.type !== 'function') {
            createReferenceMap(childScope, outReferenceMap);
        }
    });

    return outReferenceMap;
}

/**
 * Get `reference.writeExpr` of a given reference.
 * If it's the read reference of MemberExpression in LHS, returns RHS in order to address `a.b = await a`
 * @param reference The reference to get.
 * @returns The `reference.writeExpr`.
 */
function getWriteExpr(reference: Reference) {
    if (reference.writeExpr) {
        return reference.writeExpr;
    }
    let node: Node<'Identifier'> | Node<'MemberExpression'> = reference.identifier;

    while (node) {
        const t = node.parent.type;

        if (t === 'AssignmentExpression' && node.parent.left === node) {
            return node.parent.right;
        }
        if (t === 'MemberExpression' && node.parent.object === node) {
            node = node.parent;
        } else {
            break;
        }
    }

    return null;
}

/**
 * Checks if an expression is a variable that can only be observed within the given function.
 * @param variable The variable to check
 * @param isMemberAccess If `true` then this is a member access.
 * @returns `true` if the variable is local to the given function, and is never referenced in a closure.
 */
function isLocalVariableWithoutEscape(variable: Variable | null, isMemberAccess: boolean) {
    if (!variable) {
        return false; // A global variable which was not defined.
    }

    // If the reference is a property access and the variable is a parameter, it handles the variable is not local.
    if (isMemberAccess && variable.defs.some((d) => d.type === 'Parameter')) {
        return false;
    }

    const functionScope = variable.scope.variableScope;

    return variable.references.every(
        (reference: Reference) => reference.from.variableScope === functionScope,
    );
}

/**
 * Represents segment information.
 */
class SegmentInfo {
    declare private info: WeakMap<
        CodePathSegment,
        {
            outdatedReadVariables: Set<Variable>;
            freshReadVariables: Set<Variable>;
        }
    >;

    constructor() {
        this.info = new WeakMap();
    }

    /**
     * Initialize the segment information.
     * @param segment The segment to initialize.
     */
    initialize(segment: CodePathSegment) {
        const outdatedReadVariables = new Set<Variable>();
        const freshReadVariables = new Set<Variable>();

        segment.prevSegments.forEach((prevSegment) => {
            const info = this.info.get(prevSegment);

            if (info) {
                info.outdatedReadVariables.forEach(Set.prototype.add, outdatedReadVariables);
                info.freshReadVariables.forEach(Set.prototype.add, freshReadVariables);
            }
        });

        this.info.set(segment, { outdatedReadVariables, freshReadVariables });
    }

    /**
     * Mark a given variable as read on given segments.
     * @param segments The segments that it read the variable on.
     * @param variable The variable to be read.
     */
    markAsRead(segments: Iterable<CodePathSegment>, variable: Variable) {
        Array.from(segments).forEach((segment) => {
            const info = this.info.get(segment);

            if (info) {
                info.freshReadVariables.add(variable);

                // If a variable is freshly read again, then it's no more out-dated.
                info.outdatedReadVariables.delete(variable);
            }
        });
    }

    /**
     * Move `freshReadVariables` to `outdatedReadVariables`.
     * @param segments The segments to process.
     */
    makeOutdated(segments: Iterable<CodePathSegment>) {
        Array.from(segments).forEach((segment) => {
            const info = this.info.get(segment);

            if (info) {
                info.freshReadVariables.forEach(Set.prototype.add, info.outdatedReadVariables);
                info.freshReadVariables.clear();
            }
        });
    }

    /**
     * Check if a given variable is outdated on the current segments.
     * @param segments The current segments.
     * @param variable The variable to check.
     * @returns `true` if the variable is outdated on the segments.
     */
    isOutdated(segments: Iterable<CodePathSegment>, variable: Variable) {
        return Array.from(segments).some((segment) => {
            const info = this.info.get(segment);
            return Boolean(info && info.outdatedReadVariables.has(variable));
        });
    }
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ allowProperties?: boolean }?]> = {
    meta: {
        type: 'problem',

        docs: {
            description:
                'Disallow assignments that can lead to race conditions due to usage of `await` or `yield`',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/require-atomic-updates',
        },

        fixable: null,

        schema: [
            {
                type: 'object',
                properties: {
                    allowProperties: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            nonAtomicUpdate:
                'Possible race condition: `{{value}}` might be reassigned based on an outdated value of `{{value}}`.',
            nonAtomicObjectUpdate:
                'Possible race condition: `{{value}}` might be assigned based on an outdated state of `{{object}}`.',
        },
    },

    create(context) {
        const allowProperties = !!context.options[0] && context.options[0].allowProperties;

        const { sourceCode } = context;
        const assignmentReferences = new Map<Node, Reference[]>();
        const segmentInfo = new SegmentInfo();
        interface FunctionState {
            upper: FunctionState | null;
            codePath: CodePath;
            referenceMap: Map<Node<'Identifier'>, Reference> | null;
            currentSegments: Set<CodePathSegment>;
        }
        let stack: FunctionState | null = null;

        return {
            onCodePathStart(codePath: CodePath, node: Node) {
                const scope = sourceCode.getScope(node);
                const shouldVerify = scope.type === 'function' && (scope.block.async || scope.block.generator);

                stack = {
                    upper: stack,
                    codePath,
                    referenceMap: shouldVerify ? createReferenceMap(scope) : null,
                    currentSegments: new Set(),
                };
            },
            onCodePathEnd() {
                stack = stack!.upper;
            },

            // Initialize the segment information.
            onCodePathSegmentStart(segment: CodePathSegment) {
                segmentInfo.initialize(segment);
                stack!.currentSegments.add(segment);
            },

            onUnreachableCodePathSegmentStart(segment: CodePathSegment) {
                stack!.currentSegments.add(segment);
            },

            onUnreachableCodePathSegmentEnd(segment: CodePathSegment) {
                stack!.currentSegments.delete(segment);
            },

            onCodePathSegmentEnd(segment: CodePathSegment) {
                stack!.currentSegments.delete(segment);
            },

            // Handle references to prepare verification.
            Identifier(node: Node<'Identifier'>) {
                const { referenceMap } = stack!;
                const reference = referenceMap && referenceMap.get(node);

                // Ignore if this is not a valid variable reference.
                if (!reference) {
                    return;
                }
                const variable = reference.resolved;
                const writeExpr = getWriteExpr(reference);
                const isMemberAccess = reference.identifier.parent.type === 'MemberExpression';

                // Add a fresh read variable.
                if (reference.isRead() && !(writeExpr && writeExpr.parent.operator === '=')) {
                    segmentInfo.markAsRead(stack!.currentSegments, variable!);
                }

                /**
                 * Register the variable to verify after ESLint traversed the `writeExpr` node
                 * if this reference is an assignment to a variable which is referred from other closure.
                 */
                if (
                    writeExpr
                    && 'right' in writeExpr.parent
                    && writeExpr.parent.right === writeExpr // ← exclude variable declarations.
                    && !isLocalVariableWithoutEscape(variable, isMemberAccess)
                ) {
                    let refs = assignmentReferences.get(writeExpr);

                    if (!refs) {
                        refs = [];
                        assignmentReferences.set(writeExpr, refs);
                    }

                    refs.push(reference);
                }
            },

            /**
             * Verify assignments.
             * If the reference exists in `outdatedReadVariables` list, report it.
             * @param node The node to inspect.
             */
            ':expression:exit': function onExpressionExit(node: Node) {
                // referenceMap exists if this is in a resumable function scope.
                if (!stack!.referenceMap) {
                    return;
                }

                // Mark the read variables on this code path as outdated.
                if (node.type === 'AwaitExpression' || node.type === 'YieldExpression') {
                    segmentInfo.makeOutdated(stack!.currentSegments);
                }

                // Verify.
                const references = assignmentReferences.get(node);

                if (references) {
                    // The map only records the right-hand side of assignments.
                    const assignment = node.parent as Node<'AssignmentExpression'>;
                    assignmentReferences.delete(node);

                    references.forEach((reference) => {
                        const variable = reference.resolved;

                        if (segmentInfo.isOutdated(stack!.currentSegments, variable!)) {
                            if (assignment.left === reference.identifier) {
                                context.report({
                                    node: node.parent,
                                    messageId: 'nonAtomicUpdate',
                                    data: {
                                        value: variable!.name,
                                    },
                                });
                            } else if (!allowProperties) {
                                context.report({
                                    node: node.parent,
                                    messageId: 'nonAtomicObjectUpdate',
                                    data: {
                                        value: sourceCode.getText(assignment.left),
                                        object: variable!.name,
                                    },
                                });
                            }
                        }
                    });
                }
            },
        };
    },
};

export default rule;
