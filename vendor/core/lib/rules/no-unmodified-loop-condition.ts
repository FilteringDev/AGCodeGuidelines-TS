/**
 * @file Rule to disallow use of unmodified expressions in loop conditions
 * @author Toru Nagashima
 */
import dependency0 from '../shared/traverser';
import dependency1 from './utils/ast-utils';
import type {
    LegacyRule, Node, Reference, Variable,
} from '../../../types';

type LoopConditionInfo = {
    reference: Reference;
    group: Node | null;
    isInLoop: (reference: Reference) => boolean;
    modified: boolean;
};

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const Traverser = dependency0;
const astUtils = dependency1;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const SENTINEL_PATTERN = /(?:(?:Call|Class|Function|Member|New|Yield)Expression|Statement|Declaration)$/u;
const GROUP_PATTERN = /^(?:BinaryExpression|ConditionalExpression)$/u;
const SKIP_PATTERN = /^(?:ArrowFunction|Class|Function)Expression$/u;
const DYNAMIC_PATTERN = /^(?:Call|Member|New|TaggedTemplate|Yield)Expression$/u;

/**
 * reference - The reference.
 * group - BinaryExpression or ConditionalExpression nodes
 *      that the reference is belonging to.
 * isInLoop - The predicate which checks a given reference
 *      is in this loop.
 * modified - The flag that the reference is modified in
 *      this loop.
 */

/**
 * Checks whether or not a given reference is a write reference.
 * @param reference A reference to check.
 * @returns `true` if the reference is a write reference.
 */
function isWriteReference(reference: Reference) {
    if (reference.init) {
        const def = reference.resolved && reference.resolved.defs[0];

        if (!def || def.type !== 'Variable' || def.parent!.kind !== 'var') {
            return false;
        }
    }
    return reference.isWrite();
}

/**
 * Checks whether or not a given loop condition info does not have the modified
 * flag.
 * @param condition A loop condition info to check.
 * @returns `true` if the loop condition info is "unmodified".
 */
function isUnmodified(condition: LoopConditionInfo) {
    return !condition.modified;
}

/**
 * Checks whether or not a given loop condition info does not have the modified
 * flag and does not have the group this condition belongs to.
 * @param condition A loop condition info to check.
 * @returns `true` if the loop condition info is "unmodified".
 */
function isUnmodifiedAndNotBelongToGroup(condition: LoopConditionInfo) {
    return !(condition.modified || condition.group);
}

/**
 * Checks whether or not a given reference is inside of a given node.
 * @param node A node to check.
 * @param reference A reference to check.
 * @returns `true` if the reference is inside of the node.
 */
function isInRange(node: Pick<Node, 'range'>, reference: Reference) {
    const or = node.range;
    const ir = reference.identifier.range;

    return or[0] <= ir[0] && ir[1] <= or[1];
}

/**
 * Checks whether or not a given reference is inside of a loop node's condition.
 * @param node A node to check.
 * @param reference A reference to check.
 * @returns `true` if the reference is inside of the loop node's
 *      condition.
 */
const isInLoop = {
    WhileStatement: isInRange,
    DoWhileStatement: isInRange,
    ForStatement(node: Node<'ForStatement'>, reference: Reference) {
        return isInRange(node, reference) && !(node.init && isInRange(node.init, reference));
    },
};

/**
 * Gets the function which encloses a given reference.
 * This supports only FunctionDeclaration.
 * @param reference A reference to get.
 * @returns The function node or null.
 */
function getEncloseFunctionDeclaration(reference: Reference) {
    let node: Node = reference.identifier;

    while (node) {
        if (node.type === 'FunctionDeclaration') {
            return node.id ? node : null;
        }

        node = node.parent;
    }

    return null;
}

/**
 * Updates the "modified" flags of given loop conditions with given modifiers.
 * @param conditions The loop conditions to be updated.
 * @param modifiers The references to update.
 */
function updateModifiedFlag(conditions: LoopConditionInfo[], modifiers: Reference[]) {
    for (let i = 0; i < conditions.length; i += 1) {
        const condition = conditions[i];

        for (let j = 0; !condition!.modified && j < modifiers.length; j += 1) {
            const modifier = modifiers[j]!;
            let funcNode;
            let funcVar;

            /**
             * Besides checking for the condition being in the loop, we want to
             * check the function that this modifier is belonging to is called
             * in the loop.
             * FIXME: This should probably be extracted to a function.
             */
            const inLoop = condition!.isInLoop!(modifier)
                || Boolean(
                    (funcNode = getEncloseFunctionDeclaration(modifier))
                        && (funcVar = astUtils.getVariableByName(
                            modifier.from.upper,
                            funcNode.id!.name,
                        ))
                        && funcVar.references.some(condition!.isInLoop),
                );

            condition!.modified = inLoop;
        }
    }
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow unmodified loop conditions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-unmodified-loop-condition',
        },

        schema: [],

        messages: {
            loopConditionNotModified: "'{{name}}' is not modified in this loop.",
        },
    },

    create(context) {
        const { sourceCode } = context;
        let groupMap: Map<Node, LoopConditionInfo[]> | null = null;

        /**
         * Reports a given condition info.
         * @param condition A loop condition info to report.
         */
        function report(condition: LoopConditionInfo) {
            const node = condition.reference.identifier;

            context.report({
                node,
                messageId: 'loopConditionNotModified',
                data: node,
            });
        }

        /**
         * Registers given conditions to the group the condition belongs to.
         * @param conditions A loop condition info to
         *      register.
         */
        function registerConditionsToGroup(conditions: LoopConditionInfo[]) {
            for (let i = 0; i < conditions.length; i += 1) {
                const condition = conditions[i];

                if (condition!.group) {
                    let group = groupMap!.get(condition!.group);

                    if (!group) {
                        group = [];
                        groupMap!.set(condition!.group, group);
                    }
                    group.push(condition!);
                }
            }
        }

        /**
         * Reports references which are inside of unmodified groups.
         * @param conditions A loop condition info to report.
         */
        function checkConditionsInGroup(conditions: LoopConditionInfo[]) {
            if (conditions.every(isUnmodified)) {
                conditions.forEach(report);
            }
        }

        /**
         * Checks whether or not a given group node has any dynamic elements.
         * @param root A node to check.
         *      This node is one of BinaryExpression or ConditionalExpression.
         * @returns `true` if the node is dynamic.
         */
        function hasDynamicExpressions(root: Node) {
            let retv = false;

            Traverser.traverse(root, {
                visitorKeys: sourceCode.visitorKeys,
                enter(node: Node) {
                    if (DYNAMIC_PATTERN.test(node.type)) {
                        retv = true;
                        this.break();
                    } else if (SKIP_PATTERN.test(node.type)) {
                        this.skip();
                    }
                },
            });

            return retv;
        }

        /**
         * Creates the loop condition information from a given reference.
         * @param reference A reference to create.
         * @returns Created loop condition info, or null.
         */
        function toLoopCondition(reference: Reference): LoopConditionInfo | null {
            if (reference.init) {
                return null;
            }

            let group = null;
            let child: Node = reference.identifier;
            let node = child.parent;

            while (node) {
                if (SENTINEL_PATTERN.test(node.type)) {
                    if (
                        (node.type === 'WhileStatement'
                            || node.type === 'DoWhileStatement'
                            || node.type === 'ForStatement')
                        && node.test === child
                    ) {
                        // This reference is inside of a loop condition.
                        const loop = node;
                        return {
                            reference,
                            group,
                            isInLoop:
                                loop.type === 'ForStatement'
                                    ? (loopReference) => isInLoop.ForStatement(loop, loopReference)
                                    : (loopReference) => isInRange(loop, loopReference),
                            modified: false,
                        };
                    }

                    // This reference is outside of a loop condition.
                    break;
                }

                /**
                 * If it's inside of a group, OK if either operand is modified.
                 * So stores the group this reference belongs to.
                 */
                if (GROUP_PATTERN.test(node.type)) {
                    // If this expression is dynamic, no need to check.
                    if (hasDynamicExpressions(node)) {
                        break;
                    } else {
                        group = node;
                    }
                }

                child = node;
                node = node.parent;
            }

            return null;
        }

        /**
         * Finds unmodified references which are inside of a loop condition.
         * Then reports the references which are outside of groups.
         * @param variable A variable to report.
         */
        function checkReferences(variable: Variable) {
            // Gets references that exist in loop conditions.
            const conditions = variable.references
                .map(toLoopCondition)
                .filter((condition): condition is LoopConditionInfo => condition !== null);

            if (conditions.length === 0) {
                return;
            }

            // Registers the conditions to belonging groups.
            registerConditionsToGroup(conditions);

            // Check the conditions are modified.
            const modifiers = variable.references.filter(isWriteReference);

            if (modifiers.length > 0) {
                updateModifiedFlag(conditions, modifiers);
            }

            /**
             * Reports the conditions which are not belonging to groups.
             * Others will be reported after all variables are done.
             */
            conditions.filter(isUnmodifiedAndNotBelongToGroup).forEach(report);
        }

        return {
            'Program:exit': function onProgramExit(node: Node<'Program'>) {
                const queue = [sourceCode.getScope(node)];

                groupMap = new Map();

                let scope;

                for (scope = queue.pop(); scope; scope = queue.pop()) {
                    queue.push(...scope.childScopes);
                    scope.variables.forEach(checkReferences);
                }

                groupMap.forEach(checkConditionsInGroup);
                groupMap = null;
            },
        };
    },
};

export default rule;
