/**
 * @file Flag expressions in statement position that do not side effect
 * @author Michael Ficarra
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/**
 * Returns `true`.
 * @returns `true`.
 */
function alwaysTrue() {
    return true;
}

/**
 * Returns `false`.
 * @returns `false`.
 */
function alwaysFalse() {
    return false;
}

const rule: LegacyRule<
    [
        {
            allowShortCircuit?: boolean;
            allowTernary?: boolean;
            allowTaggedTemplates?: boolean;
            enforceForJSX?: boolean;
        }?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow unused expressions',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-unused-expressions',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    allowShortCircuit: {
                        type: 'boolean',
                        default: false,
                    },
                    allowTernary: {
                        type: 'boolean',
                        default: false,
                    },
                    allowTaggedTemplates: {
                        type: 'boolean',
                        default: false,
                    },
                    enforceForJSX: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            unusedExpression:
                'Expected an assignment or function call and instead saw an expression.',
        },
    },

    create(context) {
        const config = context.options[0] || {};
        const allowShortCircuit = config.allowShortCircuit || false;
        const allowTernary = config.allowTernary || false;
        const allowTaggedTemplates = config.allowTaggedTemplates || false;
        const enforceForJSX = config.enforceForJSX || false;

        /**
         * Has AST suggesting a directive.
         * @param node any node
         * @returns whether the given node structurally represents a directive
         */
        function looksLikeDirective(node: Node) {
            return (
                node.type === 'ExpressionStatement'
                && node.expression.type === 'Literal'
                && typeof node.expression.value === 'string'
            );
        }

        /**
         * Gets the leading sequence of members in a list that pass the predicate.
         * @param predicate ([a] -> Boolean) the function used to make the determination
         * @param list the input list
         * @returns the leading sequence of members in the given list that pass the given predicate
         */
        function takeWhile<T>(predicate: (value: T) => boolean, list: T[]): T[] {
            for (let i = 0; i < list.length; i += 1) {
                if (!predicate(list[i]!)) {
                    return list.slice(0, i);
                }
            }
            return list.slice();
        }

        /**
         * Gets leading directives nodes in a Node body.
         * @param node a Program or BlockStatement node
         * @returns the leading sequence of directive nodes in the given node's body
         */
        function directives(node: Node<'Program' | 'BlockStatement'>) {
            return takeWhile(looksLikeDirective, node.body);
        }

        /**
         * Detect if a Node is a directive.
         * @param node any node
         * @returns whether the given node is considered a directive in its current position
         */
        function isDirective(node: Node<'ExpressionStatement'>) {
            /**
             * https://tc39.es/ecma262/#directive-prologue
             *
             * Only `FunctionBody`, `ScriptBody` and `ModuleBody` can have directive prologue.
             * Class static blocks do not have directive prologue.
             */
            return (
                astUtils.isTopLevelExpressionStatement(node)
                && directives(node.parent as Node<'BlockStatement' | 'Program'>).includes(node)
            );
        }

        /**
         * The member functions return `true` if the type has no side-effects.
         * Unknown nodes are handled as `false`, then this rule ignores those.
         */
        type NodeCheck = { check(node: Node): boolean | undefined }['check'];
        const Checker: Record<string, NodeCheck> & { isDisallowed: NodeCheck } = Object.assign(Object.create(null), {
            isDisallowed(node: Node) {
                return (Checker[node.type] || alwaysFalse)(node);
            },

            ArrayExpression: alwaysTrue,
            ArrowFunctionExpression: alwaysTrue,
            BinaryExpression: alwaysTrue,
            ChainExpression(node: Node<'ChainExpression'>) {
                return Checker.isDisallowed(node.expression);
            },
            ClassExpression: alwaysTrue,
            ConditionalExpression(node: Node<'ConditionalExpression'>) {
                if (allowTernary) {
                    return (
                        Checker.isDisallowed(node.consequent)
                        || Checker.isDisallowed(node.alternate)
                    );
                }
                return true;
            },
            FunctionExpression: alwaysTrue,
            Identifier: alwaysTrue,
            JSXElement() {
                return enforceForJSX;
            },
            JSXFragment() {
                return enforceForJSX;
            },
            Literal: alwaysTrue,
            LogicalExpression(node: Node<'LogicalExpression'>) {
                if (allowShortCircuit) {
                    return Checker.isDisallowed(node.right);
                }
                return true;
            },
            MemberExpression: alwaysTrue,
            MetaProperty: alwaysTrue,
            ObjectExpression: alwaysTrue,
            SequenceExpression: alwaysTrue,
            TaggedTemplateExpression() {
                return !allowTaggedTemplates;
            },
            TemplateLiteral: alwaysTrue,
            ThisExpression: alwaysTrue,
            UnaryExpression(node: Node<'UnaryExpression'>) {
                return node.operator !== 'void' && node.operator !== 'delete';
            },
        });

        return {
            ExpressionStatement(node: Node<'ExpressionStatement'>) {
                if (Checker.isDisallowed(node.expression) && !isDirective(node)) {
                    context.report({ node, messageId: 'unusedExpression' });
                }
            },
        };
    },
};

export default rule;
