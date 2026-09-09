import dependency0 from 'object.values';
import type { Component } from '../../component-types';
/**
 * @file Prevent direct mutation of this.state
 * @author David Petersen
 * @author Nicolas Fernandez <@burabure>
 */
import dependency1 from '../util/Components';
import dependency2 from '../util/componentUtil';
import dependency3 from '../util/docsUrl';
import dependency4 from '../util/report';
import type { LegacyRule, Node } from '../../types';

const values = dependency0;

const Components = dependency1;
const componentUtil = dependency2;
const docsUrl = dependency3;
const report = dependency4;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noDirectMutation: 'Do not mutate state directly. Use setState().',
};

const rule: LegacyRule = {
    meta: {
        docs: {
            description: 'Disallow direct mutation of this.state',
            category: 'Possible Errors',
            recommended: true,
            url: docsUrl('no-direct-mutation-state'),
        },

        messages,
    },

    create: Components.detect((context, components, utils) => {
        /**
         * Checks if the component is valid
         * @param component The component to process
         * @returns True if the component is valid, false if not.
         */
        function isValid(component: Component) {
            return !!component && !component.mutateSetState;
        }

        /**
         * Reports undeclared proptypes for a given component
         * @param component The component to process
         */
        function reportMutations(component: Component) {
            let mutation;
            for (let i = 0, j = component.mutations!.length; i < j; i += 1) {
                mutation = component.mutations![i];
                report(context, messages.noDirectMutation, 'noDirectMutation', {
                    node: mutation!,
                });
            }
        }

        /**
         * Walks through the MemberExpression to the top-most property.
         * @param initialNode The node to process
         * @returns The outer-most MemberExpression
         */
        function getOuterMemberExpression(initialNode: Node) {
            let node = initialNode;

            while (node.object && node.object.property) {
                node = node.object;
            }
            return node;
        }

        /**
         * Determine if we should currently ignore assignments in this component.
         * @param component The component to process
         * @returns True if we should skip assignment checks.
         */
        function shouldIgnoreComponent(component: Component | null) {
            return !component || (component.inConstructor && !component.inCallExpression);
        }

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------
        return {
            MethodDefinition(node: Node<'MethodDefinition'>) {
                if (node.kind === 'constructor') {
                    components.set(node, {
                        inConstructor: true,
                    });
                }
            },

            CallExpression(node: Node<'CallExpression'>) {
                components.set(node, {
                    inCallExpression: true,
                });
            },

            AssignmentExpression(node: Node<'AssignmentExpression'>) {
                const component = components.get(utils.getParentComponent(node));
                if (shouldIgnoreComponent(component) || !node.left || !node.left.object) {
                    return;
                }
                const item = getOuterMemberExpression(node.left);
                if (componentUtil.isStateMemberExpression(item)) {
                    const mutations = (component && component.mutations) || [];
                    mutations.push(node.left.object);
                    components.set(node, {
                        mutateSetState: true,
                        mutations,
                    });
                }
            },

            UpdateExpression(node: Node<'UpdateExpression'>) {
                const component = components.get(utils.getParentComponent(node));
                if (shouldIgnoreComponent(component) || node.argument.type !== 'MemberExpression') {
                    return;
                }
                const item = getOuterMemberExpression(node.argument);
                if (componentUtil.isStateMemberExpression(item)) {
                    const mutations = (component && component.mutations) || [];
                    mutations.push(item);
                    components.set(node, {
                        mutateSetState: true,
                        mutations,
                    });
                }
            },

            'CallExpression:exit': function onCallExpressionExit(node: Node<'CallExpression'>) {
                components.set(node, {
                    inCallExpression: false,
                });
            },

            'MethodDefinition:exit': function onMethodDefinitionExit(node: Node<'MethodDefinition'>) {
                if (node.kind === 'constructor') {
                    components.set(node, {
                        inConstructor: false,
                    });
                }
            },

            'Program:exit': function onProgramExit() {
                values(components.list())
                    .filter((component) => !isValid(component))
                    .forEach((component) => {
                        reportMutations(component);
                    });
            },
        };
    }),
};

export default rule;
