import type { LegacyRule, Node } from '../../types';
/**
 * @file Forbid using another component's propTypes
 * @author Ian Christian Myers
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/ast';
import dependency2 from '../util/report';

const docsUrl = dependency0;
const ast = dependency1;
const report = dependency2;

const messages = {
    forbiddenPropType:
        'Using propTypes from another component is not safe because they may be removed in production builds',
};

const rule: LegacyRule<[{ allowInPropTypes?: boolean }?]> = {
    meta: {
        docs: {
            description: "Disallow using another component's propTypes",
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('forbid-foreign-prop-types'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    allowInPropTypes: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const config = context.options[0] || {};
        const allowInPropTypes = config.allowInPropTypes || false;

        // --------------------------------------------------------------------------
        // Helpers
        // --------------------------------------------------------------------------

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function findParentAssignmentExpression(node: Node) {
            let { parent } = node;

            while (parent && parent.type !== 'Program') {
                if (parent.type === 'AssignmentExpression') {
                    return parent;
                }
                parent = parent.parent;
            }
            return null;
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function findParentClassProperty(node: Node) {
            let { parent } = node;

            while (parent && parent.type !== 'Program') {
                if (parent.type === 'ClassProperty' || parent.type === 'PropertyDefinition') {
                    return parent;
                }
                parent = parent.parent;
            }
            return null;
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isAllowedAssignment(node: Node) {
            if (!allowInPropTypes) {
                return false;
            }

            const assignmentExpression = findParentAssignmentExpression(node);

            if (
                assignmentExpression
                && assignmentExpression.left
                && assignmentExpression.left.property
                && assignmentExpression.left.property.name === 'propTypes'
            ) {
                return true;
            }

            const classProperty = findParentClassProperty(node);

            if (classProperty && classProperty.key && classProperty.key.name === 'propTypes') {
                return true;
            }
            return false;
        }

        return {
            MemberExpression(node: Node<'MemberExpression'>) {
                if (
                    (node.property
                        && !node.computed
                        && node.property.type === 'Identifier'
                        && node.property.name === 'propTypes'
                        && !ast.isAssignmentLHS(node)
                        && !isAllowedAssignment(node))
                    || ((node.property.type === 'Literal' || (node.property as Node).type === 'JSXText')
                        && 'value' in node.property
                        && node.property.value === 'propTypes'
                        && !ast.isAssignmentLHS(node)
                        && !isAllowedAssignment(node))
                ) {
                    report(context, messages.forbiddenPropType, 'forbiddenPropType', {
                        node: node.property,
                    });
                }
            },

            ObjectPattern(node: Node<'ObjectPattern'>) {
                const propTypesNode = node.properties.find(
                    (property) => property.type === 'Property'
                        && 'name' in property.key
                        && property.key.name === 'propTypes',
                );

                if (propTypesNode) {
                    report(context, messages.forbiddenPropType, 'forbiddenPropType', {
                        node: propTypesNode,
                    });
                }
            },
        };
    },
};

export default rule;
