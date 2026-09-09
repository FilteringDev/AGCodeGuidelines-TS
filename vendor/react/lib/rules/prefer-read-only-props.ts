/**
 * @file Require component props to be typed as read-only.
 * @author Luke Zapart
 */
import dependency0 from 'array.prototype.flatmap';
import dependency1 from 'object.values';
import type { Component, PropType } from '../../component-types';
import dependency2 from '../util/Components';
import dependency3 from '../util/docsUrl';
import dependency4 from '../util/report';
import type {
    Fixer, LegacyRule, Node, FixFunction,
} from '../../types';

const flatMap = dependency0;
const values = dependency1;

const Components = dependency2;
const docsUrl = dependency3;
const report = dependency4;

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isFlowPropertyType(node: Node) {
    return node.type === 'ObjectTypeProperty';
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTypescriptPropertyType(node: Node) {
    return node.type === 'TSPropertySignature';
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isCovariant(node: Node) {
    return (
        (node.variance && node.variance.kind === 'plus')
        || (node.parent
            && node.parent.parent
            && node.parent.parent.parent
            && node.parent.parent.parent.id
            && node.parent.parent.parent.id.name === '$ReadOnly')
    );
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isReadonly(node: Node) {
    return node.typeAnnotation && node.typeAnnotation.parent && node.typeAnnotation.parent.readonly;
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    readOnlyProp: "Prop '{{name}}' should be read-only.",
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Enforce that props are read-only',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('prefer-read-only-props'),
        },
        fixable: 'code',

        messages,

        schema: [],
    },

    create: Components.detect((context, components) => {
        /**
         * @param prop The prop value.
         * @param propName The prop name value.
         * @param fixer The source edit builder.
         */
        function reportReadOnlyProp(prop: PropType, propName: string, fixer: FixFunction) {
            report(context, messages.readOnlyProp, 'readOnlyProp', {
                node: prop.node!,
                data: {
                    name: propName,
                },
                fix: fixer,
            });
        }

        return {
            'Program:exit': function onProgramExit() {
                flatMap<Component, Record<string, PropType>>(
                    values(components.list()),
                    (component) => component.declaredPropTypes || [],
                ).forEach((declaredPropTypes) => {
                    Object.keys(declaredPropTypes).forEach((propName) => {
                        const prop = declaredPropTypes[propName]!;
                        if (!prop.node) {
                            return;
                        }

                        if (isFlowPropertyType(prop.node)) {
                            if (!isCovariant(prop.node)) {
                                reportReadOnlyProp(prop, propName, (fixer: Fixer) => {
                                    if (!prop.node!.variance) {
                                        // Insert covariance
                                        return fixer.insertTextBefore(prop.node!, '+');
                                    }

                                    // Replace contravariance with covariance
                                    return fixer.replaceText(prop.node!.variance, '+');
                                });
                            }

                            return;
                        }

                        if (isTypescriptPropertyType(prop.node)) {
                            if (!isReadonly(prop.node)) {
                                reportReadOnlyProp(
                                    prop,
                                    propName,
                                    (fixer: Fixer) => fixer.insertTextBefore(prop.node!, 'readonly '),
                                );
                            }
                        }
                    });
                });
            },
        };
    }),
};

export default rule;
