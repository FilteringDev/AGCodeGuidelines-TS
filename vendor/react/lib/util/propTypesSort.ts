/**
 * @file Common propTypes sorting functionality.
 */
import dependency0 from 'array.prototype.tosorted';
import dependency1 from './ast';
import dependency2 from './eslint';
import type {
    Fixer, Node, RuleContext, Comment,
} from '../../types';

const toSorted = dependency0;

const astUtil = dependency1;
const eslintUtil = dependency2;

const { getSourceCode } = eslintUtil;
const { getText } = eslintUtil;

/**
 * Returns the value name of a node.
 * @param node the node to check.
 * @returns The name of the node.
 */
function getValueName(node: Node) {
    return node.type === 'Property' && node.value.property && node.value.property.name;
}

/**
 * Checks if the prop is required or not.
 * @param node the prop to check.
 * @returns true if the prop is required.
 */
function isRequiredProp(node: Node) {
    return getValueName(node) === 'isRequired';
}

/**
 * Checks if the proptype is a callback by checking if it starts with 'on'.
 * @param propName the name of the proptype to check.
 * @returns true if the proptype is a callback.
 */
function isCallbackPropName(propName: string) {
    return /^on[A-Z]/.test(propName);
}

/**
 * Checks if the prop is PropTypes.shape.
 * @param node the prop to check.
 * @returns true if the prop is PropTypes.shape.
 */
function isShapeProp(node: Node) {
    return !!(node && node.callee && node.callee.property && node.callee.property.name === 'shape');
}

/**
 * Returns the properties of a PropTypes.shape.
 * @param node the prop to check.
 * @returns the properties of the PropTypes.shape node.
 */
function getShapeProperties(node: Node) {
    return node.arguments && node.arguments[0] && node.arguments[0].properties;
}

/**
 * Compares two elements.
 * @param a the first element to compare.
 * @param b the second element to compare.
 * @param context The context of the two nodes.
 * @param ignoreCase whether or not to ignore case when comparing the two elements.
 * @param requiredFirst whether or not to sort required elements first.
 * @param callbacksLast whether or not to sort callbacks after everything else.
 * @param noSortAlphabetically whether or not to disable alphabetical sorting of the elements.
 * @returns the sort order of the two elements.
 */
function sorter(
    a: Node,
    b: Node,
    context: RuleContext,
    ignoreCase?: boolean,
    requiredFirst?: boolean,
    callbacksLast?: boolean,
    noSortAlphabetically?: boolean,
) {
    const aKey = String(astUtil.getKeyValue(context, a));
    const bKey = String(astUtil.getKeyValue(context, b));

    if (requiredFirst) {
        if (isRequiredProp(a) && !isRequiredProp(b)) {
            return -1;
        }
        if (!isRequiredProp(a) && isRequiredProp(b)) {
            return 1;
        }
    }

    if (callbacksLast) {
        if (isCallbackPropName(aKey) && !isCallbackPropName(bKey)) {
            return 1;
        }
        if (!isCallbackPropName(aKey) && isCallbackPropName(bKey)) {
            return -1;
        }
    }

    if (!noSortAlphabetically) {
        if (ignoreCase) {
            return aKey.localeCompare(bKey);
        }

        if (aKey < bKey) {
            return -1;
        }
        if (aKey > bKey) {
            return 1;
        }
    }
    return 0;
}

const commentnodeMap = new WeakMap<Node, { start: number; end: number; hasComment: boolean }>();
// all nodes reference WeakMap for start and end range

/**
 * Fixes sort order of prop types.
 * @param context the second element to compare.
 * @param fixer the first element to compare.
 * @param declarations The context of the two nodes.
 * @param ignoreCase whether or not to ignore case when comparing the two elements.
 * @param requiredFirst whether or not to sort required elements first.
 * @param callbacksLast whether or not to sort callbacks after everything else.
 * @param noSortAlphabetically whether or not to disable alphabetical sorting of the elements.
 * @param sortShapeProp whether or not to sort propTypes defined in PropTypes.shape.
 * @param checkTypes whether or not sorting of prop type definitions are checked.
 * @returns the sort order of the two elements.
 */
function fixPropTypesSort(
    context: RuleContext,
    fixer: Fixer,
    declarations: Node[],
    ignoreCase?: boolean,
    requiredFirst?: boolean,
    callbacksLast?: boolean,
    noSortAlphabetically?: boolean,
    sortShapeProp?: boolean,
    checkTypes?: boolean,
) {
    /**
     * @returns The result of this check.
     * @param allNodes The all nodes value.
     * @param initialSource The initial source value.
     */
    function sortInSource(allNodes: Node[], initialSource: string): string {
        let source = initialSource;

        const originalSource = source;
        const sourceCode = getSourceCode(context);
        for (let i = 0; i < allNodes.length; i += 1) {
            const node = allNodes[i]!;
            let commentAfter: Comment[] = [];
            let commentBefore: Comment[] = [];
            let newStart = 0;
            let newEnd = 0;
            try {
                commentBefore = sourceCode.getCommentsBefore(node);
                commentAfter = sourceCode.getCommentsAfter(node);
            } catch (e) {
                // Older parser versions can omit comment accessors. Keep the empty comment list.
            }

            if (commentAfter.length === 0 || commentBefore.length === 0) {
                [newStart, newEnd] = node.range;
            }

            const firstCommentBefore = commentBefore[0]!;
            if (commentBefore.length >= 1) {
                [newStart] = firstCommentBefore.range;
            }
            const lastCommentAfter = commentAfter[commentAfter.length - 1]!;
            if (commentAfter.length >= 1) {
                [, newEnd] = lastCommentAfter.range;
            }
            commentnodeMap.set(node, { start: newStart, end: newEnd, hasComment: true });
        }
        const nodeGroups = allNodes.reduce(
            (acc, curr) => {
                if (curr.type === 'ExperimentalSpreadProperty' || curr.type === 'SpreadElement') {
                    acc.push([]);
                } else {
                    acc[acc.length - 1]!.push(curr);
                }
                return acc;
            },
            [[]] as Node[][],
        );

        nodeGroups.forEach((nodes) => {
            const sortedAttributes = toSorted(
                nodes,
                (a, b) => sorter(a, b, context, ignoreCase, requiredFirst, callbacksLast, noSortAlphabetically),
            );

            const sourceCodeText = getText(context);
            let separator = '';
            source = nodes.reduceRight((acc, attr, index) => {
                const sortedAttr = sortedAttributes[index]!;
                const commentNode = commentnodeMap.get(sortedAttr)!;
                let sortedAttrText = sourceCodeText.slice(commentNode.start, commentNode.end);
                const sortedAttrTextLastChar = sortedAttrText[sortedAttrText.length - 1];
                if (
                    !separator
                    && [';', ','].some((allowedSep) => sortedAttrTextLastChar === allowedSep)
                ) {
                    separator = sortedAttrTextLastChar!;
                }
                if (sortShapeProp && isShapeProp(sortedAttr.value as Node)) {
                    const shape = getShapeProperties(sortedAttr.value as Node);
                    if (shape) {
                        const attrSource = sortInSource(shape, originalSource);
                        sortedAttrText = attrSource.slice(sortedAttr.range[0], sortedAttr.range[1]);
                    }
                }
                const sortedAttrTextVal = checkTypes && !sortedAttrText.endsWith(separator)
                    ? `${sortedAttrText}${separator}`
                    : sortedAttrText;
                return `${acc.slice(0, commentnodeMap.get(attr)!.start)}${sortedAttrTextVal}${acc.slice(commentnodeMap.get(attr)!.end)}`;
            }, source);
        });
        return source;
    }

    const source = sortInSource(declarations, getText(context));

    const rangeStart = commentnodeMap.get(declarations[0]!)!.start;
    const rangeEnd = commentnodeMap.get(declarations[declarations.length - 1]!)!.end;
    return fixer.replaceTextRange([rangeStart, rangeEnd], source.slice(rangeStart, rangeEnd));
}

export default {
    fixPropTypesSort,
    isCallbackPropName,
    isRequiredProp,
    isShapeProp,
};
