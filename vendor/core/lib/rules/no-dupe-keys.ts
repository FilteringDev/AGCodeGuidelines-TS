/**
 * @file Rule to flag use of duplicate keys in an object.
 * @author Ian Christian Myers
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const GET_KIND = /^(?:init|get)$/u;
const SET_KIND = /^(?:init|set)$/u;

/**
 * The class which stores properties' information of an object.
 */
class ObjectInfo {
    declare readonly upper: ObjectInfo | null;

    declare readonly node: Node<'ObjectExpression'>;

    declare private properties: Map<string | null, { get: boolean; set: boolean }>;

    /**
     * @param upper The information of the outer object.
     * @param node The ObjectExpression node of this information.
     */
    constructor(upper: ObjectInfo | null, node: Node<'ObjectExpression'>) {
        this.upper = upper;
        this.node = node;
        this.properties = new Map();
    }

    /**
     * Gets the information of the given Property node.
     * @param node The Property node to get.
     * @returns The information of the property.
     */
    getPropertyInfo(node: Node<'Property'>) {
        const name = astUtils.getStaticPropertyName(node);

        if (!this.properties.has(name)) {
            this.properties.set(name, { get: false, set: false });
        }
        return this.properties.get(name)!;
    }

    /**
     * Checks whether the given property has been defined already or not.
     * @param node The Property node to check.
     * @returns `true` if the property has been defined.
     */
    isPropertyDefined(node: Node<'Property'>) {
        const entry = this.getPropertyInfo(node);

        return (
            (GET_KIND.test(node.kind!) && entry.get) || (SET_KIND.test(node.kind!) && entry.set)
        );
    }

    /**
     * Defines the given property.
     * @param node The Property node to define.
     */
    defineProperty(node: Node<'Property'>) {
        const entry = this.getPropertyInfo(node);

        if (GET_KIND.test(node.kind!)) {
            entry.get = true;
        }
        if (SET_KIND.test(node.kind!)) {
            entry.set = true;
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
            description: 'Disallow duplicate keys in object literals',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-dupe-keys',
        },

        schema: [],

        messages: {
            unexpected: "Duplicate key '{{name}}'.",
        },
    },

    create(context) {
        let info: ObjectInfo | null = null;

        return {
            ObjectExpression(node: Node<'ObjectExpression'>) {
                info = new ObjectInfo(info, node);
            },
            'ObjectExpression:exit': function onObjectExpressionExit() {
                info = info!.upper;
            },

            Property(node: Node<'Property'>) {
                const name = astUtils.getStaticPropertyName(node);

                // Skip destructuring.
                if (node.parent.type !== 'ObjectExpression') {
                    return;
                }

                // Skip if the name is not static.
                if (name === null) {
                    return;
                }

                // Reports if the name is defined already.
                if (info!.isPropertyDefined(node)) {
                    context.report({
                        node: info!.node,
                        loc: node.key.loc,
                        messageId: 'unexpected',
                        data: { name },
                    });
                }

                // Update info.
                info!.defineProperty(node);
            },
        };
    },
};

export default rule;
