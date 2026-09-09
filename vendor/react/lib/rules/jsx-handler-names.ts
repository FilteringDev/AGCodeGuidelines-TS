import dependency0 from 'minimatch';
import type { LegacyRule, Node } from '../../types';
/**
 * @file Enforce event handler naming conventions in JSX
 * @author Jake Marsh
 */
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/eslint';
import dependency3 from '../util/report';

const minimatch = dependency0;
const docsUrl = dependency1;
const { getText } = dependency2;
const report = dependency3;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    badHandlerName:
        "Handler function for {{propKey}} prop key must be a camelCase name beginning with '{{handlerPrefix}}' only",
    badPropKey: "Prop key for {{propValue}} must begin with '{{handlerPropPrefix}}'",
};

/**
 * @param prefix The prefix value.
 * @returns The result of this check.
 */
function isPrefixDisabled(prefix: string | false | undefined) {
    return prefix === false;
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isInlineHandler(node: Node<'JSXAttribute'>): node is Node<'JSXAttribute'> & {
    value: Node<'JSXExpressionContainer'> & { expression: Node<'ArrowFunctionExpression'> };
} {
    return node.value!.expression!.type === 'ArrowFunctionExpression';
}

const rule: LegacyRule<
    [
        {
            eventHandlerPrefix?: string | false;
            eventHandlerPropPrefix?: string | false;
            checkLocalVariables?: boolean;
            checkInlineFunction?: boolean;
            ignoreComponentNames?: string[];
        }?,
    ]
> = {
    meta: {
        docs: {
            description: 'Enforce event handler naming conventions in JSX',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-handler-names'),
        },

        messages,

        schema: [
            {
                anyOf: [
                    {
                        type: 'object',
                        properties: {
                            eventHandlerPrefix: { type: 'string' },
                            eventHandlerPropPrefix: { type: 'string' },
                            checkLocalVariables: { type: 'boolean' },
                            checkInlineFunction: { type: 'boolean' },
                            ignoreComponentNames: {
                                type: 'array',
                                uniqueItems: true,
                                items: { type: 'string' },
                            },
                        },
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            eventHandlerPrefix: { type: 'string' },
                            eventHandlerPropPrefix: {
                                type: 'boolean',
                                enum: [false],
                            },
                            checkLocalVariables: { type: 'boolean' },
                            checkInlineFunction: { type: 'boolean' },
                            ignoreComponentNames: {
                                type: 'array',
                                uniqueItems: true,
                                items: { type: 'string' },
                            },
                        },
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            eventHandlerPrefix: {
                                type: 'boolean',
                                enum: [false],
                            },
                            eventHandlerPropPrefix: { type: 'string' },
                            checkLocalVariables: { type: 'boolean' },
                            checkInlineFunction: { type: 'boolean' },
                            ignoreComponentNames: {
                                type: 'array',
                                uniqueItems: true,
                                items: { type: 'string' },
                            },
                        },
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            checkLocalVariables: { type: 'boolean' },
                        },
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            checkInlineFunction: { type: 'boolean' },
                        },
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            ignoreComponentNames: {
                                type: 'array',
                                uniqueItems: true,
                                items: { type: 'string' },
                            },
                        },
                    },
                ],
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || {};

        const eventHandlerPrefix = isPrefixDisabled(configuration.eventHandlerPrefix)
            ? null
            : configuration.eventHandlerPrefix || 'handle';
        const eventHandlerPropPrefix = isPrefixDisabled(configuration.eventHandlerPropPrefix)
            ? null
            : configuration.eventHandlerPropPrefix || 'on';

        const EVENT_HANDLER_REGEX = !eventHandlerPrefix
            ? null
            : new RegExp(
                `^((props\\.${eventHandlerPropPrefix || ''})|((.*\\.)?${eventHandlerPrefix}))[0-9]*[A-Z].*$`,
            );
        const PROP_EVENT_HANDLER_REGEX = !eventHandlerPropPrefix
            ? null
            : new RegExp(`^(${eventHandlerPropPrefix}[A-Z].*|ref)$`);

        const checkLocal = !!configuration.checkLocalVariables;

        const checkInlineFunction = !!configuration.checkInlineFunction;

        const ignoreComponentNames = configuration.ignoreComponentNames || [];

        return {
            JSXAttribute(node: Node<'JSXAttribute'>) {
                const componentName = node.parent.name!.name;

                const isComponentNameIgnored = ignoreComponentNames.some(
                    (ignoredPattern: string) => minimatch(componentName as string, ignoredPattern),
                );

                if (
                    !node.value
                    || !node.value.expression
                    || (!checkInlineFunction && isInlineHandler(node))
                    || (!checkLocal
                        && (isInlineHandler(node)
                            ? !node.value.expression.body!.callee
                              || !node.value.expression.body!.callee.object
                            : !node.value.expression.object))
                    || isComponentNameIgnored
                ) {
                    return;
                }

                const propKey = typeof node.name === 'object' ? node.name.name : node.name;
                const { expression } = node.value;
                const propValue = getText(
                    context,
                    checkInlineFunction && isInlineHandler(node) ? expression.body!.callee : expression,
                )
                    .replace(/\s*/g, '')
                    .replace(/^this\.|.*::/, '');

                if (propKey === 'ref') {
                    return;
                }

                const propIsEventHandler = PROP_EVENT_HANDLER_REGEX && PROP_EVENT_HANDLER_REGEX.test(propKey as string);
                const propFnIsNamedCorrectly = EVENT_HANDLER_REGEX && EVENT_HANDLER_REGEX.test(propValue);

                if (propIsEventHandler && propFnIsNamedCorrectly !== null && !propFnIsNamedCorrectly) {
                    report(context, messages.badHandlerName, 'badHandlerName', {
                        node,
                        data: {
                            propKey,
                            handlerPrefix: eventHandlerPrefix,
                        },
                    });
                } else if (
                    propFnIsNamedCorrectly
                    && propIsEventHandler !== null
                    && !propIsEventHandler
                ) {
                    report(context, messages.badPropKey, 'badPropKey', {
                        node,
                        data: {
                            propValue,
                            handlerPropPrefix: eventHandlerPropPrefix,
                        },
                    });
                }
            },
        };
    },
};

export default rule;
