import dependency0 from 'object.values';
import type { Component } from '../../component-types';
/**
 * @file Prevent usage of setState
 * @author Mark Dalgleish
 */
import dependency1 from '../util/Components';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/report';
import type { LegacyRule, Node } from '../../types';

const values = dependency0;

const Components = dependency1;
const docsUrl = dependency2;
const report = dependency3;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noSetState: 'Do not use setState',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow usage of setState',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('no-set-state'),
        },

        messages,

        schema: [],
    },

    create: Components.detect((context, components, utils) => {
        /**
         * Checks if the component is valid
         * @param component The component to process
         * @returns True if the component is valid, false if not.
         */
        function isValid(component: Component) {
            return !!component && !component.useSetState;
        }

        /**
         * Reports usages of setState for a given component
         * @param component The component to process
         */
        function reportSetStateUsages(component: Component) {
            for (let i = 0, j = component.setStateUsages!.length; i < j; i += 1) {
                const setStateUsage = component.setStateUsages![i];
                report(context, messages.noSetState, 'noSetState', {
                    node: setStateUsage!,
                });
            }
        }

        return {
            CallExpression(node: Node<'CallExpression'>) {
                const { callee } = node;
                if (
                    callee.type !== 'MemberExpression'
                    || callee.object.type !== 'ThisExpression'
                    || callee.property.name !== 'setState'
                ) {
                    return;
                }
                const component = components.get(utils.getParentComponent(node));
                const setStateUsages = (component && component.setStateUsages) || [];
                setStateUsages.push(callee);
                components.set(node, {
                    useSetState: true,
                    setStateUsages,
                });
            },

            'Program:exit': function onProgramExit() {
                values(components.list())
                    .filter((component) => !isValid(component))
                    .forEach((component) => {
                        reportSetStateUsages(component);
                    });
            },
        };
    }),
};

export default rule;
