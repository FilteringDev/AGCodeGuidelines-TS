import dependency1 from 'object.fromentries/polyfill.js';
import dependency2 from 'minimatch';
import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent usage of dangerous JSX props
 * @author Scott Andrews
 */
import dependency0 from '../../compat/hasown';
import dependency3 from '../util/docsUrl';
import dependency4 from '../util/jsx';
import dependency5 from '../util/report';

const has = dependency0;
const fromEntries = dependency1();
const minimatch = dependency2;

const docsUrl = dependency3;
const jsxUtil = dependency4;
const report = dependency5;

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const DANGEROUS_PROPERTY_NAMES = ['dangerouslySetInnerHTML'];

const DANGEROUS_PROPERTIES = fromEntries(DANGEROUS_PROPERTY_NAMES.map((prop) => [prop, prop]));

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

/**
 * Checks if a JSX attribute is dangerous.
 * @param name - Name of the attribute to check.
 * @returns Whether or not the attribute is dangerous.
 */
function isDangerous(name: string) {
    return has(DANGEROUS_PROPERTIES, name);
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    dangerousProp: "Dangerous property '{{name}}' found",
};

const rule: LegacyRule<[{ customComponentNames?: string[]; [key: string]: unknown }?]> = {
    meta: {
        docs: {
            description: 'Disallow usage of dangerous JSX properties',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('no-danger'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    customComponentNames: {
                        items: {
                            type: 'string',
                        },
                        minItems: 0,
                        type: 'array',
                        uniqueItems: true,
                    },
                },
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || {};
        const customComponentNames = configuration.customComponentNames || [];

        return {
            JSXAttribute(node: Node<'JSXAttribute'>) {
                const nodeName = node.parent.name;
                const functionName = nodeName!.name || `${nodeName!.object!.name}.${nodeName!.property!.name}`;

                const enableCheckingCustomComponent = customComponentNames.some(
                    (name) => minimatch(functionName as string, name),
                );

                if (
                    (enableCheckingCustomComponent || jsxUtil.isDOMComponent(node.parent))
                    && isDangerous(node.name.name as string)
                ) {
                    report(context, messages.dangerousProp, 'dangerousProp', {
                        node,
                        data: {
                            name: node.name.name,
                        },
                    });
                }
            },
        };
    },
};

export default rule;
