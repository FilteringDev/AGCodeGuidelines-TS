/**
 * @file Disallow reassignment of function parameters.
 * @author Nat Burns
 */
import type {
    LegacyRule, Node, Reference, Variable,
} from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const stopNodePattern = /(?:Statement|Declaration|Function(?:Expression)?|Program)$/u;

const rule: LegacyRule<
    [
        (
            | { props?: false }
            | {
                props?: true;
                ignorePropertyModificationsFor?: string[];
                ignorePropertyModificationsForRegex?: string[];
            }
        )?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow reassigning `function` parameters',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-param-reassign',
        },

        schema: [
            {
                oneOf: [
                    {
                        type: 'object',
                        properties: {
                            props: {
                                enum: [false],
                            },
                        },
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            props: {
                                enum: [true],
                            },
                            ignorePropertyModificationsFor: {
                                type: 'array',
                                items: {
                                    type: 'string',
                                },
                                uniqueItems: true,
                            },
                            ignorePropertyModificationsForRegex: {
                                type: 'array',
                                items: {
                                    type: 'string',
                                },
                                uniqueItems: true,
                            },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        ],

        messages: {
            assignmentToFunctionParam: "Assignment to function parameter '{{name}}'.",
            assignmentToFunctionParamProp:
                "Assignment to property of function parameter '{{name}}'.",
        },
    },

    create(context) {
        const options: {
            props?: boolean;
            ignorePropertyModificationsFor?: string[];
            ignorePropertyModificationsForRegex?: string[];
        } = context.options[0] || {};
        const props = context.options[0] && context.options[0].props;
        const ignoredPropertyAssignmentsFor = (context.options[0] && options.ignorePropertyModificationsFor) || [];
        const ignoredPropertyAssignmentsForRegex = options.ignorePropertyModificationsForRegex || [];
        const { sourceCode } = context;

        /**
         * Checks whether or not the reference modifies properties of its variable.
         * @param reference A reference to check.
         * @returns Whether or not the reference modifies properties of its variable.
         */
        function isModifyingProp(reference: Reference) {
            let node: Node = reference.identifier;
            let { parent } = node;

            while (
                parent
                && (!stopNodePattern.test(parent.type)
                    || parent.type === 'ForInStatement'
                    || parent.type === 'ForOfStatement')
            ) {
                switch (parent.type) {
                    // e.g. foo.a = 0;
                    case 'AssignmentExpression':
                        return parent.left === node;

                    // e.g. ++foo.a;
                    case 'UpdateExpression':
                        return true;

                    // e.g. delete foo.a;
                    case 'UnaryExpression':
                        if (parent.operator === 'delete') {
                            return true;
                        }
                        break;

                    // e.g. for (foo.a in b) {}
                    case 'ForInStatement':
                    case 'ForOfStatement':
                        if (parent.left === node) {
                            return true;
                        }

                        // this is a stop node for parent.right and parent.body
                        return false;

                    // EXCLUDES: e.g. cache.get(foo.a).b = 0;
                    case 'CallExpression':
                        if (parent.callee !== node) {
                            return false;
                        }
                        break;

                    // EXCLUDES: e.g. cache[foo.a] = 0;
                    case 'MemberExpression':
                        if (parent.property === node) {
                            return false;
                        }
                        break;

                    // EXCLUDES: e.g. ({ [foo]: a }) = bar;
                    case 'Property':
                        if (parent.key === node) {
                            return false;
                        }

                        break;

                    // EXCLUDES: e.g. (foo ? a : b).c = bar;
                    case 'ConditionalExpression':
                        if (parent.test === node) {
                            return false;
                        }

                        break;

                    // no default
                }

                node = parent;
                parent = node.parent;
            }

            return false;
        }

        /**
         * Tests that an identifier name matches any of the ignored property assignments.
         * First we test strings in ignoredPropertyAssignmentsFor.
         * Then we instantiate and test RegExp objects from ignoredPropertyAssignmentsForRegex strings.
         * @param identifierName A string that describes the name of an identifier to
         * ignore property assignments for.
         * @returns Whether the string matches an ignored property assignment regular expression or not.
         */
        function isIgnoredPropertyAssignment(identifierName: string) {
            return (
                ignoredPropertyAssignmentsFor.includes(identifierName)
                || ignoredPropertyAssignmentsForRegex.some((ignored) => new RegExp(ignored, 'u').test(identifierName))
            );
        }

        /**
         * Reports a reference if is non initializer and writable.
         * @param reference A reference to check.
         * @param index The index of the reference in the references.
         * @param references The array that the reference belongs to.
         */
        function checkReference(reference: Reference, index: number, references: Reference[]) {
            const { identifier } = reference;

            if (
                identifier
                && !reference.init
                /**
                 * Destructuring assignments can have multiple default value,
                 * so possibly there are multiple writeable references for the same identifier.
                 */
                && (index === 0 || references![index - 1]!.identifier !== identifier)
            ) {
                if (reference.isWrite()) {
                    context.report({
                        node: identifier,
                        messageId: 'assignmentToFunctionParam',
                        data: { name: identifier.name },
                    });
                } else if (
                    props
                    && isModifyingProp(reference)
                    && !isIgnoredPropertyAssignment(identifier.name)
                ) {
                    context.report({
                        node: identifier,
                        messageId: 'assignmentToFunctionParamProp',
                        data: { name: identifier.name },
                    });
                }
            }
        }

        /**
         * Finds and reports references that are non initializer and writable.
         * @param variable A variable to check.
         */
        function checkVariable(variable: Variable) {
            if (variable!.defs[0]!.type === 'Parameter') {
                variable.references.forEach(checkReference);
            }
        }

        /**
         * Checks parameters of a given function node.
         * @param node A function node to check.
         */
        function checkForFunction(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
        ) {
            sourceCode.getDeclaredVariables(node).forEach(checkVariable);
        }

        return {
            // `:exit` is needed for the `node.parent` property of identifier nodes.
            'FunctionDeclaration:exit': checkForFunction,
            'FunctionExpression:exit': checkForFunction,
            'ArrowFunctionExpression:exit': checkForFunction,
        };
    },
};

export default rule;
