import type { LegacyRule, Node } from '../../types';
/**
 * @file Flag shouldComponentUpdate when extending PureComponent
 */
import dependency0 from '../util/ast';
import dependency1 from '../util/componentUtil';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/report';

const astUtil = dependency0;
const componentUtil = dependency1;
const docsUrl = dependency2;
const report = dependency3;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noShouldCompUpdate:
        '{{component}} does not need shouldComponentUpdate when extending React.PureComponent.',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow usage of shouldComponentUpdate when extending React.PureComponent',
            category: 'Possible Errors',
            recommended: false,
            url: docsUrl('no-redundant-should-component-update'),
        },

        messages,

        schema: [],
    },

    create(context) {
        /**
         * Checks for shouldComponentUpdate property
         * @param node The AST node being checked.
         * @returns Whether or not the property exists.
         */
        function hasShouldComponentUpdate(node: Node) {
            const properties = astUtil.getComponentProperties(node);
            return properties.some((property) => {
                const name = astUtil.getPropertyName(property);
                return name === 'shouldComponentUpdate';
            });
        }

        /**
         * Get name of node if available
         * @param node The AST node being checked.
         * @returns The name of the node
         */
        function getNodeName(node: Node) {
            if (node.id) {
                return node.id.name;
            }
            if (node.parent && node.parent.id) {
                return node.parent.id.name;
            }
            return '';
        }

        /**
         * Checks for violation of rule
         * @param node The AST node being checked.
         */
        function checkForViolation(node: Node) {
            if (componentUtil.isPureComponent(node, context)) {
                const hasScu = hasShouldComponentUpdate(node);
                if (hasScu) {
                    const className = getNodeName(node);
                    report(context, messages.noShouldCompUpdate, 'noShouldCompUpdate', {
                        node,
                        data: {
                            component: className,
                        },
                    });
                }
            }
        }

        return {
            ClassDeclaration: checkForViolation,
            ClassExpression: checkForViolation,
        };
    },
};

export default rule;
