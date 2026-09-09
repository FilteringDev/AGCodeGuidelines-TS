/**
 * @file Rule to require grouped accessor pairs in object literals and classes
 * @author Milos Djermanovic
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node, Token } from '../../../types';

type Key = string | Token[];

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

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[('anyOrder' | 'getBeforeSet' | 'setBeforeGet')?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Require grouped accessor pairs in object literals and classes',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/grouped-accessor-pairs',
        },

        schema: [
            {
                enum: ['anyOrder', 'getBeforeSet', 'setBeforeGet'],
            },
        ],

        messages: {
            notGrouped:
                'Accessor pair {{ formerName }} and {{ latterName }} should be grouped.',
            invalidOrder: 'Expected {{ latterName }} to be before {{ formerName }}.',
        },
    },

    create(context) {
        const order = context.options[0] || 'anyOrder';
        const { sourceCode } = context;

        /**
         * Reports the given accessor pair.
         * @param messageId messageId to report.
         * @param formerNode getter/setter node that is defined before `latterNode`.
         * @param latterNode getter/setter node that is defined after `formerNode`.
         */
        function report(
            messageId: string,
            formerNode: Node<'MethodDefinition' | 'Property'>,
            latterNode: Node<'MethodDefinition' | 'Property'>,
        ) {
            context.report({
                node: latterNode,
                messageId,
                loc: astUtils.getFunctionHeadLoc(latterNode.value, sourceCode),
                data: {
                    formerName: astUtils.getFunctionNameWithKind(formerNode.value),
                    latterName: astUtils.getFunctionNameWithKind(latterNode.value),
                },
            });
        }

        /**
         * Checks accessor pairs in the given list of nodes.
         * @param nodes The list to check.
         * @param shouldCheck – Predicate that returns `true` if the node should be checked.
         */
        function checkList(nodes: Node[], shouldCheck: (node: Node) => boolean) {
            const accessors: {
                key: string | Token[];
                getters: Node<'Property' | 'MethodDefinition'>[];
                setters: Node<'Property' | 'MethodDefinition'>[];
            }[] = [];
            let found = false;

            for (let i = 0; i < nodes.length; i += 1) {
                const node = nodes[i]!;

                if (shouldCheck(node) && isAccessorKind(node!)) {
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
                // Don't report accessor properties that have duplicate getters or setters.
                if (getters.length === 1 && setters.length === 1) {
                    const [getter] = getters;
                    const [setter] = setters;
                    const getterIndex = nodes.indexOf(getter!);
                    const setterIndex = nodes.indexOf(setter!);
                    const formerNode = getterIndex < setterIndex ? getter : setter;
                    const latterNode = getterIndex < setterIndex ? setter : getter;

                    if (Math.abs(getterIndex - setterIndex) > 1) {
                        report('notGrouped', formerNode!, latterNode!);
                    } else if (
                        (order === 'getBeforeSet' && getterIndex > setterIndex)
                        || (order === 'setBeforeGet' && getterIndex < setterIndex)
                    ) {
                        report('invalidOrder', formerNode!, latterNode!);
                    }
                }
            });
        }

        return {
            ObjectExpression(node: Node<'ObjectExpression'>) {
                checkList(node.properties, (n) => n.type === 'Property');
            },
            ClassBody(node: Node<'ClassBody'>) {
                checkList(node.body, (n) => n.type === 'MethodDefinition' && !n.static);
                checkList(node.body, (n) => n.type === 'MethodDefinition' && n.static);
            },
        };
    },
};

export default rule;
