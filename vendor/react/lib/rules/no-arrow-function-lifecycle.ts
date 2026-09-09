import dependency0 from 'object.values';
import type {
    Token, Fixer, LegacyRule, Node,
} from '../../types';
/**
 * @file Lifecycle methods should be methods on the prototype, not class fields
 * @author Tan Nguyen
 */
import dependency1 from '../util/Components';
import dependency2 from '../util/ast';
import dependency3 from '../util/componentUtil';
import dependency4 from '../util/docsUrl';
import dependency5 from '../util/lifecycleMethods';
import dependency6 from '../util/report';
import dependency7 from '../util/eslint';

const values = dependency0;

const Components = dependency1;
const astUtil = dependency2;
const componentUtil = dependency3;
const docsUrl = dependency4;
const lifecycleMethods = dependency5;
const report = dependency6;
const eslintUtil = dependency7;

const { getSourceCode } = eslintUtil;
const { getText } = eslintUtil;

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function getRuleText(node: Node & { value: Node<'ArrowFunctionExpression'> }) {
    const params = node.value!.params.map((p) => p.name);

    if (node.type === 'Property') {
        return `: function(${params.join(', ')}) `;
    }

    if (node.type === 'ClassProperty' || node.type === 'PropertyDefinition') {
        return `(${params.join(', ')}) `;
    }

    return null;
}

const messages = {
    lifecycle:
        '{{propertyName}} is a React lifecycle method, and should not be an arrow function or in a class field. Use an instance method instead.',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Lifecycle methods should be methods on the prototype, not class fields',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('no-arrow-function-lifecycle'),
        },
        messages,
        schema: [],
        fixable: 'code',
    },

    create: Components.detect((context, components) => {
        /**
         * @param properties list of component properties
         */
        function reportNoArrowFunctionLifecycle(
            properties: ReturnType<typeof astUtil.getComponentProperties>,
        ) {
            properties.forEach((node) => {
                if (!node || !node.value) {
                    return;
                }

                const propertyName = astUtil.getPropertyName(node);
                const nodeType = node.value.type;
                const isLifecycleMethod = (node.static && !componentUtil.isES5Component(node, context)
                    ? lifecycleMethods.static
                    : lifecycleMethods.instance
                ).indexOf(propertyName!) > -1;

                if (nodeType === 'ArrowFunctionExpression' && isLifecycleMethod) {
                    const { body } = node.value;
                    const isBlockBody = body.type === 'BlockStatement';
                    const sourceCode = getSourceCode(context);

                    let nextComment: (Token | null)[] = [];
                    let previousComment: (Token | null)[] = [];
                    let bodyRange: [number, number] | undefined;
                    if (!isBlockBody) {
                        const previousToken = sourceCode.getTokenBefore(body);

                        if (sourceCode.getCommentsBefore) {
                            // eslint >=4.x
                            previousComment = sourceCode.getCommentsBefore(body);
                        } else {
                            // eslint 3.x
                            const potentialComment = sourceCode.getTokenBefore(body, {
                                includeComments: true,
                            });
                            previousComment = previousToken === potentialComment ? [] : [potentialComment];
                        }

                        if (sourceCode.getCommentsAfter) {
                            // eslint >=4.x
                            nextComment = sourceCode.getCommentsAfter(body);
                        } else {
                            // eslint 3.x
                            const potentialComment = sourceCode.getTokenAfter(body, {
                                includeComments: true,
                            });
                            const nextToken = sourceCode.getTokenAfter(body);
                            nextComment = nextToken === potentialComment ? [] : [potentialComment];
                        }
                        bodyRange = [
                            (previousComment.length > 0 ? previousComment[0] : body)!.range[0],
                            (nextComment.length > 0 ? nextComment[nextComment.length - 1] : body)!
                                .range[1] + (node.value.body.type === 'ObjectExpression' ? 1 : 0),
                            // to account for a wrapped end paren
                        ];
                    }
                    const headRange: [number, number] = [
                        node.key!.range[1],
                        (previousComment.length > 0 ? previousComment[0] : body)!.range[0],
                    ];
                    const hasSemi = node.value.expression
                        && getText(context, node).slice(node.value.range[1] - node.range[0]) === ';';

                    report(context, messages.lifecycle, 'lifecycle', {
                        node,
                        data: {
                            propertyName,
                        },
                        fix(fixer: Fixer) {
                            if (!sourceCode.getCommentsAfter) {
                                // eslint 3.x
                                return (
                                    isBlockBody
                                    && fixer.replaceTextRange(
                                        headRange,
                                        getRuleText(
                                            node as Node & { value: Node<'ArrowFunctionExpression'> },
                                        )!,
                                    )
                                );
                            }
                            return ([] as ReturnType<Fixer['replaceTextRange']>[]).concat(
                                fixer.replaceTextRange(
                                    headRange,
                                    getRuleText(
                                        node as Node & { value: Node<'ArrowFunctionExpression'> },
                                    )!,
                                ),
                                isBlockBody
                                    ? []
                                    : fixer.replaceTextRange(
                                        [bodyRange![0], bodyRange![1] + (hasSemi ? 1 : 0)],
                                        `{ return ${previousComment.map((x) => getText(context, x)).join('')}${getText(context, body)}${nextComment.map((x) => getText(context, x)).join('')}; }`,
                                    ),
                            );
                        },
                    });
                }
            });
        }

        return {
            'Program:exit': function onProgramExit() {
                values(components.list()).forEach((component) => {
                    const properties = astUtil.getComponentProperties(component.node);
                    reportNoArrowFunctionLifecycle(properties);
                });
            },
        };
    }),
};

export default rule;
