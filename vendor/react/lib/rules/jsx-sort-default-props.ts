import type { LegacyRule, Node } from '../../types';
/**
 * @file Enforce default props alphabetical sorting
 * @author Vladimir Kattsov
 * @deprecated
 */
import dependency0 from '../util/variable';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/report';
import dependency3 from '../util/log';
import dependency4 from '../util/eslint';

const variableUtil = dependency0;
const docsUrl = dependency1;
const report = dependency2;
const log = dependency3;
const eslintUtil = dependency4;

const { getFirstTokens } = eslintUtil;
const { getText } = eslintUtil;

let isWarnedForDeprecation = false;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    propsNotSorted: 'Default prop types declarations should be sorted alphabetically',
};

const rule: LegacyRule<[{ ignoreCase?: boolean }?]> = {
    meta: {
        deprecated: true,
        replacedBy: ['sort-default-props'],
        docs: {
            description: 'Enforce defaultProps declarations alphabetical sorting',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-sort-default-props'),
        },
        // fixable: 'code',

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    ignoreCase: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || {};
        const ignoreCase = configuration.ignoreCase || false;

        /**
         * Get properties name
         * @param node - Property.
         * @returns Property name.
         */
        function getPropertyName(node: Node) {
            if (node.key || ['MethodDefinition', 'Property'].indexOf(node.type) !== -1) {
                return node.key!.name;
            }
            if (node.type === 'MemberExpression') {
                return node.property.name;
                // Special case for class properties
                // (babel-eslint@5 does not expose property name so we have to rely on tokens)
            }
            if ((node as Node).type === 'ClassProperty') {
                const tokens = getFirstTokens(context, node, 2);
                return tokens[1] && tokens[1].type === 'Identifier' ? tokens[1].value : tokens[0]!.value;
            }
            return '';
        }

        /**
         * Checks if the Identifier node passed in looks like a defaultProps declaration.
         * @param   node The node to check. Must be an Identifier node.
         * @returns `true` if the node is a defaultProps declaration, `false` if not
         */
        function isDefaultPropsDeclaration(node: Node) {
            const propName = getPropertyName(node);
            return propName === 'defaultProps' || propName === 'getDefaultProps';
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function getKey(node: Node) {
            return getText(context, node.key || node.argument);
        }

        /**
         * Find a variable by name in the current scope.
         * @param  node The node to look for.
         * @param  name Name of the variable to look for.
         * @returns Return null if the variable could not be found, ASTNode otherwise.
         */
        function findVariableByName(node: Node, name: string) {
            const variable = variableUtil.getVariableFromContext(context, node, name);

            if (!variable || !variable.defs[0] || !variable.defs[0].node) {
                return null;
            }

            if (variable.defs[0].node.type === 'TypeAlias') {
                return variable.defs[0].node.right;
            }

            return variable.defs[0].node.init;
        }

        /**
         * Checks if defaultProps declarations are sorted
         * @param declarations The array of AST nodes being checked.
         */
        function checkSorted(declarations: Node[]) {
            // function fix(fixer) {
            //   return propTypesSortUtil.fixPropTypesSort(context, fixer, declarations, ignoreCase);
            // }

            declarations.reduce<Node | undefined>((prev, curr, idx, decls) => {
                if (/Spread(?:Property|Element)$/.test(curr.type)) {
                    return decls[idx + 1];
                }

                let prevPropName = getKey(prev!);
                let currentPropName = getKey(curr);

                if (ignoreCase) {
                    prevPropName = prevPropName.toLowerCase();
                    currentPropName = currentPropName.toLowerCase();
                }

                if (currentPropName < prevPropName) {
                    report(context, messages.propsNotSorted, 'propsNotSorted', {
                        node: curr,
                        // fix
                    });

                    return prev;
                }

                return curr;
            }, declarations[0]);
        }

        /**
         * @param node The node to inspect.
         */
        function checkNode(node: Node | false | null | undefined) {
            if (!node) {
                return;
            }
            if (node.type === 'ObjectExpression') {
                checkSorted(node.properties);
            } else if (node.type === 'Identifier') {
                const propTypesObject = findVariableByName(node, node.name);
                if (propTypesObject && propTypesObject.properties) {
                    checkSorted(propTypesObject.properties);
                }
            }
        }

        // --------------------------------------------------------------------------
        // Public API
        // --------------------------------------------------------------------------

        return {
            'ClassProperty, PropertyDefinition': function onClassPropertyPropertyDefinition(
                node: Node<'ClassProperty' | 'PropertyDefinition'>,
            ) {
                if (!isDefaultPropsDeclaration(node)) {
                    return;
                }

                checkNode(node.value!);
            },

            MemberExpression(node: Node<'MemberExpression'>) {
                if (!isDefaultPropsDeclaration(node)) {
                    return;
                }

                checkNode('right' in node.parent && node.parent.right);
            },

            Program() {
                if (isWarnedForDeprecation) {
                    return;
                }

                log(
                    'The react/jsx-sort-default-props rule is deprecated. It has been renamed to `react/sort-default-props`.',
                );
                isWarnedForDeprecation = true;
            },
        };
    },
};

export default rule;
