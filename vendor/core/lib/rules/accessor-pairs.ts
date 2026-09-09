/**
 * @file Rule to enforce getter and setter pairs in objects and classes.
 * @author Gyandeep Singh
 */
import dependency0 from './utils/ast-utils';
import type {
    LegacyListener, LegacyRule, Node, Token,
} from '../../../types';

type Key = string | Token[];
type AccessorData = { key: Key; getters: Node[]; setters: Node[] };

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Typedefs
//------------------------------------------------------------------------------

/**
 * Property name if it can be computed statically, otherwise the list of the tokens of the key node.
 */

/**
 * Accessor nodes with the same key.
 * key Accessor's key
 * getters List of getter nodes.
 * setters List of setter nodes.
 */

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks whether or not the given lists represent the equal tokens in the same order.
 * Tokens are compared by their properties, not by instance.
 * @param left First list of tokens.
 * @param right Second list of tokens.
 * @returns `true` if the lists have same tokens.
 */
function areEqualTokenLists(left: Token[], right: Token[]) {
    if (left.length !== right.length) {
        return false;
    }

    for (let i = 0; i < left.length; i += 1) {
        const leftToken = left[i];
        const rightToken = right[i];

        if (leftToken!.type !== rightToken!.type || leftToken!.value !== rightToken!.value) {
            return false;
        }
    }

    return true;
}

/**
 * Checks whether or not the given keys are equal.
 * @param left First key.
 * @param right Second key.
 * @returns `true` if the keys are equal.
 */
function areEqualKeys(left: Key, right: Key) {
    if (typeof left === 'string' && typeof right === 'string') {
        // Statically computed names.
        return left === right;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        // Token lists.
        return areEqualTokenLists(left, right);
    }

    return false;
}

/**
 * Checks whether or not a given node is of an accessor kind ('get' or 'set').
 * @param node A node to check.
 * @returns `true` if the node is of an accessor kind.
 */
function isAccessorKind(node: Node): node is Node<'Property' | 'MethodDefinition'> {
    return node.kind === 'get' || node.kind === 'set';
}

/**
 * Checks whether or not a given node is an argument of a specified method call.
 * @param node A node to check.
 * @param index An expected index of the node in arguments.
 * @param object An expected name of the object of the method.
 * @param property An expected name of the method.
 * @returns `true` if the node is an argument of the specified method call.
 */
function isArgumentOfMethodCall(node: Node, index: number, object: string, property: string) {
    const { parent } = node;

    return (
        parent.type === 'CallExpression'
        && astUtils.isSpecificMemberAccess(parent.callee, object, property)
        && parent.arguments[index] === node
    );
}

/**
 * Checks whether or not a given node is a property descriptor.
 * @param node A node to check.
 * @returns `true` if the node is a property descriptor.
 */
function isPropertyDescriptor(node: Node<'ObjectExpression'>) {
    // Object.defineProperty(obj, "foo", {set: ...})
    if (
        isArgumentOfMethodCall(node, 2, 'Object', 'defineProperty')
        || isArgumentOfMethodCall(node, 2, 'Reflect', 'defineProperty')
    ) {
        return true;
    }

    /**
     * Object.defineProperties(obj, {foo: {set: ...}})
     * Object.create(proto, {foo: {set: ...}})
     */
    const grandparent = node.parent.parent;

    return (
        grandparent.type === 'ObjectExpression'
        && (isArgumentOfMethodCall(grandparent, 1, 'Object', 'create')
            || isArgumentOfMethodCall(grandparent, 1, 'Object', 'defineProperties'))
    );
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [{ getWithoutSet?: boolean; setWithoutGet?: boolean; enforceForClassMembers?: boolean }?]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Enforce getter and setter pairs in objects and classes',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/accessor-pairs',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    getWithoutSet: {
                        type: 'boolean',
                        default: false,
                    },
                    setWithoutGet: {
                        type: 'boolean',
                        default: true,
                    },
                    enforceForClassMembers: {
                        type: 'boolean',
                        default: true,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            missingGetterInPropertyDescriptor: 'Getter is not present in property descriptor.',
            missingSetterInPropertyDescriptor: 'Setter is not present in property descriptor.',
            missingGetterInObjectLiteral: 'Getter is not present for {{ name }}.',
            missingSetterInObjectLiteral: 'Setter is not present for {{ name }}.',
            missingGetterInClass: 'Getter is not present for class {{ name }}.',
            missingSetterInClass: 'Setter is not present for class {{ name }}.',
        },
    },
    create(context) {
        const config = context.options[0] || {};
        const checkGetWithoutSet = config.getWithoutSet === true;
        const checkSetWithoutGet = config.setWithoutGet !== false;
        const enforceForClassMembers = config.enforceForClassMembers !== false;
        const { sourceCode } = context;

        /**
         * Reports the given node.
         * @param node The node to report.
         * @param messageKind "missingGetter" or "missingSetter".
         */
        function report(node: Node, messageKind: string) {
            if (node.type === 'Property') {
                // Only getter/setter properties reach this branch; their values are functions.
                context.report({
                    node,
                    messageId: `${messageKind}InObjectLiteral`,
                    loc: astUtils.getFunctionHeadLoc(
                        node.value as Node<'FunctionExpression'>,
                        sourceCode,
                    ),
                    data: {
                        name: astUtils.getFunctionNameWithKind(
                            node.value as Node<'FunctionExpression'>,
                        ),
                    },
                });
            } else if (node.type === 'MethodDefinition') {
                context.report({
                    node,
                    messageId: `${messageKind}InClass`,
                    loc: astUtils.getFunctionHeadLoc(
                        node.value as Node<'FunctionExpression'>,
                        sourceCode,
                    ),
                    data: {
                        name: astUtils.getFunctionNameWithKind(
                            node.value as Node<'FunctionExpression'>,
                        ),
                    },
                });
            } else {
                context.report({
                    node,
                    messageId: `${messageKind}InPropertyDescriptor`,
                });
            }
        }

        /**
         * Reports each of the nodes in the given list using the same messageId.
         * @param nodes Nodes to report.
         * @param messageKind "missingGetter" or "missingSetter".
         */
        function reportList(nodes: Node[], messageKind: string) {
            nodes.forEach((node) => {
                report(node, messageKind);
            });
        }

        /**
         * Checks accessor pairs in the given list of nodes.
         * @param nodes The list to check.
         */
        function checkList(nodes: Node[]) {
            const accessors: AccessorData[] = [];
            let found = false;

            for (let i = 0; i < nodes.length; i += 1) {
                const node = nodes[i]!;

                if (isAccessorKind(node!)) {
                    // Creates a new `AccessorData` object for the given getter or setter node.
                    const name = astUtils.getStaticPropertyName(node!);
                    const key = name !== null ? name : sourceCode.getTokens(node!.key);

                    // Merges the given `AccessorData` object into the given accessors list.
                    for (let j = 0; j < accessors.length; j += 1) {
                        const accessor = accessors[j];

                        if (areEqualKeys(accessor!.key, key)) {
                            accessor!.getters.push(...(node!.kind === 'get' ? [node] : []));
                            accessor!.setters.push(...(node!.kind === 'set' ? [node] : []));
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        accessors.push({
                            key,
                            getters: node!.kind === 'get' ? [node] : [],
                            setters: node!.kind === 'set' ? [node] : [],
                        });
                    }
                    found = false;
                }
            }

            accessors.forEach(({ getters, setters }) => {
                if (checkSetWithoutGet && setters.length && !getters.length) {
                    reportList(setters, 'missingGetter');
                }
                if (checkGetWithoutSet && getters.length && !setters.length) {
                    reportList(getters, 'missingSetter');
                }
            });
        }

        /**
         * Checks accessor pairs in an object literal.
         * @param node `ObjectExpression` node to check.
         */
        function checkObjectLiteral(node: Node<'ObjectExpression'>) {
            checkList(node.properties.filter((p: { type: string }) => p.type === 'Property'));
        }

        /**
         * Checks accessor pairs in a property descriptor.
         * @param node Property descriptor `ObjectExpression` node to check.
         */
        function checkPropertyDescriptor(node: Node<'ObjectExpression'>) {
            const namesToCheck = new Set(
                node.properties
                    .filter(
                        (p): p is Node<'Property'> => p.type === 'Property' && p.kind === 'init' && !p.computed,
                    )
                    .map(({ key }) => key.name),
            );

            const hasGetter = namesToCheck.has('get');
            const hasSetter = namesToCheck.has('set');

            if (checkSetWithoutGet && hasSetter && !hasGetter) {
                report(node, 'missingGetter');
            }
            if (checkGetWithoutSet && hasGetter && !hasSetter) {
                report(node, 'missingSetter');
            }
        }

        /**
         * Checks the given object expression as an object literal and as a possible property descriptor.
         * @param node `ObjectExpression` node to check.
         */
        function checkObjectExpression(node: Node<'ObjectExpression'>) {
            checkObjectLiteral(node);
            if (isPropertyDescriptor(node)) {
                checkPropertyDescriptor(node);
            }
        }

        /**
         * Checks the given class body.
         * @param node `ClassBody` node to check.
         */
        function checkClassBody(node: Node<'ClassBody'>) {
            const methodDefinitions = node.body.filter(
                (m): m is Node<'MethodDefinition'> => m.type === 'MethodDefinition',
            );

            checkList(methodDefinitions.filter((m) => m.static));
            checkList(methodDefinitions.filter((m) => !m.static));
        }

        const listeners: LegacyListener = {};

        if (checkSetWithoutGet || checkGetWithoutSet) {
            listeners.ObjectExpression = checkObjectExpression;
            if (enforceForClassMembers) {
                listeners.ClassBody = checkClassBody;
            }
        }

        return listeners;
    },
};

export default rule;
