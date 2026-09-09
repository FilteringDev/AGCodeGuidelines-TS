import dependency0 from 'object.values';
import type { Component } from '../../component-types';
/**
 * @file Prevent multiple component definition per file
 * @author Yannick Croissant
 */
import dependency1 from '../util/Components';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/report';
import type { LegacyRule } from '../../types';

const values = dependency0;

const Components = dependency1;
const docsUrl = dependency2;
const report = dependency3;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    onlyOneComponent: 'Declare only one React component per file',
};

const rule: LegacyRule<[{ ignoreStateless?: boolean }?]> = {
    meta: {
        docs: {
            description: 'Disallow multiple component definition per file',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('no-multi-comp'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    ignoreStateless: {
                        default: false,
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create: Components.detect((context, components, utils) => {
        const configuration = context.options[0] || {};
        const ignoreStateless = configuration.ignoreStateless || false;

        /**
         * Checks if the component is ignored
         * @param component The component being checked.
         * @returns True if the component is ignored, false if not.
         */
        function isIgnored(component: Component) {
            return (
                ignoreStateless
                && (/Function/.test(component.node.type) || utils.isPragmaComponentWrapper(component.node))
            );
        }

        return {
            'Program:exit': function onProgramExit() {
                if (components.length() <= 1) {
                    return;
                }

                values(components.list())
                    .filter((component) => !isIgnored(component))
                    .slice(1)
                    .forEach((component) => {
                        report(context, messages.onlyOneComponent, 'onlyOneComponent', {
                            node: component.node,
                        });
                    });
            },
        };
    }),
};

export default rule;
