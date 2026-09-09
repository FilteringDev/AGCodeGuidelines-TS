import dependency0 from 'jsx-ast-utils/propName.js';
import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevents usage of Function.prototype.bind and arrow functions
 *               in React component props.
 * @author Daniel Lo Nigro <dan.cx>
 * @author Jacky Ho
 */
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/ast';
import dependency3 from '../util/jsx';
import dependency4 from '../util/report';
import dependency5 from '../util/eslint';

const propName = dependency0;
const docsUrl = dependency1;
const astUtil = dependency2;
const jsxUtil = dependency3;
const report = dependency4;
const { getAncestors } = dependency5;

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

const messages = {
    bindCall: 'JSX props should not use .bind()',
    arrowFunc: 'JSX props should not use arrow functions',
    bindExpression: 'JSX props should not use ::',
    func: 'JSX props should not use functions',
};

const rule: LegacyRule<
    [
        {
            allowArrowFunctions?: boolean;
            allowBind?: boolean;
            allowFunctions?: boolean;
            ignoreRefs?: boolean;
            ignoreDOMComponents?: boolean;
        }?,
    ]
> = {
    meta: {
        docs: {
            description: 'Disallow `.bind()` or arrow functions in JSX props',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('jsx-no-bind'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    allowArrowFunctions: {
                        default: false,
                        type: 'boolean',
                    },
                    allowBind: {
                        default: false,
                        type: 'boolean',
                    },
                    allowFunctions: {
                        default: false,
                        type: 'boolean',
                    },
                    ignoreRefs: {
                        default: false,
                        type: 'boolean',
                    },
                    ignoreDOMComponents: {
                        default: false,
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || {};

        // Keep track of all the variable names pointing to a bind call,
        // bind expression or an arrow function in different block statements
        const blockVariableNameSets: Record<
            string | number,
            Record<keyof typeof messages, Set<unknown>>
        > = {};

        /**
         * @param blockStart The value to inspect.
         */
        function setBlockVariableNameSet(blockStart: string | number) {
            blockVariableNameSets[blockStart] = {
                arrowFunc: new Set(),
                bindCall: new Set(),
                bindExpression: new Set(),
                func: new Set(),
            };
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function getNodeViolationType(node: Node): keyof typeof messages | null {
            if (
                !configuration.allowBind
                && astUtil.isCallExpression(node)
                && node.callee.type === 'MemberExpression'
                && node.callee.property.type === 'Identifier'
                && node.callee.property.name === 'bind'
            ) {
                return 'bindCall';
            }
            if (node.type === 'ConditionalExpression') {
                return (
                    getNodeViolationType(node.test)
                    || getNodeViolationType(node.consequent)
                    || getNodeViolationType(node.alternate)
                );
            }
            if (!configuration.allowArrowFunctions && node.type === 'ArrowFunctionExpression') {
                return 'arrowFunc';
            }
            if (
                !configuration.allowFunctions
                && (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration')
            ) {
                return 'func';
            }
            if (!configuration.allowBind && node.type === 'BindExpression') {
                return 'bindExpression';
            }

            return null;
        }

        /**
         * @param violationType The value to inspect.
         * @param variableName The value to inspect.
         * @param blockStart The value to inspect.
         */
        function addVariableNameToSet(
            violationType: keyof typeof messages,
            variableName: unknown,
            blockStart: string | number,
        ) {
            blockVariableNameSets[blockStart]![violationType].add(variableName);
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function getBlockStatementAncestors(node: Node) {
            return getAncestors(context, node)
                .filter((ancestor) => ancestor.type === 'BlockStatement')
                .reverse();
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         * @param name The name to inspect.
         * @param blockStart The block start value.
         */
        function reportVariableViolation(node: Node, name: unknown, blockStart: string | number) {
            const blockSets = blockVariableNameSets[blockStart];
            const violationTypes = Object.keys(blockSets!) as (keyof typeof messages)[];

            return violationTypes.find((type) => {
                if (blockSets![type].has(name)) {
                    report(context, messages[type], type, {
                        node,
                    });
                    return true;
                }

                return false;
            });
        }

        /**
         * @param node The node to inspect.
         * @param name The name to inspect.
         */
        function findVariableViolation(node: Node, name: string) {
            getBlockStatementAncestors(node).find((block) => reportVariableViolation(node, name, block.range[0]));
        }

        return {
            BlockStatement(node: Node<'BlockStatement'>) {
                setBlockVariableNameSet(node.range[0]);
            },

            FunctionDeclaration(node: Node<'FunctionDeclaration'>) {
                const blockAncestors = getBlockStatementAncestors(node);
                const variableViolationType = getNodeViolationType(node);

                if (blockAncestors.length > 0 && variableViolationType) {
                    addVariableNameToSet(
                        variableViolationType,
                        node.id!.name,
                        blockAncestors[0]!.range[0],
                    );
                }
            },

            VariableDeclarator(node: Node<'VariableDeclarator'>) {
                if (!node.init) {
                    return;
                }
                const blockAncestors = getBlockStatementAncestors(node);
                const variableViolationType = getNodeViolationType(node.init);

                if (
                    blockAncestors.length > 0
                    && variableViolationType
                    && 'kind' in node.parent
                    && node.parent.kind === 'const' // only support const right now
                ) {
                    addVariableNameToSet(
                        variableViolationType,
                        'name' in node.id ? node.id.name : undefined,
                        blockAncestors[0]!.range[0],
                    );
                }
            },

            JSXAttribute(node: Node<'JSXAttribute'>) {
                const isRef = configuration.ignoreRefs && propName(node) === 'ref';
                if (isRef || !node.value || !node.value.expression) {
                    return;
                }
                const isDOMComponent = jsxUtil.isDOMComponent(node.parent);
                if (configuration.ignoreDOMComponents && isDOMComponent) {
                    return;
                }
                const valueNode = node.value.expression;
                const valueNodeType = valueNode.type;
                const nodeViolationType = getNodeViolationType(valueNode);

                if (valueNodeType === 'Identifier') {
                    findVariableViolation(node, valueNode.name);
                } else if (nodeViolationType) {
                    report(context, messages[nodeViolationType], nodeViolationType, {
                        node,
                    });
                }
            },
        };
    },
};

export default rule;
