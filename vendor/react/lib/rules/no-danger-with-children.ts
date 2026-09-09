import type { LegacyRule, Node } from '../../types';
/**
 * @file Report when a DOM element is using both children and dangerouslySetInnerHTML
 * @author David Petersen
 */
import dependency0 from '../util/variable';
import dependency1 from '../util/jsx';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/report';

const variableUtil = dependency0;
const jsxUtil = dependency1;
const docsUrl = dependency2;
const report = dependency3;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------
const messages = {
    dangerWithChildren: 'Only set one of `children` or `props.dangerouslySetInnerHTML`',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description:
                'Disallow when a DOM element is using both children and dangerouslySetInnerHTML',
            category: 'Possible Errors',
            recommended: true,
            url: docsUrl('no-danger-with-children'),
        },

        messages,

        schema: [], // no options
    },
    create(context) {
        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         * @param name The name to inspect.
         */
        function findSpreadVariable(node: Node, name: string | undefined) {
            return variableUtil.getVariableFromContext(context, node, name!);
        }
        /**
         * Takes a ObjectExpression and returns the value of the prop if it has it
         * @param node - ObjectExpression node
         * @param propName - name of the prop to look for
         * @param seenProps The value to inspect.
         * @returns The result of this check.
         */
        function findObjectProp(
            node: Node,
            propName: string,
            seenProps: string[],
        ): Node | false | undefined {
            if (!node.properties) {
                return false;
            }
            return node.properties.find((prop) => {
                if (prop.type === 'Property') {
                    return prop.key.name === propName;
                }
                if (prop.type === 'ExperimentalSpreadProperty' || prop.type === 'SpreadElement') {
                    const variable = findSpreadVariable(node, prop.argument.name);
                    if (variable && variable.defs.length && variable.defs[0]!.node.init) {
                        if (seenProps.indexOf(prop.argument.name!) > -1) {
                            return false;
                        }
                        const newSeenProps = seenProps.concat(prop.argument.name || []);
                        return findObjectProp(variable.defs[0]!.node.init, propName, newSeenProps);
                    }
                }
                return false;
            });
        }

        /**
         * Takes a JSXElement and returns the value of the prop if it has it
         * @param node - JSXElement node
         * @param propName - name of the prop to look for
         * @returns The result of this check.
         */
        function findJsxProp(node: Node<'JSXElement'>, propName: string) {
            const { attributes } = node.openingElement;
            return attributes.find((attribute) => {
                if (attribute.type === 'JSXSpreadAttribute') {
                    const variable = findSpreadVariable(node, attribute.argument.name);
                    if (variable && variable.defs.length && variable.defs[0]!.node.init) {
                        return findObjectProp(variable.defs[0]!.node.init, propName, []);
                    }
                }
                return attribute.name && attribute.name.name === propName;
            });
        }

        /**
         * Checks to see if a node is a line break
         * @param node The AST node being checked
         * @returns True if node is a line break, false if not
         */
        function isLineBreak(node: Node) {
            const isLiteral = node.type === 'Literal' || node.type === 'JSXText';
            const isMultiline = node.loc.start.line !== node.loc.end.line;
            const isWhiteSpaces = jsxUtil.isWhiteSpaces(node.value);

            return isLiteral && isMultiline && isWhiteSpaces;
        }

        return {
            JSXElement(node: Node<'JSXElement'>) {
                let hasChildren = false;

                if (node.children.length && !isLineBreak(node.children[0]!)) {
                    hasChildren = true;
                } else if (findJsxProp(node, 'children')) {
                    hasChildren = true;
                }

                if (
                    node.openingElement.attributes
                    && hasChildren
                    && findJsxProp(node, 'dangerouslySetInnerHTML')
                ) {
                    report(context, messages.dangerWithChildren, 'dangerWithChildren', {
                        node,
                    });
                }
            },
            CallExpression(node: Node<'CallExpression'>) {
                if (
                    node.callee
                    && node.callee.type === 'MemberExpression'
                    && 'name' in node.callee.property
                    && node.callee.property.name === 'createElement'
                    && node.arguments.length > 1
                ) {
                    let hasChildren = false;

                    let props: Node | undefined = node.arguments[1];

                    if (props!.type === 'Identifier') {
                        const variable = variableUtil.getVariableFromContext(
                            context,
                            node,
                            props!.name!,
                        );
                        if (variable && variable.defs.length && variable.defs[0]!.node.init) {
                            props = variable.defs[0]!.node.init;
                        }
                    }

                    const dangerously = findObjectProp(props!, 'dangerouslySetInnerHTML', []);

                    if (node.arguments.length === 2) {
                        if (findObjectProp(props!, 'children', [])) {
                            hasChildren = true;
                        }
                    } else {
                        hasChildren = true;
                    }

                    if (dangerously && hasChildren) {
                        report(context, messages.dangerWithChildren, 'dangerWithChildren', {
                            node,
                        });
                    }
                }
            },
        };
    },
};

export default rule;
