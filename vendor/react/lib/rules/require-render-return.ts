/**
 * @file Enforce ES5 or ES6 class for returning value in render function.
 * @author Mark Orel
 */
import dependency0 from 'object.values';
import dependency1 from '../util/Components';
import dependency2 from '../util/ast';
import dependency3 from '../util/componentUtil';
import dependency4 from '../util/docsUrl';
import dependency5 from '../util/report';
import dependency6 from '../util/eslint';
import type { LegacyRule, Node } from '../../types';

const values = dependency0;

const Components = dependency1;
const astUtil = dependency2;
const componentUtil = dependency3;
const docsUrl = dependency4;
const report = dependency5;
const { getAncestors } = dependency6;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noRenderReturn: 'Your render method should have a return statement',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Enforce ES5 or ES6 class for returning value in render function',
            category: 'Possible Errors',
            recommended: true,
            url: docsUrl('require-render-return'),
        },

        messages,

        schema: [],
    },

    create: Components.detect((context, components) => {
        /**
         * Mark a return statement as present
         * @param node The AST node being checked.
         */
        function markReturnStatementPresent(node: Node) {
            components.set(node, {
                hasReturnStatement: true,
            });
        }

        /**
         * Find render method in a given AST node
         * @param node The component to find render method.
         * @returns Method node if found, undefined if not.
         */
        function findRenderMethod(node: Node) {
            const properties = astUtil.getComponentProperties(node);
            return properties
                .filter((property) => astUtil.getPropertyName(property) === 'render' && property.value)
                .find((property) => astUtil.isFunctionLikeExpression(property.value!));
        }

        return {
            ReturnStatement(node: Node<'ReturnStatement'>) {
                const ancestors = getAncestors(context, node).reverse();
                let depth = 0;
                ancestors.forEach((ancestor) => {
                    if (/Function(Expression|Declaration)$/.test(ancestor.type)) {
                        depth += 1;
                    }
                    if (
                        /(MethodDefinition|Property|ClassProperty|PropertyDefinition)$/.test(
                            ancestor.type,
                        )
                        && astUtil.getPropertyName(ancestor) === 'render'
                        && depth <= 1
                    ) {
                        markReturnStatementPresent(node);
                    }
                });
            },

            ArrowFunctionExpression(node: Node<'ArrowFunctionExpression'>) {
                if (node.expression === false || astUtil.getPropertyName(node.parent) !== 'render') {
                    return;
                }
                markReturnStatementPresent(node);
            },

            'Program:exit': function onProgramExit() {
                values(components.list())
                    .filter(
                        (component) => findRenderMethod(component.node)
                            && !component.hasReturnStatement
                            && (componentUtil.isES5Component(component.node, context)
                                || componentUtil.isES6Component(component.node, context)),
                    )
                    .forEach((component) => {
                        report(context, messages.noRenderReturn, 'noRenderReturn', {
                            node: findRenderMethod(component.node)!,
                        });
                    });
            },
        };
    }),
};

export default rule;
