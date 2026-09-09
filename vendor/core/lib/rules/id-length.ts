/**
 * @file Rule that warns when identifier names are shorter or longer
 * than the values provided in configuration.
 * @author Burak Yigit Kaya aka BYK
 */
import dependency0 from '../shared/string-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const { getGraphemeCount } = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        {
            min?: number;
            max?: number;
            exceptions?: string[];
            exceptionPatterns?: string[];
            properties?: 'always' | 'never';
        }?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Enforce minimum and maximum identifier lengths',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/id-length',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    min: {
                        type: 'integer',
                        default: 2,
                    },
                    max: {
                        type: 'integer',
                    },
                    exceptions: {
                        type: 'array',
                        uniqueItems: true,
                        items: {
                            type: 'string',
                        },
                    },
                    exceptionPatterns: {
                        type: 'array',
                        uniqueItems: true,
                        items: {
                            type: 'string',
                        },
                    },
                    properties: {
                        enum: ['always', 'never'],
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            tooShort: "Identifier name '{{name}}' is too short (< {{min}}).",
            tooShortPrivate: "Identifier name '#{{name}}' is too short (< {{min}}).",
            tooLong: "Identifier name '{{name}}' is too long (> {{max}}).",
            tooLongPrivate: "Identifier name #'{{name}}' is too long (> {{max}}).",
        },
    },

    create(context) {
        const options = context.options[0] || {};
        const minLength = typeof options.min !== 'undefined' ? options.min : 2;
        const maxLength = typeof options.max !== 'undefined' ? options.max : Infinity;
        const properties = options.properties !== 'never';
        const exceptions = new Set(options.exceptions);
        const exceptionPatterns = (options.exceptionPatterns || []).map(
            (pattern) => new RegExp(pattern, 'u'),
        );
        const reportedNodes: Set<string> = new Set();

        /**
         * Checks if a string matches the provided exception patterns
         * @param name The string to check.
         * @returns if the string is a match
         */
        function matchesExceptionPattern(name: string) {
            return exceptionPatterns.some((pattern) => pattern.test(name));
        }

        type SupportedCheck = { check(parent: Node, node: Node): boolean }['check'];
        const SUPPORTED_EXPRESSIONS: Partial<Record<Node['type'], boolean | SupportedCheck>> = {
            MemberExpression:
                properties
                && function checkMember(parent: Node<'MemberExpression'>) {
                    return (
                        !parent.computed
                        // regular property assignment
                        && ((parent.parent.type === 'AssignmentExpression'
                            && parent.parent.left === parent)
                            // or the last identifier in an ObjectPattern destructuring
                            || (parent.parent.type === 'Property'
                                && parent.parent.value === parent
                                && parent.parent.parent.type === 'ObjectPattern'
                                && 'left' in parent.parent.parent.parent
                                && parent.parent.parent.parent.left === parent.parent.parent))
                    );
                },
            AssignmentPattern(parent: Node<'AssignmentPattern'>, node: Node) {
                return parent.left === node;
            },
            VariableDeclarator(parent: Node<'VariableDeclarator'>, node: Node) {
                return parent.id === node;
            },
            Property(parent: Node<'Property'>, node: Node) {
                if (parent.parent.type === 'ObjectPattern') {
                    const isKeyAndValueSame = parent.value.name === parent.key.name;

                    return (
                        (!isKeyAndValueSame && parent.value === node)
                        || (isKeyAndValueSame && parent.key === node && properties)
                    );
                }
                return properties && !parent.computed && parent.key.name === node.name;
            },
            ImportDefaultSpecifier: true,
            RestElement: true,
            FunctionExpression: true,
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            FunctionDeclaration: true,
            MethodDefinition: true,
            PropertyDefinition: true,
            CatchClause: true,
            ArrayPattern: true,
        };

        return {
            [['Identifier', 'PrivateIdentifier'].join(',')](
                node: Node<'Identifier' | 'PrivateIdentifier'>,
            ) {
                const { name } = node;
                const { parent } = node;

                const nameLength = getGraphemeCount(name);

                const isShort = nameLength < minLength;
                const isLong = nameLength > maxLength;

                if (
                    !(isShort || isLong)
                    || exceptions.has(name)
                    || matchesExceptionPattern(name)
                ) {
                    return; // Nothing to report
                }

                const isValidExpression = SUPPORTED_EXPRESSIONS[parent.type];

                /**
                 * We used the range instead of the node because it's possible
                 * for the same identifier to be represented by two different
                 * nodes, with the most clear example being shorthand properties:
                 * { foo }
                 * In this case, "foo" is represented by one node for the name
                 * and one for the value. The only way to know they are the same
                 * is to look at the range.
                 */
                if (
                    isValidExpression
                    && !reportedNodes.has(node.range.toString())
                    && (isValidExpression === true || isValidExpression(parent, node))
                ) {
                    reportedNodes.add(node.range.toString());

                    let messageId = isShort ? 'tooShort' : 'tooLong';

                    if (node.type === 'PrivateIdentifier') {
                        messageId += 'Private';
                    }

                    context.report({
                        node,
                        messageId,
                        data: { name, min: minLength, max: maxLength },
                    });
                }
            },
        };
    },
};

export default rule;
