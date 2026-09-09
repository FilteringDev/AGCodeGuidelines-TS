/**
 * @file Rule to require function names to match the name of the variable or property to which they are assigned.
 * @author Annie Zhang, Pavel Strashkin
 */
import * as dependency1 from 'esutils';
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//--------------------------------------------------------------------------
// Requirements
//--------------------------------------------------------------------------

const astUtils = dependency0;
const esutils = dependency1;

//--------------------------------------------------------------------------
// Helpers
//--------------------------------------------------------------------------

/**
 * Determines if a pattern is `module.exports` or `module["exports"]`
 * @param pattern The left side of the AssignmentExpression
 * @returns True if the pattern is `module.exports` or `module["exports"]`
 */
function isModuleExports(
    pattern: Node<
        | 'ArrayPattern'
        | 'AssignmentPattern'
        | 'Identifier'
        | 'MemberExpression'
        | 'ObjectPattern'
        | 'RestElement'
    >,
) {
    if (
        pattern.type === 'MemberExpression'
        && pattern.object.type === 'Identifier'
        && pattern.object.name === 'module'
    ) {
        // module.exports
        if (pattern.property.type === 'Identifier' && pattern.property.name === 'exports') {
            return true;
        }

        // module["exports"]
        if (pattern.property.type === 'Literal' && pattern.property.value === 'exports') {
            return true;
        }
    }
    return false;
}

/**
 * Determines if a string name is a valid identifier
 * @param name The string to be checked
 * @param ecmaVersion The ECMAScript version if specified in the parserOptions config
 * @returns True if the string is a valid identifier
 */
function isIdentifier(name: string, ecmaVersion?: number) {
    if (ecmaVersion! >= 2015) {
        return esutils.keyword.isIdentifierES6(name, false);
    }
    return esutils.keyword.isIdentifierES5(name, false);
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const alwaysOrNever = { enum: ['always', 'never'] };
const optionsObject = {
    type: 'object',
    properties: {
        considerPropertyDescriptor: {
            type: 'boolean',
        },
        includeCommonJSModuleExports: {
            type: 'boolean',
        },
    },
    additionalProperties: false,
};

const rule: LegacyRule<
    | [
          ('always' | 'never')?,
          { considerPropertyDescriptor?: boolean; includeCommonJSModuleExports?: boolean }?,
    ]
    | [{ considerPropertyDescriptor?: boolean; includeCommonJSModuleExports?: boolean }?]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description:
                'Require function names to match the name of the variable or property to which they are assigned',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/func-name-matching',
        },

        schema: {
            anyOf: [
                {
                    type: 'array',
                    additionalItems: false,
                    items: [alwaysOrNever, optionsObject],
                },
                {
                    type: 'array',
                    additionalItems: false,
                    items: [optionsObject],
                },
            ],
        },

        messages: {
            matchProperty:
                'Function name `{{funcName}}` should match property name `{{name}}`.',
            matchVariable:
                'Function name `{{funcName}}` should match variable name `{{name}}`.',
            notMatchProperty:
                'Function name `{{funcName}}` should not match property name `{{name}}`.',
            notMatchVariable:
                'Function name `{{funcName}}` should not match variable name `{{name}}`.',
        },
    },

    create(context) {
        const options = (typeof context.options[0] === 'object'
            ? context.options[0]
            : context.options[1]) || {};
        const nameMatches = typeof context.options[0] === 'string' ? context.options[0] : 'always';
        const { considerPropertyDescriptor } = options;
        const includeModuleExports = options.includeCommonJSModuleExports;
        const { ecmaVersion } = context.languageOptions;

        /**
         * Check whether node is a certain CallExpression.
         * @param objName object name
         * @param funcName function name
         * @param node The node to check
         * @returns `true` if node matches CallExpression
         */
        function isPropertyCall(
            objName: string,
            funcName: string,
            node: Node,
        ): node is Node<'CallExpression'> {
            if (!node) {
                return false;
            }
            return (
                node.type === 'CallExpression'
                && astUtils.isSpecificMemberAccess(node.callee, objName, funcName)
            );
        }

        /**
         * Compares identifiers based on the nameMatches option
         * @param x the first identifier
         * @param y the second identifier
         * @returns whether the two identifiers should warn.
         */
        function shouldWarn(x: string, y: string) {
            return (
                (nameMatches === 'always' && x !== y) || (nameMatches === 'never' && x === y)
            );
        }

        /**
         * Reports
         * @param node The node to report
         * @param name The variable or property name
         * @param funcName The function name
         * @param isProp True if the reported node is a property assignment
         */
        function report(
            node: Node<
                | 'AssignmentExpression'
                | 'Property'
                | 'PropertyDefinition'
                | 'VariableDeclarator'
            >,
            name: string,
            funcName: string,
            isProp: boolean,
        ) {
            let messageId;

            if (nameMatches === 'always' && isProp) {
                messageId = 'matchProperty';
            } else if (nameMatches === 'always') {
                messageId = 'matchVariable';
            } else if (isProp) {
                messageId = 'notMatchProperty';
            } else {
                messageId = 'notMatchVariable';
            }
            context.report({
                node,
                messageId,
                data: {
                    name,
                    funcName,
                },
            });
        }

        /**
         * Determines whether a given node is a string literal
         * @param node The node to check
         * @returns `true` if the node is a string literal
         */
        function isStringLiteral(
            node: Node | undefined,
        ): node is Node<'Literal'> & { value: string } {
            return node?.type === 'Literal' && typeof node.value === 'string';
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            VariableDeclarator(node: Node<'VariableDeclarator'>) {
                if (
                    !node.init
                    || node.init.type !== 'FunctionExpression'
                    || node.id.type !== 'Identifier'
                ) {
                    return;
                }
                if (node.init.id && shouldWarn(node.id.name, node.init.id.name)) {
                    report(node, node.id.name, node.init.id.name, false);
                }
            },

            AssignmentExpression(node: Node<'AssignmentExpression'>) {
                if (
                    node.right.type !== 'FunctionExpression'
                    || (node.left.computed && node.left.property.type !== 'Literal')
                    || (!includeModuleExports && isModuleExports(node.left))
                    || (node.left.type !== 'Identifier' && node.left.type !== 'MemberExpression')
                ) {
                    return;
                }

                const isProp = node.left.type === 'MemberExpression';
                const name = isProp
                    ? astUtils.getStaticPropertyName(node.left)
                    : node.left.name;

                if (
                    node.right.id
                    && name
                    && isIdentifier(name)
                    && shouldWarn(name, node.right.id.name)
                ) {
                    report(node, name, node.right.id.name, isProp);
                }
            },

            'Property, PropertyDefinition[value]': function onPropertyPropertyDefinitionValue(
                node: Node<'Property' | 'PropertyDefinition'>,
            ) {
                if (!(node!.value!.type === 'FunctionExpression' && node!.value!.id)) {
                    return;
                }

                if (node.key.type === 'Identifier' && !node.computed) {
                    const functionName = node!.value!.id.name;
                    let propertyName = node.key.name;

                    if (
                        considerPropertyDescriptor
                        && propertyName === 'value'
                        && node.parent.type === 'ObjectExpression'
                    ) {
                        if (
                            isPropertyCall('Object', 'defineProperty', node.parent.parent)
                            || isPropertyCall('Reflect', 'defineProperty', node.parent.parent)
                        ) {
                            const property = node.parent.parent.arguments[1];

                            if (
                                isStringLiteral(property)
                                && shouldWarn(property.value, functionName)
                            ) {
                                report(node, property.value, functionName, true);
                            }
                        } else if (
                            isPropertyCall(
                                'Object',
                                'defineProperties',
                                node.parent.parent.parent.parent,
                            )
                        ) {
                            // Descriptor maps contain properties whose values are the descriptor objects.
                            propertyName = (node.parent.parent as Node<'Property'>).key.name!;
                            if (
                                !node.parent.parent.computed
                                && shouldWarn(propertyName, functionName)
                            ) {
                                report(node, propertyName, functionName, true);
                            }
                        } else if (
                            isPropertyCall('Object', 'create', node.parent.parent.parent.parent)
                        ) {
                            // Descriptor maps contain properties whose values are the descriptor objects.
                            propertyName = (node.parent.parent as Node<'Property'>).key.name!;
                            if (
                                !node.parent.parent.computed
                                && shouldWarn(propertyName, functionName)
                            ) {
                                report(node, propertyName, functionName, true);
                            }
                        } else if (shouldWarn(propertyName, functionName)) {
                            report(node, propertyName, functionName, true);
                        }
                    } else if (shouldWarn(propertyName, functionName)) {
                        report(node, propertyName, functionName, true);
                    }
                    return;
                }

                if (
                    isStringLiteral(node.key)
                    && isIdentifier(node.key.value, ecmaVersion)
                    && shouldWarn(node.key.value, node!.value!.id.name)
                ) {
                    report(node, node.key.value, node!.value!.id.name, true);
                }
            },
        };
    },
};

export default rule;
