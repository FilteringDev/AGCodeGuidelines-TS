import type { Scope, LegacyRule, Node } from '../../types';
/**
 * @file Prevent usage of this.state within setState
 * @author Rolf Erik Lekang, Jørgen Aaberg
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/ast';
import dependency2 from '../util/componentUtil';
import dependency3 from '../util/report';
import dependency4 from '../util/eslint';

const docsUrl = dependency0;
const astUtil = dependency1;
const componentUtil = dependency2;
const report = dependency3;
const { getScope } = dependency4;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    useCallback: 'Use callback in setState when referencing the previous state.',
};

const rule: LegacyRule = {
    meta: {
        docs: {
            description: 'Disallow when this.state is accessed within setState',
            category: 'Possible Errors',
            recommended: false,
            url: docsUrl('no-access-state-in-setstate'),
        },

        messages,
    },

    create(context) {
        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function isSetStateCall(node: Node) {
            return (
                astUtil.isCallExpression(node)
                && node.callee.property
                && node.callee.property.name === 'setState'
                && node.callee.object!.type === 'ThisExpression'
            );
        }

        /**
         * @returns The result of this check.
         * @param current The current value.
         * @param initialNode The initial node value.
         */
        function isFirstArgumentInSetStateCall(current: Node, initialNode: Node) {
            let node = initialNode;

            if (!isSetStateCall(current)) {
                return false;
            }
            while (node && node.parent !== current) {
                node = node.parent;
            }
            return current.arguments![0] === node;
        }

        /**
         * @param node The value to inspect.
         * @returns The result of this check.
         */
        function isClassComponent(node: Node) {
            return !!(
                componentUtil.getParentES6Component(context, node)
                || componentUtil.getParentES5Component(context, node)
            );
        }

        // The methods array contains all methods or functions that are using this.state
        // or that are calling another method or function using this.state
        const methods: { methodName: string | undefined; node: Node }[] = [];
        // The vars array contains all variables that contains this.state
        const vars: { node: Node; scope: Scope; variableName: string | undefined }[] = [];
        return {
            CallExpression(node: Node<'CallExpression'>) {
                if (!isClassComponent(node)) {
                    return;
                }
                // Appends all the methods that are calling another
                // method containing this.state to the methods array
                methods.forEach((method) => {
                    if ('name' in node.callee && node.callee.name === method.methodName) {
                        let current = node.parent;
                        while (current.type !== 'Program') {
                            if (current.type === 'MethodDefinition') {
                                methods.push({
                                    methodName: 'name' in current.key ? current.key.name : undefined,
                                    node: method.node,
                                });
                                break;
                            }
                            current = current.parent;
                        }
                    }
                });

                // Finding all CallExpressions that is inside a setState
                // to further check if they contains this.state
                let current = node.parent;
                while (current.type !== 'Program') {
                    if (isFirstArgumentInSetStateCall(current, node)) {
                        const methodName = 'name' in node.callee ? node.callee.name : undefined;
                        methods.forEach((method) => {
                            if (method.methodName === methodName) {
                                report(context, messages.useCallback, 'useCallback', {
                                    node: method.node,
                                });
                            }
                        });

                        break;
                    }
                    current = current.parent;
                }
            },

            MemberExpression(node: Node<'MemberExpression'>) {
                if (
                    'name' in node.property
                    && node.property.name === 'state'
                    && node.object.type === 'ThisExpression'
                    && isClassComponent(node)
                ) {
                    let current: Node = node;
                    while (current.type !== 'Program') {
                        // Reporting if this.state is directly within this.setState
                        if (isFirstArgumentInSetStateCall(current, node)) {
                            report(context, messages.useCallback, 'useCallback', {
                                node,
                            });
                            break;
                        }

                        // Storing all functions and methods that contains this.state
                        if (current.type === 'MethodDefinition') {
                            methods.push({
                                methodName: 'name' in current.key ? current.key.name : undefined,
                                node,
                            });
                            break;
                        } else if (
                            current.type === 'FunctionExpression'
                            && 'key' in current.parent
                            && current.parent.key
                        ) {
                            methods.push({
                                methodName:
                                    'name' in current.parent.key ? current.parent.key.name : undefined,
                                node,
                            });
                            break;
                        }

                        // Storing all variables containing this.state
                        if (current.type === 'VariableDeclarator') {
                            vars.push({
                                node,
                                scope: getScope(context, node),
                                variableName: 'name' in current.id ? current.id.name : undefined,
                            });
                            break;
                        }

                        current = current.parent;
                    }
                }
            },

            Identifier(node: Node<'Identifier'>) {
                // Checks if the identifier is a variable within an object

                let current: Node = node;
                while (current.parent.type === 'BinaryExpression') {
                    current = current.parent;
                }
                if (
                    ('value' in current.parent && current.parent.value === current)
                    || ('object' in current.parent && current.parent.object === current)
                ) {
                    while (current.type !== 'Program') {
                        if (isFirstArgumentInSetStateCall(current, node)) {
                            vars.filter(
                                (v) => v.scope === getScope(context, node) && v.variableName === node.name,
                            ).forEach((v) => {
                                report(context, messages.useCallback, 'useCallback', {
                                    node: v.node,
                                });
                            });
                        }
                        current = current.parent;
                    }
                }
            },

            ObjectPattern(node: Node<'ObjectPattern'>) {
                const isDerivedFromThis = 'init' in node.parent
                    && node.parent.init
                    && node.parent.init.type === 'ThisExpression';
                node.properties.forEach((property) => {
                    if (
                        property
                        && 'key' in property
                        && property.key
                        && 'name' in property.key
                        && property.key.name === 'state'
                        && isDerivedFromThis
                    ) {
                        vars.push({
                            node: property.key,
                            scope: getScope(context, node),
                            variableName: property.key.name,
                        });
                    }
                });
            },
        };
    },
};

export default rule;
