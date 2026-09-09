import type { IOptions } from 'minimatch';
import minimatch from 'minimatch';
import includes from 'array-includes';
import groupBy from 'object.groupby';
import trimEnd from 'string.prototype.trimend';
import { getScope, getSourceCode } from '../../utils/contextCompat';
import type {
    Node, Fixer, LegacyRule, SourceCode, Token, RuleContext,
} from '../../types';
import importType from '../core/importType';
import isStaticRequire from '../core/staticRequire';
import docsUrl from '../docsUrl';

type ImportGroup =
    | 'builtin'
    | 'external'
    | 'internal'
    | 'unknown'
    | 'parent'
    | 'sibling'
    | 'index'
    | 'object'
    | 'type';
type Category = 'named' | 'import' | 'exports';
type NewlineMode = 'ignore' | 'always' | 'always-and-inside-groups' | 'never';
type Direction = 'ignore' | 'asc' | 'desc';
interface AlphabetizeConfig {
    order: Direction;
    orderImportKind: Direction;
    caseInsensitive: boolean;
}
interface PathGroup {
    pattern: string;
    patternOptions?: IOptions;
    group: ImportGroup;
    position?: 'after' | 'before';
}
interface RankedPathGroup extends Omit<PathGroup, 'position'> {
    position: number;
}
interface OrderRanks {
    groups: Record<ImportGroup, number>;
    omittedTypes: ImportGroup[];
    pathGroups: RankedPathGroup[];
    maxPosition: number;
}
interface ImportEntry {
    node: Node;
    value: string | undefined;
    displayName?: string;
    type: 'import' | 'import:object' | 'require' | 'export';
    alias?: string;
    kind?: 'type' | 'value' | 'typeof' | null;
}
interface OrderedEntry extends ImportEntry {
    rank: number;
    isMultiline?: boolean;
}
export interface OrderOptions {
    groups?: (ImportGroup | ImportGroup[])[];
    pathGroupsExcludedImportTypes?: string[];
    distinctGroup?: boolean;
    pathGroups?: PathGroup[];
    'newlines-between'?: NewlineMode;
    'newlines-between-types'?: NewlineMode;
    consolidateIslands?: 'inside-groups' | 'never';
    sortTypesGroup?: boolean;
    named?:
        | boolean
        | {
            enabled?: boolean;
            import?: boolean;
            export?: boolean;
            require?: boolean;
            cjsExports?: boolean;
            types?: 'mixed' | 'types-first' | 'types-last';
        };
    alphabetize?: Partial<AlphabetizeConfig>;
    warnOnUnassignedImports?: boolean;
}

const categories = {
    named: 'named',
    import: 'import',
    exports: 'exports',
} as const;

const defaultGroups: ImportGroup[] = ['builtin', 'external', 'parent', 'sibling', 'index'];

// REPORTING AND FIXING

/**
 * Reverse.
 * @param array The array value.
 * @returns The result of this check.
 */
function reverse(array: OrderedEntry[]) {
    return array.map((v) => ({ ...v, rank: -v.rank })).reverse();
}

/**
 * Get tokens or comments after.
 * @param sourceCode The source text and token accessors.
 * @param node The node to inspect.
 * @param count The count value.
 * @returns The result of this check.
 */
function getTokensOrCommentsAfter(sourceCode: SourceCode, node: Node | Token, count: number) {
    let currentNodeOrToken: Node | Token | null = node;
    const result: Token[] = [];
    for (let i = 0; i < count; i += 1) {
        currentNodeOrToken = sourceCode.getTokenOrCommentAfter(currentNodeOrToken);
        if (currentNodeOrToken == null) {
            break;
        }
        result.push(currentNodeOrToken);
    }
    return result;
}

/**
 * Get tokens or comments before.
 * @param sourceCode The source text and token accessors.
 * @param node The node to inspect.
 * @param count The count value.
 * @returns The result of this check.
 */
function getTokensOrCommentsBefore(sourceCode: SourceCode, node: Node | Token, count: number) {
    let currentNodeOrToken: Node | Token | null = node;
    const result: Token[] = [];
    for (let i = 0; i < count; i += 1) {
        currentNodeOrToken = sourceCode.getTokenOrCommentBefore(currentNodeOrToken);
        if (currentNodeOrToken == null) {
            break;
        }
        result.push(currentNodeOrToken);
    }
    return result.reverse();
}

/**
 * Take tokens after while.
 * @param sourceCode The source text and token accessors.
 * @param node The node to inspect.
 * @param condition The condition value.
 * @returns The result of this check.
 */
function takeTokensAfterWhile(
    sourceCode: SourceCode,
    node: Node | Token,
    condition: (token: Token) => boolean,
) {
    const tokens = getTokensOrCommentsAfter(sourceCode, node, 100);
    const result: Token[] = [];
    for (let i = 0; i < tokens.length; i += 1) {
        if (condition(tokens[i]!)) {
            result.push(tokens[i]!);
        } else {
            break;
        }
    }
    return result;
}

/**
 * Take tokens before while.
 * @param sourceCode The source text and token accessors.
 * @param node The node to inspect.
 * @param condition The condition value.
 * @returns The result of this check.
 */
function takeTokensBeforeWhile(
    sourceCode: SourceCode,
    node: Node | Token,
    condition: (token: Token) => boolean,
) {
    const tokens = getTokensOrCommentsBefore(sourceCode, node, 100);
    const result: Token[] = [];
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
        if (condition(tokens[i]!)) {
            result.push(tokens[i]!);
        } else {
            break;
        }
    }
    return result.reverse();
}

/**
 * Find out of order.
 * @param imported The imported value.
 * @returns The result of this check.
 */
function findOutOfOrder(imported: OrderedEntry[]) {
    if (imported.length === 0) {
        return [];
    }
    let maxSeenRankNode = imported[0]!;
    return imported.filter((importedModule) => {
        const res = importedModule.rank < maxSeenRankNode.rank;
        if (maxSeenRankNode.rank < importedModule.rank) {
            maxSeenRankNode = importedModule;
        }
        return res;
    });
}

/**
 * Find root node.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function findRootNode(node: Node) {
    let parent = node;
    while (parent.parent != null && parent.parent.body == null) {
        parent = parent.parent;
    }
    return parent;
}

/**
 * Comment on same line as.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function commentOnSameLineAs(node: Node | Token) {
    return (token: Token) => (token.type === 'Block' || token.type === 'Line')
        && token.loc.start.line === token.loc.end.line
        && token.loc.end.line === node.loc.end.line;
}

/**
 * Find end of line with comments.
 * @param sourceCode The source text and token accessors.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function findEndOfLineWithComments(sourceCode: SourceCode, node: Node) {
    const tokensToEndOfLine = takeTokensAfterWhile(sourceCode, node, commentOnSameLineAs(node));
    const endOfTokens = tokensToEndOfLine.length > 0
        ? tokensToEndOfLine[tokensToEndOfLine.length - 1]!.range[1]
        : node.range[1];
    let result = endOfTokens;
    for (let i = endOfTokens; i < sourceCode.text.length; i += 1) {
        if (sourceCode.text[i] === '\n') {
            result = i + 1;
            break;
        }
        if (sourceCode.text[i] !== ' ' && sourceCode.text[i] !== '\t' && sourceCode.text[i] !== '\r') {
            break;
        }
        result = i + 1;
    }
    return result;
}

/**
 * Find start of line with comments.
 * @param sourceCode The source text and token accessors.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function findStartOfLineWithComments(sourceCode: SourceCode, node: Node) {
    const tokensToEndOfLine = takeTokensBeforeWhile(sourceCode, node, commentOnSameLineAs(node));
    const startOfTokens = tokensToEndOfLine.length > 0 ? tokensToEndOfLine[0]!.range[0] : node.range[0];
    let result = startOfTokens;
    for (let i = startOfTokens - 1; i > 0; i -= 1) {
        if (sourceCode.text[i] !== ' ' && sourceCode.text[i] !== '\t') {
            break;
        }
        result = i;
    }
    return result;
}

/**
 * Find specifier start.
 * @param sourceCode The source text and token accessors.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function findSpecifierStart(sourceCode: SourceCode, node: Node) {
    let token;

    do {
        token = sourceCode.getTokenBefore(node)!;
    } while (token.value !== ',' && token.value !== '{');

    return token.range[1];
}

/**
 * Find specifier end.
 * @param sourceCode The source text and token accessors.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function findSpecifierEnd(sourceCode: SourceCode, node: Node) {
    let token;

    do {
        token = sourceCode.getTokenAfter(node)!;
    } while (token.value !== ',' && token.value !== '}');

    return token.range[0];
}

/**
 * Is require expression.
 * @param expr The expr value.
 * @returns The result of this check.
 */
function isRequireExpression(expr: Node | null | undefined) {
    return (
        expr != null
        && expr.type === 'CallExpression'
        && expr.callee != null
        && expr.callee.name === 'require'
        && expr.arguments != null
        && expr.arguments.length === 1
        && expr.arguments[0]!.type === 'Literal'
    );
}

/**
 * Is supported require module.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isSupportedRequireModule(node: Node) {
    if (node.type !== 'VariableDeclaration') {
        return false;
    }
    if (node.declarations.length !== 1) {
        return false;
    }
    const decl = node.declarations[0];
    const isPlainRequire = decl.id
        && (decl.id.type === 'Identifier' || decl.id.type === 'ObjectPattern')
        && isRequireExpression(decl.init);
    const isRequireWithMemberExpression = decl.id
        && (decl.id.type === 'Identifier' || decl.id.type === 'ObjectPattern')
        && decl.init != null
        && decl.init.type === 'CallExpression'
        && decl.init.callee != null
        && decl.init.callee.type === 'MemberExpression'
        && isRequireExpression(decl.init.callee.object);
    return isPlainRequire || isRequireWithMemberExpression;
}

/**
 * Is plain import module.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isPlainImportModule(node: Node) {
    return node.type === 'ImportDeclaration' && node.specifiers != null && node.specifiers.length > 0;
}

/**
 * Is plain import equals.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isPlainImportEquals(node: Node) {
    return node.type === 'TSImportEqualsDeclaration' && node.moduleReference.expression;
}

/**
 * Is cjsexports.
 * @param context The rule context.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isCJSExports(context: RuleContext, node: Node) {
    if (
        node.type === 'MemberExpression'
        && node.object.type === 'Identifier'
        && node.property.type === 'Identifier'
        && node.object.name === 'module'
        && node.property.name === 'exports'
    ) {
        return (
            getScope(context, node).variables.findIndex((variable) => variable.name === 'module') === -1
        );
    }
    if (node.type === 'Identifier' && node.name === 'exports') {
        return (
            getScope(context, node).variables.findIndex((variable) => variable.name === 'exports') === -1
        );
    }

    return undefined;
}

/**
 * Get named cjsexports.
 * @param context The rule context.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function getNamedCJSExports(context: RuleContext, node: Node) {
    if (node.type !== 'MemberExpression') {
        return undefined;
    }
    const result: string[] = [];
    let root: Node = node;
    let parent = null;
    while (root.type === 'MemberExpression') {
        if (root.property.type !== 'Identifier') {
            return undefined;
        }
        result.unshift(root.property.name);
        parent = root;
        root = root.object;
    }

    if (isCJSExports(context, root)) {
        return result;
    }

    if (isCJSExports(context, parent!)) {
        return result.slice(1);
    }

    return undefined;
}

/**
 * Can cross node while reorder.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function canCrossNodeWhileReorder(node: Node) {
    return isSupportedRequireModule(node) || isPlainImportModule(node) || isPlainImportEquals(node);
}

/**
 * Can reorder items.
 * @param firstNode The first node value.
 * @param secondNode The second node value.
 * @returns The result of this check.
 */
function canReorderItems(firstNode: Node, secondNode: Node) {
    const { parent } = firstNode;
    const body = parent.body as Node[];
    const [firstIndex, secondIndex] = [body.indexOf(firstNode), body.indexOf(secondNode)].sort();
    const nodesBetween = body.slice(firstIndex, secondIndex! + 1);

    const entryIterator0 = nodesBetween[Symbol.iterator]();
    for (
        let entryStep1 = entryIterator0.next();
        !entryStep1.done;
        entryStep1 = entryIterator0.next()
    ) {
        const nodeBetween = entryStep1.value;
        if (!canCrossNodeWhileReorder(nodeBetween)) {
            return false;
        }
    }

    return true;
}

/**
 * Make import description.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function makeImportDescription(node: ImportEntry) {
    if (node.type === 'export') {
        if (node.node.exportKind === 'type') {
            return 'type export';
        }
        return 'export';
    }
    if (node.node.importKind === 'type') {
        return 'type import';
    }
    if (node.node.importKind === 'typeof') {
        return 'typeof import';
    }
    return 'import';
}

/**
 * Fix out of order.
 * @param context The rule context.
 * @param firstNode The first node value.
 * @param secondNode The second node value.
 * @param order The order value.
 * @param category The category value.
 */
function fixOutOfOrder(
    context: RuleContext,
    firstNode: OrderedEntry,
    secondNode: OrderedEntry,
    order: 'before' | 'after',
    category: Category,
) {
    const isNamed = category === categories.named;
    const isExports = category === categories.exports;
    const sourceCode = getSourceCode(context);

    const { firstRoot, secondRoot } = isNamed
        ? {
            firstRoot: firstNode.node,
            secondRoot: secondNode.node,
        }
        : {
            firstRoot: findRootNode(firstNode.node),
            secondRoot: findRootNode(secondNode.node),
        };

    const {
        firstRootStart, firstRootEnd, secondRootStart, secondRootEnd,
    } = isNamed
        ? {
            firstRootStart: findSpecifierStart(sourceCode, firstRoot),
            firstRootEnd: findSpecifierEnd(sourceCode, firstRoot),
            secondRootStart: findSpecifierStart(sourceCode, secondRoot),
            secondRootEnd: findSpecifierEnd(sourceCode, secondRoot),
        }
        : {
            firstRootStart: findStartOfLineWithComments(sourceCode, firstRoot),
            firstRootEnd: findEndOfLineWithComments(sourceCode, firstRoot),
            secondRootStart: findStartOfLineWithComments(sourceCode, secondRoot),
            secondRootEnd: findEndOfLineWithComments(sourceCode, secondRoot),
        };

    if (firstNode.displayName === secondNode.displayName) {
        if (firstNode.alias) {
            Object.assign(firstNode, { displayName: `${firstNode.displayName} as ${firstNode.alias}` });
        }
        if (secondNode.alias) {
            Object.assign(secondNode, {
                displayName: `${secondNode.displayName} as ${secondNode.alias}`,
            });
        }
    }

    const firstImport = `${makeImportDescription(firstNode)} of \`${firstNode.displayName}\``;
    const secondImport = `\`${secondNode.displayName}\` ${makeImportDescription(secondNode)}`;
    const message = `${secondImport} should occur ${order} ${firstImport}`;

    if (isNamed) {
        const firstCode = sourceCode.text.slice(firstRootStart, firstRoot.range[1]);
        const firstTrivia = sourceCode.text.slice(firstRoot.range[1], firstRootEnd);
        const secondCode = sourceCode.text.slice(secondRootStart, secondRoot.range[1]);
        const secondTrivia = sourceCode.text.slice(secondRoot.range[1], secondRootEnd);

        if (order === 'before') {
            const trimmedTrivia = trimEnd(secondTrivia);
            const gapCode = sourceCode.text.slice(firstRootEnd, secondRootStart - 1);
            const whitespaces = secondTrivia.slice(trimmedTrivia.length);
            context.report({
                node: secondNode.node,
                message,
                fix: (fixer: Fixer) => fixer.replaceTextRange(
                    [firstRootStart, secondRootEnd],
                    `${secondCode},${trimmedTrivia}${firstCode}${firstTrivia}${gapCode}${whitespaces}`,
                ),
            });
        } else if (order === 'after') {
            const trimmedTrivia = trimEnd(firstTrivia);
            const gapCode = sourceCode.text.slice(secondRootEnd + 1, firstRootStart);
            const whitespaces = firstTrivia.slice(trimmedTrivia.length);
            context.report({
                node: secondNode.node,
                message,
                fix: (fixes) => fixes.replaceTextRange(
                    [secondRootStart, firstRootEnd],
                    `${gapCode}${firstCode},${trimmedTrivia}${secondCode}${whitespaces}`,
                ),
            });
        }
    } else {
        const canFix = isExports || canReorderItems(firstRoot, secondRoot);
        let newCode = sourceCode.text.substring(secondRootStart, secondRootEnd);

        if (newCode[newCode.length - 1] !== '\n') {
            newCode = `${newCode}\n`;
        }

        if (order === 'before') {
            context.report({
                node: secondNode.node,
                message,
                fix: canFix
                    ? (fixer: Fixer) => fixer.replaceTextRange(
                        [firstRootStart, secondRootEnd],
                        newCode + sourceCode.text.substring(firstRootStart, secondRootStart),
                    )
                    : undefined,
            });
        } else if (order === 'after') {
            context.report({
                node: secondNode.node,
                message,
                fix: canFix
                    ? (fixer: Fixer) => fixer.replaceTextRange(
                        [secondRootStart, firstRootEnd],
                        sourceCode.text.substring(secondRootEnd, firstRootEnd) + newCode,
                    )
                    : undefined,
            });
        }
    }
}

/**
 * Report out of order.
 * @param context The rule context.
 * @param imported The imported value.
 * @param outOfOrder The out of order value.
 * @param order The order value.
 * @param category The category value.
 */
function reportOutOfOrder(
    context: RuleContext,
    imported: OrderedEntry[],
    outOfOrder: OrderedEntry[],
    order: 'before' | 'after',
    category: Category,
) {
    outOfOrder.forEach((imp) => {
        const found = imported.find((importedItem) => importedItem.rank > imp.rank);
        fixOutOfOrder(context, found!, imp, order, category);
    });
}

/**
 * Make out of order report.
 * @param context The rule context.
 * @param imported The imported value.
 * @param category The category value.
 */
function makeOutOfOrderReport(context: RuleContext, imported: OrderedEntry[], category: Category) {
    const outOfOrder = findOutOfOrder(imported);
    if (!outOfOrder.length) {
        return;
    }

    // There are things to report. Try to minimize the number of reported errors.
    const reversedImported = reverse(imported);
    const reversedOrder = findOutOfOrder(reversedImported);
    if (reversedOrder.length < outOfOrder.length) {
        reportOutOfOrder(context, reversedImported, reversedOrder, 'after', category);
        return;
    }
    reportOutOfOrder(context, imported, outOfOrder, 'before', category);
}

const compareString = (a: string, b: string) => {
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return 0;
};

/**
 * Some parsers (languages without types) don't provide ImportKind
 */
const DEFAULT_IMPORT_KIND = 'value';
const getNormalizedValue = (node: ImportEntry, toLowerCase: boolean) => {
    const value = node.value!;
    return toLowerCase ? String(value).toLowerCase() : value;
};

/**
 * Get sorter.
 * @param alphabetizeOptions The alphabetize options value.
 * @returns The result of this check.
 */
function getSorter(alphabetizeOptions: AlphabetizeConfig) {
    const multiplier = alphabetizeOptions.order === 'asc' ? 1 : -1;
    const { orderImportKind } = alphabetizeOptions;
    const multiplierImportKind = orderImportKind !== 'ignore' && (alphabetizeOptions.orderImportKind === 'asc' ? 1 : -1);

    return function importsSorter(nodeA: OrderedEntry, nodeB: OrderedEntry) {
        const importA = getNormalizedValue(nodeA, alphabetizeOptions.caseInsensitive);
        const importB = getNormalizedValue(nodeB, alphabetizeOptions.caseInsensitive);
        let result = 0;

        if (!includes(importA, '/') && !includes(importB, '/')) {
            result = compareString(importA, importB);
        } else {
            const A = importA.split('/');
            const B = importB.split('/');
            const a = A.length;
            const b = B.length;

            for (let i = 0; i < Math.min(a, b); i += 1) {
                // Skip comparing the first path segment, if they are relative segments for both imports
                if (i === 0 && (A[i] === '.' || A[i] === '..') && (B[i] === '.' || B[i] === '..')) {
                    // If one is sibling and the other parent import, no need to compare at all, since the paths
                    // belong in different groups
                    if (A[i] !== B[i]) {
                        break;
                    }
                } else {
                    result = compareString(A[i]!, B[i]!);
                    if (result) {
                        break;
                    }
                }
            }

            if (!result && a !== b) {
                result = a < b ? -1 : 1;
            }
        }

        result *= multiplier;

        // In case the paths are equal (result === 0), sort them by importKind
        if (!result && multiplierImportKind) {
            result = multiplierImportKind
                * compareString(
                    nodeA.node.importKind || DEFAULT_IMPORT_KIND,
                    nodeB.node.importKind || DEFAULT_IMPORT_KIND,
                );
        }

        return result;
    };
}

/**
 * Mutate ranks to alphabetize.
 * @param imported The imported value.
 * @param alphabetizeOptions The alphabetize options value.
 */
function mutateRanksToAlphabetize(imported: OrderedEntry[], alphabetizeOptions: AlphabetizeConfig) {
    const groupedByRanks = groupBy(imported, (item) => item.rank);

    const sorterFn = getSorter(alphabetizeOptions);

    // sort group keys so that they can be iterated on in order
    const groupRanks = Object.keys(groupedByRanks).sort((a, b) => Number(a) - Number(b));

    // sort imports locally within their group
    groupRanks.forEach((groupRank) => {
        groupedByRanks[Number(groupRank)]!.sort(sorterFn);
    });

    // assign globally unique rank to each import
    let newRank = 0;
    const alphabetizedRanks = groupRanks.reduce<Record<string, number>>((acc, groupRank) => {
        groupedByRanks[Number(groupRank)]!.forEach((importedItem) => {
            Object.assign(acc, {
                [`${importedItem.value}|${importedItem.node.importKind}`]:
                    parseInt(groupRank, 10) + newRank,
            });
            newRank += 1;
        });
        return acc;
    }, {});

    // mutate the original group-rank with alphabetized-rank
    imported.forEach((importedItem) => {
        Object.assign(importedItem, {
            rank: alphabetizedRanks[`${importedItem.value}|${importedItem.node.importKind}`]!,
        });
    });
}

// DETECTING

/**
 * Compute path rank.
 * @param ranks The ranks value.
 * @param pathGroups The path groups value.
 * @param path The path value.
 * @param maxPosition The max position value.
 * @returns The result of this check.
 */
function computePathRank(
    ranks: OrderRanks['groups'],
    pathGroups: RankedPathGroup[],
    path: string,
    maxPosition: number,
) {
    for (let i = 0, l = pathGroups.length; i < l; i += 1) {
        const {
            pattern, patternOptions, group, position = 1,
        } = pathGroups[i]!;
        if (minimatch(path, pattern, patternOptions || { nocomment: true })) {
            return ranks[group] + position / maxPosition;
        }
    }

    return undefined;
}

/**
 * Compute rank.
 * @param context The rule context.
 * @param ranks The ranks value.
 * @param importEntry The import entry value.
 * @param excludedImportTypes The excluded import types value.
 * @param isSortingTypesGroup The is sorting types group value.
 * @returns The result of this check.
 */
function computeRank(
    context: RuleContext,
    ranks: OrderRanks,
    importEntry: ImportEntry,
    excludedImportTypes: Set<string>,
    isSortingTypesGroup: boolean | undefined,
) {
    let impType: ImportGroup | 'absolute';
    let rank;

    const isTypeGroupInGroups = ranks.omittedTypes.indexOf('type') === -1;
    const isTypeOnlyImport = importEntry.node.importKind === 'type';
    const isExcludedFromPathRank = isTypeOnlyImport && isTypeGroupInGroups && excludedImportTypes.has('type');

    if (importEntry.type === 'import:object') {
        impType = 'object';
    } else if (isTypeOnlyImport && isTypeGroupInGroups && !isSortingTypesGroup) {
        impType = 'type';
    } else {
        impType = importType(importEntry.value!, context);
    }

    if (!excludedImportTypes.has(impType) && !isExcludedFromPathRank) {
        rank = computePathRank(ranks.groups, ranks.pathGroups, importEntry.value!, ranks.maxPosition);
    }

    if (typeof rank === 'undefined') {
        rank = (ranks.groups as Partial<Record<ImportGroup | 'absolute', number>>)[impType];

        if (typeof rank === 'undefined') {
            return -1;
        }
    }

    if (isTypeOnlyImport && isSortingTypesGroup) {
        rank = ranks.groups.type + rank / 10;
    }

    if (importEntry.type !== 'import' && !importEntry.type.startsWith('import:')) {
        rank += 100;
    }

    return rank;
}

/**
 * Register node.
 * @param context The rule context.
 * @param importEntry The import entry value.
 * @param ranks The ranks value.
 * @param imported The imported value.
 * @param excludedImportTypes The excluded import types value.
 * @param isSortingTypesGroup The is sorting types group value.
 */
function registerNode(
    context: RuleContext,
    importEntry: ImportEntry,
    ranks: OrderRanks,
    imported: OrderedEntry[],
    excludedImportTypes: Set<string>,
    isSortingTypesGroup: boolean | undefined,
) {
    const rank = computeRank(context, ranks, importEntry, excludedImportTypes, isSortingTypesGroup);
    if (rank !== -1) {
        let importNode = importEntry.node;

        if (importEntry.type === 'require' && importNode.parent.parent.type === 'VariableDeclaration') {
            importNode = importNode.parent.parent;
        }

        imported.push({
            ...importEntry,
            rank,
            isMultiline: importNode.loc.end.line !== importNode.loc.start.line,
        });
    }
}

/**
 * Get require block.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function getRequireBlock(node: Node) {
    let n = node;
    // Handle cases like `const baz = require('foo').bar.baz`
    // and `const foo = require('foo')()`
    while (
        (n.parent.type === 'MemberExpression' && n.parent.object === n)
        || (n.parent.type === 'CallExpression' && n.parent.callee === n)
    ) {
        n = n.parent;
    }
    if (
        n.parent.type === 'VariableDeclarator'
        && n.parent.parent.type === 'VariableDeclaration'
        && n.parent.parent.parent.type === 'Program'
    ) {
        return n.parent.parent.parent;
    }

    return undefined;
}

const types: ImportGroup[] = [
    'builtin',
    'external',
    'internal',
    'unknown',
    'parent',
    'sibling',
    'index',
    'object',
    'type',
];

/**
 * Creates an object with type-rank pairs.
 *
 * Example: { index: 0, sibling: 1, parent: 1, external: 1, builtin: 2, internal: 2 }
 * @param groups The groups value.
 * @returns The result of this check.
 */
function convertGroupsToRanks(groups: (ImportGroup | ImportGroup[])[]) {
    const rankObject = groups.reduce<Partial<Record<ImportGroup, number>>>((res, group, index) => {
        ([] as ImportGroup[]).concat(group).forEach((groupItem) => {
            Object.assign(res, { [groupItem]: index * 2 });
        });
        return res;
    }, {});

    const omittedTypes = types.filter((type) => typeof rankObject[type] === 'undefined');

    const ranks = omittedTypes.reduce((res, type) => {
        Object.assign(res, { [type]: groups.length * 2 });
        return res;
    }, rankObject);

    return { groups: ranks as Record<ImportGroup, number>, omittedTypes };
}

/**
 * Convert path groups for ranks.
 * @param pathGroups The path groups value.
 * @returns The result of this check.
 */
function convertPathGroupsForRanks(pathGroups: PathGroup[]) {
    const after: Record<string, number> = {};
    const before: Record<string, number[]> = {};

    const transformed = pathGroups.map((pathGroup, index) => {
        const { group, position: positionString } = pathGroup;
        let position = 0;
        if (positionString === 'after') {
            if (!after[group]) {
                after[group] = 1;
            }
            position = after[group]!;
            after[group] = position + 1;
        } else if (positionString === 'before') {
            if (!before[group]) {
                before[group] = [];
            }
            before[group]!.push(index);
        }

        return { ...pathGroup, position };
    });

    let maxPosition = 1;

    Object.keys(before).forEach((group) => {
        const groupLength = before[group]!.length;
        before[group]!.forEach((groupIndex, index) => {
            transformed[groupIndex]!.position = -1 * (groupLength - index);
        });
        maxPosition = Math.max(maxPosition, groupLength);
    });

    Object.keys(after).forEach((key) => {
        const groupNextPosition = after[key]!;
        maxPosition = Math.max(maxPosition, groupNextPosition - 1);
    });

    return {
        pathGroups: transformed,
        maxPosition: maxPosition > 10 ? 10 ** Math.ceil(Math.log10(maxPosition)) : 10,
    };
}

/**
 * Fix new line after import.
 * @param context The rule context.
 * @param previousImport The previous import value.
 * @returns The result of this check.
 */
function fixNewLineAfterImport(context: RuleContext, previousImport: OrderedEntry) {
    const prevRoot = findRootNode(previousImport.node);
    const tokensToEndOfLine = takeTokensAfterWhile(
        getSourceCode(context),
        prevRoot,
        commentOnSameLineAs(prevRoot),
    );

    let endOfLine = prevRoot.range[1];
    if (tokensToEndOfLine.length > 0) {
        [, endOfLine] = tokensToEndOfLine[tokensToEndOfLine.length - 1]!.range;
    }
    return (fixer: Fixer) => fixer.insertTextAfterRange([prevRoot.range[0], endOfLine], '\n');
}

/**
 * Remove new line after import.
 * @param context The rule context.
 * @param currentImport The current import value.
 * @param previousImport The previous import value.
 * @returns The result of this check.
 */
function removeNewLineAfterImport(
    context: RuleContext,
    currentImport: OrderedEntry,
    previousImport: OrderedEntry,
) {
    const sourceCode = getSourceCode(context);
    const prevRoot = findRootNode(previousImport.node);
    const currRoot = findRootNode(currentImport.node);
    const rangeToRemove: [number, number] = [
        findEndOfLineWithComments(sourceCode, prevRoot),
        findStartOfLineWithComments(sourceCode, currRoot),
    ];
    if (/^\s*$/.test(sourceCode.text.substring(rangeToRemove[0], rangeToRemove[1]))) {
        return (fixer: Fixer) => fixer.removeRange(rangeToRemove);
    }
    return undefined;
}

/**
 * Make newlines between report.
 * @param context The rule context.
 * @param imported The imported value.
 * @param newlinesBetweenImports_ The newlines between imports_ value.
 * @param newlinesBetweenTypeOnlyImports_ The newlines between type only imports_ value.
 * @param distinctGroup The distinct group value.
 * @param isSortingTypesGroup The is sorting types group value.
 * @param isConsolidatingSpaceBetweenImports The is consolidating space between imports value.
 */
function makeNewlinesBetweenReport(
    context: RuleContext,
    imported: OrderedEntry[],
    newlinesBetweenImports_: NewlineMode,
    newlinesBetweenTypeOnlyImports_: NewlineMode,
    distinctGroup: boolean,
    isSortingTypesGroup: boolean | undefined,
    isConsolidatingSpaceBetweenImports: boolean,
) {
    const getNumberOfEmptyLinesBetween = (currentImport: OrderedEntry, previousImport: OrderedEntry) => {
        const linesBetweenImports = getSourceCode(context).lines.slice(
            previousImport.node.loc.end.line,
            currentImport.node.loc.start.line - 1,
        );

        return linesBetweenImports.filter((line) => !line.trim().length).length;
    };
    const getIsStartOfDistinctGroup = (currentImport: OrderedEntry, previousImport: OrderedEntry) => (
        currentImport.rank - 1 >= previousImport.rank
    );
    let previousImport = imported[0]!;

    imported.slice(1).forEach((currentImport) => {
        const emptyLinesBetween = getNumberOfEmptyLinesBetween(currentImport, previousImport);

        const isStartOfDistinctGroup = getIsStartOfDistinctGroup(currentImport, previousImport);

        const isTypeOnlyImport = currentImport.node.importKind === 'type';
        const isPreviousImportTypeOnlyImport = previousImport.node.importKind === 'type';

        const isTypeGroupTransition = isTypeOnlyImport !== isPreviousImportTypeOnlyImport && isSortingTypesGroup;

        const isTypeOnlyImportAndRelevant = isTypeOnlyImport && isSortingTypesGroup;

        // In the special case where newlinesBetweenImports and consolidateIslands
        // want the opposite thing, consolidateIslands wins
        const newlinesBetweenImports = isSortingTypesGroup
            && isConsolidatingSpaceBetweenImports
            && (previousImport.isMultiline || currentImport.isMultiline)
            && newlinesBetweenImports_ === 'never'
            ? 'always-and-inside-groups'
            : newlinesBetweenImports_;

        // In the special case where newlinesBetweenTypeOnlyImports and
        // consolidateIslands want the opposite thing, consolidateIslands wins
        const newlinesBetweenTypeOnlyImports = isSortingTypesGroup
            && isConsolidatingSpaceBetweenImports
            && (isTypeGroupTransition
                || previousImport.isMultiline
                || currentImport.isMultiline)
            && newlinesBetweenTypeOnlyImports_ === 'never'
            ? 'always-and-inside-groups'
            : newlinesBetweenTypeOnlyImports_;

        const isNotIgnored = (isTypeOnlyImportAndRelevant && newlinesBetweenTypeOnlyImports !== 'ignore')
            || (!isTypeOnlyImportAndRelevant && newlinesBetweenImports !== 'ignore');

        if (isNotIgnored) {
            const shouldAssertNewlineBetweenGroups = ((isTypeOnlyImportAndRelevant || isTypeGroupTransition)
                    && (newlinesBetweenTypeOnlyImports === 'always'
                        || newlinesBetweenTypeOnlyImports === 'always-and-inside-groups'))
                || (!isTypeOnlyImportAndRelevant
                    && !isTypeGroupTransition
                    && (newlinesBetweenImports === 'always'
                        || newlinesBetweenImports === 'always-and-inside-groups'));

            const shouldAssertNoNewlineWithinGroup = ((isTypeOnlyImportAndRelevant || isTypeGroupTransition)
                    && newlinesBetweenTypeOnlyImports !== 'always-and-inside-groups')
                || (!isTypeOnlyImportAndRelevant
                    && !isTypeGroupTransition
                    && newlinesBetweenImports !== 'always-and-inside-groups');

            const shouldAssertNoNewlineBetweenGroup = !isSortingTypesGroup
                || !isTypeGroupTransition
                || newlinesBetweenTypeOnlyImports === 'never';

            const isSameGroup = (distinctGroup && currentImport.rank === previousImport.rank)
                || (!distinctGroup && !isStartOfDistinctGroup);

            // Let's try to cut down on linting errors sent to the user
            let alreadyReported = false;

            if (shouldAssertNewlineBetweenGroups) {
                if (currentImport.rank !== previousImport.rank && emptyLinesBetween === 0) {
                    if (distinctGroup || isStartOfDistinctGroup) {
                        alreadyReported = true;
                        context.report({
                            node: previousImport.node,
                            message: 'There should be at least one empty line between import groups',
                            fix: fixNewLineAfterImport(context, previousImport),
                        });
                    }
                } else if (emptyLinesBetween > 0 && shouldAssertNoNewlineWithinGroup) {
                    if (isSameGroup) {
                        alreadyReported = true;
                        context.report({
                            node: previousImport.node,
                            message: 'There should be no empty line within import group',
                            fix: removeNewLineAfterImport(context, currentImport, previousImport),
                        });
                    }
                }
            } else if (emptyLinesBetween > 0 && shouldAssertNoNewlineBetweenGroup) {
                alreadyReported = true;
                context.report({
                    node: previousImport.node,
                    message: 'There should be no empty line between import groups',
                    fix: removeNewLineAfterImport(context, currentImport, previousImport),
                });
            }

            if (!alreadyReported && isConsolidatingSpaceBetweenImports) {
                if (emptyLinesBetween === 0 && currentImport.isMultiline) {
                    context.report({
                        node: previousImport.node,
                        message:
                            'There should be at least one empty line between this import and the multi-line import that follows it',
                        fix: fixNewLineAfterImport(context, previousImport),
                    });
                } else if (emptyLinesBetween === 0 && previousImport.isMultiline) {
                    context.report({
                        node: previousImport.node,
                        message:
                            'There should be at least one empty line between this multi-line import and the import that follows it',
                        fix: fixNewLineAfterImport(context, previousImport),
                    });
                } else if (
                    emptyLinesBetween > 0
                    && !previousImport.isMultiline
                    && !currentImport.isMultiline
                    && isSameGroup
                ) {
                    context.report({
                        node: previousImport.node,
                        message:
                            'There should be no empty lines between this single-line import and the single-line import that follows it',
                        fix: removeNewLineAfterImport(context, currentImport, previousImport),
                    });
                }
            }
        }

        previousImport = currentImport;
    });
}

/**
 * Get alphabetize config.
 * @param options The configured rule options.
 * @returns The result of this check.
 */
function getAlphabetizeConfig(options: OrderOptions) {
    const alphabetize = options.alphabetize || {};
    const order = alphabetize.order || 'ignore';
    const orderImportKind = alphabetize.orderImportKind || 'ignore';
    const caseInsensitive = alphabetize.caseInsensitive || false;

    return { order, orderImportKind, caseInsensitive };
}

// TODO, semver-major: Change the default of "distinctGroup" from true to false
const defaultDistinctGroup = true;

const rule: LegacyRule<[OrderOptions?]> = {
    meta: {
        type: 'suggestion',
        docs: {
            category: 'Style guide',
            description: 'Enforce a convention in module import order.',
            url: docsUrl('order'),
        },

        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    groups: {
                        type: 'array',
                        uniqueItems: true,
                        items: {
                            oneOf: [
                                { enum: types },
                                {
                                    type: 'array',
                                    uniqueItems: true,
                                    items: { enum: types },
                                },
                            ],
                        },
                    },
                    pathGroupsExcludedImportTypes: {
                        type: 'array',
                    },
                    distinctGroup: {
                        type: 'boolean',
                        default: defaultDistinctGroup,
                    },
                    pathGroups: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                pattern: {
                                    type: 'string',
                                },
                                patternOptions: {
                                    type: 'object',
                                },
                                group: {
                                    type: 'string',
                                    enum: types,
                                },
                                position: {
                                    type: 'string',
                                    enum: ['after', 'before'],
                                },
                            },
                            additionalProperties: false,
                            required: ['pattern', 'group'],
                        },
                    },
                    'newlines-between': {
                        enum: ['ignore', 'always', 'always-and-inside-groups', 'never'],
                    },
                    'newlines-between-types': {
                        enum: ['ignore', 'always', 'always-and-inside-groups', 'never'],
                    },
                    consolidateIslands: {
                        enum: ['inside-groups', 'never'],
                    },
                    sortTypesGroup: {
                        type: 'boolean',
                        default: false,
                    },
                    named: {
                        default: false,
                        oneOf: [
                            {
                                type: 'boolean',
                            },
                            {
                                type: 'object',
                                properties: {
                                    enabled: { type: 'boolean' },
                                    import: { type: 'boolean' },
                                    export: { type: 'boolean' },
                                    require: { type: 'boolean' },
                                    cjsExports: { type: 'boolean' },
                                    types: {
                                        type: 'string',
                                        enum: ['mixed', 'types-first', 'types-last'],
                                    },
                                },
                                additionalProperties: false,
                            },
                        ],
                    },
                    alphabetize: {
                        type: 'object',
                        properties: {
                            caseInsensitive: {
                                type: 'boolean',
                                default: false,
                            },
                            order: {
                                enum: ['ignore', 'asc', 'desc'],
                                default: 'ignore',
                            },
                            orderImportKind: {
                                enum: ['ignore', 'asc', 'desc'],
                                default: 'ignore',
                            },
                        },
                        additionalProperties: false,
                    },
                    warnOnUnassignedImports: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
                dependencies: {
                    sortTypesGroup: {
                        oneOf: [
                            {
                                // When sortTypesGroup is true, groups must NOT be an array that does not contain
                                // 'type'
                                properties: {
                                    sortTypesGroup: { enum: [true] },
                                    groups: {
                                        not: {
                                            type: 'array',
                                            uniqueItems: true,
                                            items: {
                                                oneOf: [
                                                    { enum: types.filter((t) => t !== 'type') },
                                                    {
                                                        type: 'array',
                                                        uniqueItems: true,
                                                        items: {
                                                            enum: types.filter((t) => t !== 'type'),
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    },
                                },
                                required: ['groups'],
                            },
                            {
                                properties: {
                                    sortTypesGroup: { enum: [false] },
                                },
                            },
                        ],
                    },
                    'newlines-between-types': {
                        properties: {
                            sortTypesGroup: { enum: [true] },
                        },
                        required: ['sortTypesGroup'],
                    },
                    consolidateIslands: {
                        oneOf: [
                            {
                                properties: {
                                    consolidateIslands: { enum: ['inside-groups'] },
                                },
                                anyOf: [
                                    {
                                        properties: {
                                            'newlines-between': { enum: ['always-and-inside-groups'] },
                                        },
                                        required: ['newlines-between'],
                                    },
                                    {
                                        properties: {
                                            'newlines-between-types': {
                                                enum: ['always-and-inside-groups'],
                                            },
                                        },
                                        required: ['newlines-between-types'],
                                    },
                                ],
                            },
                            {
                                properties: {
                                    consolidateIslands: { enum: ['never'] },
                                },
                            },
                        ],
                    },
                },
            },
        ],
    },

    create(context) {
        const options = context.options[0] || {};
        const newlinesBetweenImports = options['newlines-between'] || 'ignore';
        const newlinesBetweenTypeOnlyImports = options['newlines-between-types'] || newlinesBetweenImports;
        const pathGroupsExcludedImportTypes = new Set(
            options.pathGroupsExcludedImportTypes || ['builtin', 'external', 'object'],
        );
        const { sortTypesGroup } = options;
        const consolidateIslands = options.consolidateIslands || 'never';

        const named = {
            types: 'mixed',
            ...(typeof options.named === 'object'
                ? {
                    ...options.named,
                    import: 'import' in options.named ? options.named.import : options.named.enabled,
                    export: 'export' in options.named ? options.named.export : options.named.enabled,
                    require:
                          'require' in options.named ? options.named.require : options.named.enabled,
                    cjsExports:
                          'cjsExports' in options.named
                              ? options.named.cjsExports
                              : options.named.enabled,
                }
                : {
                    import: options.named,
                    export: options.named,
                    require: options.named,
                    cjsExports: options.named,
                }),
        };

        let namedGroups: string[] = [];
        if (named.types !== 'mixed') {
            namedGroups = named.types === 'types-last' ? ['value'] : ['type'];
        }
        const alphabetize = getAlphabetizeConfig(options);
        const distinctGroup = options.distinctGroup == null ? defaultDistinctGroup : !!options.distinctGroup;
        let ranks: OrderRanks;

        try {
            const { pathGroups, maxPosition } = convertPathGroupsForRanks(options.pathGroups || []);
            const { groups, omittedTypes } = convertGroupsToRanks(options.groups || defaultGroups);
            ranks = {
                groups,
                omittedTypes,
                pathGroups,
                maxPosition,
            };
        } catch (error) {
            // Malformed configuration
            return {
                Program(node: Node<'Program'>) {
                    context.report(node, (error as Error).message);
                },
            };
        }
        const importMap = new Map<Node, OrderedEntry[]>();
        const exportMap = new Map<Node, OrderedEntry[]>();

        const isTypeGroupInGroups = ranks.omittedTypes.indexOf('type') === -1;
        const isSortingTypesGroup = isTypeGroupInGroups && sortTypesGroup;

        /**
         * Get block imports.
         * @param node The node to inspect.
         * @returns The result of this check.
         */
        function getBlockImports(node: Node) {
            if (!importMap.has(node)) {
                importMap.set(node, []);
            }
            return importMap.get(node)!;
        }

        /**
         * Get block exports.
         * @param node The node to inspect.
         * @returns The result of this check.
         */
        function getBlockExports(node: Node) {
            if (!exportMap.has(node)) {
                exportMap.set(node, []);
            }
            return exportMap.get(node)!;
        }

        /**
         * Make named order report.
         * @param selectedContext The rule context.
         * @param namedImports The named imports value.
         */
        function makeNamedOrderReport(selectedContext: RuleContext, namedImports: ImportEntry[]) {
            if (namedImports.length > 1) {
                const imports = namedImports.map((namedImport) => {
                    const kind = namedImport.kind || 'value';
                    const rank = namedGroups.findIndex(
                        (entry) => ([] as string[]).concat(entry).indexOf(kind) > -1,
                    );

                    return {
                        displayName: namedImport.value,
                        rank: rank === -1 ? namedGroups.length : rank,
                        ...namedImport,
                        value: `${namedImport.value}:${namedImport.alias || ''}`,
                    };
                });

                if (alphabetize.order !== 'ignore') {
                    mutateRanksToAlphabetize(imports, alphabetize);
                }

                makeOutOfOrderReport(selectedContext, imports, categories.named);
            }
        }

        return {
            ImportDeclaration(node: Node<'ImportDeclaration'>) {
                // Ignoring unassigned imports unless warnOnUnassignedImports is set
                if (node.specifiers.length || options.warnOnUnassignedImports) {
                    const name = node.source.value;
                    registerNode(
                        context,
                        {
                            node,
                            value: name,
                            displayName: name,
                            type: 'import',
                        },
                        ranks,
                        getBlockImports(node.parent),
                        pathGroupsExcludedImportTypes,
                        isSortingTypesGroup,
                    );

                    if (named.import) {
                        makeNamedOrderReport(
                            context,
                            node.specifiers
                                .filter((specifier) => specifier.type === 'ImportSpecifier')
                                .map((specifier) => ({
                                    node: specifier,
                                    value: specifier.imported.name,
                                    type: 'import',
                                    kind: specifier.importKind,
                                    ...(specifier.local!.range[0] !== specifier.imported.range[0] && {
                                        alias: specifier.local!.name,
                                    }),
                                })),
                        );
                    }
                }
            },
            TSImportEqualsDeclaration(node: Node<'TSImportEqualsDeclaration'>) {
                // skip "export import"s
                if (node.isExport) {
                    return;
                }

                let displayName;
                let value;
                let type: ImportEntry['type'];
                if (node.moduleReference.type === 'TSExternalModuleReference') {
                    value = node.moduleReference.expression.value as string;
                    displayName = value;
                    type = 'import';
                } else {
                    value = '';
                    displayName = getSourceCode(context).getText(node.moduleReference);
                    type = 'import:object';
                }

                registerNode(
                    context,
                    {
                        node,
                        value,
                        displayName,
                        type,
                    },
                    ranks,
                    getBlockImports(node.parent),
                    pathGroupsExcludedImportTypes,
                    isSortingTypesGroup,
                );
            },
            CallExpression(node: Node<'CallExpression'>) {
                if (!isStaticRequire(node)) {
                    return;
                }
                const block = getRequireBlock(node);
                if (!block) {
                    return;
                }
                const name = node.arguments[0]!.value as string;
                registerNode(
                    context,
                    {
                        node,
                        value: name,
                        displayName: name,
                        type: 'require',
                    },
                    ranks,
                    getBlockImports(block),
                    pathGroupsExcludedImportTypes,
                    isSortingTypesGroup,
                );
            },
            ...(named.require && {
                VariableDeclarator(node: Node<'VariableDeclarator'>) {
                    if (node.id.type === 'ObjectPattern' && isRequireExpression(node.init)) {
                        for (let i = 0; i < node.id.properties.length; i += 1) {
                            if (
                                node.id.properties[i]!.key!.type !== 'Identifier'
                                || node.id.properties[i]!.value!.type !== 'Identifier'
                            ) {
                                return;
                            }
                        }
                        makeNamedOrderReport(
                            context,
                            node.id.properties.map((prop) => ({
                                node: prop,
                                value: prop.key!.name,
                                type: 'require',
                                ...(prop.key!.range[0] !== prop.value!.range[0] && {
                                    alias: prop.value!.name,
                                }),
                            })),
                        );
                    }
                },
            }),
            ...(named.export && {
                ExportNamedDeclaration(node: Node<'ExportNamedDeclaration'>) {
                    makeNamedOrderReport(
                        context,
                        node.specifiers.map((specifier) => ({
                            node: specifier,
                            value: specifier.local!.name,
                            type: 'export',
                            kind: specifier.exportKind,
                            ...(specifier.local!.range[0] !== specifier.exported.range[0] && {
                                alias: specifier.exported.name,
                            }),
                        })),
                    );
                },
            }),
            ...(named.cjsExports && {
                AssignmentExpression(node: Node<'AssignmentExpression'>) {
                    if (node.parent.type === 'ExpressionStatement') {
                        if (isCJSExports(context, node.left)) {
                            if (node.right.type === 'ObjectExpression') {
                                for (let i = 0; i < node.right.properties.length; i += 1) {
                                    if (
                                        !node.right.properties[i]!.key
                                        || node.right.properties[i]!.key!.type !== 'Identifier'
                                        || !node.right.properties[i]!.value
                                        || node.right.properties[i]!.value!.type !== 'Identifier'
                                    ) {
                                        return;
                                    }
                                }

                                makeNamedOrderReport(
                                    context,
                                    node.right.properties.map((prop) => ({
                                        node: prop,
                                        value: prop.key!.name,
                                        type: 'export',
                                        ...(prop.key!.range[0] !== prop.value!.range[0] && {
                                            alias: prop.value!.name,
                                        }),
                                    })),
                                );
                            }
                        } else {
                            const nameParts = getNamedCJSExports(context, node.left);
                            if (nameParts && nameParts.length > 0) {
                                const name = nameParts.join('.');
                                getBlockExports(node.parent.parent).push({
                                    node,
                                    value: name,
                                    displayName: name,
                                    type: 'export',
                                    rank: 0,
                                });
                            }
                        }
                    }
                },
            }),
            'Program:exit': function onProgramExit() {
                importMap.forEach((imported) => {
                    if (
                        newlinesBetweenImports !== 'ignore'
                        || newlinesBetweenTypeOnlyImports !== 'ignore'
                    ) {
                        makeNewlinesBetweenReport(
                            context,
                            imported,
                            newlinesBetweenImports,
                            newlinesBetweenTypeOnlyImports,
                            distinctGroup,
                            isSortingTypesGroup,
                            consolidateIslands === 'inside-groups'
                                && (newlinesBetweenImports === 'always-and-inside-groups'
                                    || newlinesBetweenTypeOnlyImports === 'always-and-inside-groups'),
                        );
                    }

                    if (alphabetize.order !== 'ignore') {
                        mutateRanksToAlphabetize(imported, alphabetize);
                    }

                    makeOutOfOrderReport(context, imported, categories.import);
                });

                exportMap.forEach((exported) => {
                    if (alphabetize.order !== 'ignore') {
                        mutateRanksToAlphabetize(exported, alphabetize);
                        makeOutOfOrderReport(context, exported, categories.exports);
                    }
                });

                importMap.clear();
                exportMap.clear();
            },
        };
    },
};
export default rule;
