/**
 * @file Enforce the use of the 'onChange' or 'readonly' attribute when 'checked' is used'
 * @author Jaesoekjjang
 */
import dependency0 from 'jsx-ast-utils';
import dependency1 from 'array.prototype.flatmap';
import type { LegacyRule, Node } from '../../types';
import dependency2 from '../util/isCreateElement';
import dependency3 from '../util/report';
import dependency4 from '../util/docsUrl';

const ASTUtils = dependency0;
const flatMap = dependency1;
const isCreateElement = dependency2;
const report = dependency3;
const docsUrl = dependency4;

const messages = {
    missingProperty: '`checked` should be used with either `onChange` or `readOnly`.',
    exclusiveCheckedAttribute: 'Use either `checked` or `defaultChecked`, but not both.',
};

const targetPropSet = new Set(['checked', 'onChange', 'readOnly', 'defaultChecked']);

const defaultOptions = {
    ignoreMissingProperties: false,
    ignoreExclusiveCheckedAttribute: false,
};

/**
 * @param properties The value to inspect.
 * @param keyName The value to inspect.
 * @returns The result of this check.
 */
function extractTargetProps(properties: Node[], keyName: 'key' | 'name') {
    return new Set(
        flatMap(properties, (prop) => (prop[keyName] && targetPropSet.has((prop[keyName] as Node<'Identifier'>).name)
            ? [(prop[keyName] as Node<'Identifier'>).name]
            : [])),
    );
}

const rule: LegacyRule<
    [{ ignoreMissingProperties?: boolean; ignoreExclusiveCheckedAttribute?: boolean }?]
> = {
    meta: {
        docs: {
            description: 'Enforce using `onChange` or `readonly` attribute when `checked` is used',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('checked-requires-onchange-or-readonly'),
        },
        messages,
        schema: [
            {
                additionalProperties: false,
                properties: {
                    ignoreMissingProperties: {
                        type: 'boolean',
                    },
                    ignoreExclusiveCheckedAttribute: {
                        type: 'boolean',
                    },
                },
            },
        ],
    },
    create(context) {
        const options = { ...defaultOptions, ...context.options[0] };

        /**
         * @param node The node to inspect.
         */
        function reportMissingProperty(node: Node) {
            report(context, messages.missingProperty, 'missingProperty', { node });
        }

        /**
         * @param node The node to inspect.
         */
        function reportExclusiveCheckedAttribute(node: Node) {
            report(context, messages.exclusiveCheckedAttribute, 'exclusiveCheckedAttribute', { node });
        }

        /**
         * @param node The value to inspect.
         * @param propSet The value to inspect.
         */
        const checkAttributesAndReport = (node: Node, propSet: Set<string>) => {
            if (!propSet.has('checked')) {
                return;
            }

            if (!options.ignoreExclusiveCheckedAttribute && propSet.has('defaultChecked')) {
                reportExclusiveCheckedAttribute(node);
            }

            if (
                !options.ignoreMissingProperties
                && !(propSet.has('onChange') || propSet.has('readOnly'))
            ) {
                reportMissingProperty(node);
            }
        };

        return {
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                if (ASTUtils.elementType(node) !== 'input') {
                    return;
                }

                const propSet = extractTargetProps(node.attributes, 'name');
                checkAttributesAndReport(node, propSet);
            },
            CallExpression(node: Node<'CallExpression'>) {
                if (!isCreateElement(context, node)) {
                    return;
                }

                const firstArg = node.arguments[0];
                const secondArg = node.arguments[1];
                if (!firstArg || firstArg.type !== 'Literal' || firstArg.value !== 'input') {
                    return;
                }

                if (!secondArg || secondArg.type !== 'ObjectExpression') {
                    return;
                }

                const propSet = extractTargetProps(secondArg.properties, 'key');
                checkAttributesAndReport(node, propSet);
            },
        };
    },
};

export default rule;
