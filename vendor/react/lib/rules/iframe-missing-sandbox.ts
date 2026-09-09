import type { RuleContext, LegacyRule, Node } from '../../types';
/**
 * @file TBD
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/isCreateElement';
import dependency2 from '../util/report';

const docsUrl = dependency0;
const isCreateElement = dependency1;
const report = dependency2;

const messages = {
    attributeMissing: 'An iframe element is missing a sandbox attribute',
    invalidValue: 'An iframe element defines a sandbox attribute with invalid value "{{ value }}"',
    invalidCombination:
        'An iframe element defines a sandbox attribute with both allow-scripts and allow-same-origin which is invalid',
};

const ALLOWED_VALUES = [
    // From https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#attr-sandbox
    '',
    'allow-downloads-without-user-activation',
    'allow-downloads',
    'allow-forms',
    'allow-modals',
    'allow-orientation-lock',
    'allow-pointer-lock',
    'allow-popups',
    'allow-popups-to-escape-sandbox',
    'allow-presentation',
    'allow-same-origin',
    'allow-scripts',
    'allow-storage-access-by-user-activation',
    'allow-top-navigation',
    'allow-top-navigation-by-user-activation',
];

/**
 * @param context The rule context.
 * @param node The node to inspect.
 * @param attribute The attribute value.
 */
function validateSandboxAttribute(
    context: RuleContext,
    node: Node,
    attribute: string | number | bigint | boolean | RegExp,
) {
    if (typeof attribute !== 'string') {
        // Only string literals are supported for now
        return;
    }
    const values = attribute.split(' ');
    let allowScripts = false;
    let allowSameOrigin = false;
    values.forEach((attributeValue) => {
        const trimmedAttributeValue = attributeValue.trim();
        if (ALLOWED_VALUES.indexOf(trimmedAttributeValue) === -1) {
            report(context, messages.invalidValue, 'invalidValue', {
                node,
                data: {
                    value: trimmedAttributeValue,
                },
            });
        }
        if (trimmedAttributeValue === 'allow-scripts') {
            allowScripts = true;
        }
        if (trimmedAttributeValue === 'allow-same-origin') {
            allowSameOrigin = true;
        }
    });
    if (allowScripts && allowSameOrigin) {
        report(context, messages.invalidCombination, 'invalidCombination', {
            node,
        });
    }
}

/**
 * @param context The rule context.
 * @param node The node to inspect.
 */
function checkAttributes(context: RuleContext, node: Node<'JSXOpeningElement'>) {
    let sandboxAttributeFound = false;
    node.attributes!.forEach((attribute) => {
        if (
            attribute.type === 'JSXAttribute'
            && attribute.name
            && attribute.name.type === 'JSXIdentifier'
            && attribute.name.name === 'sandbox'
        ) {
            sandboxAttributeFound = true;
            if (attribute.value && attribute.value.type === 'Literal' && attribute.value.value) {
                validateSandboxAttribute(context, node, attribute.value.value);
            }
        }
    });
    if (!sandboxAttributeFound) {
        report(context, messages.attributeMissing, 'attributeMissing', {
            node,
        });
    }
}

/**
 * @param context The rule context.
 * @param node The node to inspect.
 */
function checkProps(context: RuleContext, node: Node) {
    let sandboxAttributeFound = false;
    if (node.arguments!.length > 1) {
        const props = node.arguments![1];
        const sandboxProp = props!.properties
            && props!.properties.find((x) => x.type === 'Property' && x.key.name === 'sandbox');
        if (sandboxProp) {
            sandboxAttributeFound = true;
            if (sandboxProp.value && sandboxProp.value.type === 'Literal' && sandboxProp.value.value) {
                validateSandboxAttribute(context, node, sandboxProp.value.value);
            }
        }
    }
    if (!sandboxAttributeFound) {
        report(context, messages.attributeMissing, 'attributeMissing', {
            node,
        });
    }
}

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Enforce sandbox attribute on iframe elements',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('iframe-missing-sandbox'),
        },

        schema: [],

        messages,
    },

    create(context) {
        return {
            'JSXOpeningElement[name.name="iframe"]': function onJSXOpeningElementNameNameIframe(
                node: Node,
            ) {
                checkAttributes(context, node as Node<'JSXOpeningElement'>);
            },

            CallExpression(node: Node<'CallExpression'>) {
                if (isCreateElement(context, node) && node.arguments && node.arguments.length > 0) {
                    const tag = node.arguments[0];
                    if (tag!.type === 'Literal' && tag!.value === 'iframe') {
                        checkProps(context, node);
                    }
                }
            },
        };
    },
};

export default rule;
