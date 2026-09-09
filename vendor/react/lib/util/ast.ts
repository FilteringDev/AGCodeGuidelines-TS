/**
 * @file Utility functions for AST
 */
import dependency0 from 'estraverse';
import dependency1 from './eslint';
import type {
    Node, RuleContext, Token, Scope,
} from '../../types';

interface TraversalController {
    break(): void;
    skip(): void;
}
interface TraversalVisitor {
    enter?(this: TraversalController, node: Node, parent: Node | null): void;
    leave?(this: TraversalController, node: Node, parent: Node | null): void;
    keys?: Record<string, string[]>;
    fallback?: (node: Node) => string[];
}
// Estraverse uses the same node visitor protocol for parser extension nodes.
const estraverse = dependency0 as unknown as { traverse(node: Node, visitor: TraversalVisitor): void };
/**
 * @param value The value to inspect.
 * @returns The result of this check.
 */
function isNode(value: unknown): value is Node {
    return value !== null && typeof value === 'object' && 'type' in value;
}
const eslintUtil = dependency1;

const { getFirstTokens } = eslintUtil;
const { getScope } = eslintUtil;
const { getSourceCode } = eslintUtil;
// const pragmaUtil = require('./pragma');

/**
 * Wrapper for estraverse.traverse
 * @param ASTnode The AST node being checked
 * @param visitor Visitor Object for estraverse
 */
function traverse(ASTnode: Node, visitor: TraversalVisitor) {
    const opts: TraversalVisitor = {
        fallback(node: Node) {
            return Object.keys(node).filter((key) => key === 'children' || key === 'argument');
        },
        ...visitor,
    };

    opts.keys = {
        ...visitor.keys,
        JSXElement: ['children'],
        JSXFragment: ['children'],
    };

    estraverse.traverse(ASTnode, opts);
}

/**
 * @param nodes The nodes to inspect.
 * @returns The result of this check.
 */
function loopNodes(nodes: Node[]): Node<'ReturnStatement'> | false {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
        const node = nodes[i]!;
        if (node.type === 'ReturnStatement') {
            return node;
        }
        if (node.type === 'SwitchStatement') {
            const j = node.cases.length - 1;
            if (j >= 0) {
                return loopNodes(node.cases[j]!.consequent);
            }
        }
    }
    return false;
}

/**
 * Find the final return statement in a function or method body.
 * @param node The value to inspect.
 * @returns The result of this check.
 */
function findReturnStatement(node: Node): Node<'ReturnStatement'> | false {
    const valueBody = isNode(node.value) && isNode(node.value.body) ? node.value.body.body : undefined;
    const directBody = isNode(node.body) ? node.body.body : undefined;
    if (!valueBody && !directBody) {
        return false;
    }
    const bodyNodes = node.value ? valueBody : directBody;
    // These fields are statement arrays after the body probes above.
    return loopNodes(bodyNodes as Node[]);
}

/**
 * Helper function for traversing "returns" (return statements or the
 * returned expression in the case of an arrow function) of a function
 * @param ASTNode The AST node being checked
 * @param context The context of `ASTNode`.
 * @param onReturn The value to inspect.
 *   Function to execute for each returnStatement found
 */
function traverseReturns(
    ASTNode: Node,
    context: RuleContext,
    onReturn: (returnValue: Node | null | undefined, breakTraverse: () => void) => void,
) {
    const nodeType = ASTNode.type;

    if (nodeType === 'ReturnStatement') {
        onReturn(ASTNode.argument, () => {});
        return;
    }

    if (nodeType === 'ArrowFunctionExpression' && ASTNode.expression) {
        onReturn(ASTNode.body, () => {});
        return;
    }

    /**
     * TODO: properly warn on React.forwardRefs having typo properties
     * if (astUtil.isCallExpression(ASTNode)) {
     * const callee = ASTNode.callee;
     * const pragma = pragmaUtil.getFromContext(context);
     * if (
     * callee.type === 'MemberExpression'
     * && callee.object.type === 'Identifier'
     * && callee.object.name === pragma
     * && callee.property.type === 'Identifier'
     * && callee.property.name === 'forwardRef'
     * && ASTNode.arguments.length > 0
     * ) {
     * return enterFunc(ASTNode.arguments[0]);
     * }
     * return;
     * }
     */

    if (
        nodeType !== 'FunctionExpression'
        && nodeType !== 'FunctionDeclaration'
        && nodeType !== 'ArrowFunctionExpression'
        && nodeType !== 'MethodDefinition'
    ) {
        return;
    }

    traverse(ASTNode.body as Node, {
        enter(node: Node) {
            const breakTraverse = () => {
                this.break();
            };
            switch (node.type) {
                case 'ReturnStatement':
                    this.skip();
                    onReturn(node.argument, breakTraverse);
                    return;
                case 'BlockStatement':
                case 'IfStatement':
                case 'ForStatement':
                case 'WhileStatement':
                case 'SwitchStatement':
                case 'SwitchCase':
                    return;
                default:
                    this.skip();
            }
        },
    });
}

/**
 * Get node with property's name
 * @param node - Property.
 * @returns Property name node.
 */
function getPropertyNameNode(node: Node) {
    if (node.key) {
        return node.key;
    }
    if (node.type === 'MemberExpression') {
        return node.property;
    }
    return null;
}

/**
 * Get properties name
 * @param node - Property.
 * @returns Property name.
 */
function getPropertyName(node: Node) {
    const nameNode = getPropertyNameNode(node);
    return nameNode ? nameNode.name : '';
}

/**
 * Get properties for a given AST node
 * @param node The AST node being checked.
 * @returns Properties array.
 */
function getComponentProperties(node: Node) {
    switch (node.type) {
        case 'ClassDeclaration':
        case 'ClassExpression':
            return node.body.body;
        case 'ObjectExpression':
            return node.properties;
        default:
            return [];
    }
}

/**
 * Gets the first node in a line from the initial node, excluding whitespace.
 * @param context The node to check
 * @param node The node to check
 * @returns the first node in the line
 */
function getFirstNodeInLine(context: RuleContext, node: Node | Token) {
    const sourceCode = getSourceCode(context);
    let token: Node | Token | null = node;
    let lines;
    do {
        token = sourceCode.getTokenBefore(token!);
        lines = token?.type === 'JSXText' ? token.value.split('\n') : null;
    } while (token?.type === 'JSXText' && /^\s*$/.test(lines![lines!.length - 1]!));
    return token;
}

/**
 * Checks if the node is the first in its line, excluding whitespace.
 * @param context The node to check
 * @param node The node to check
 * @returns true if it's the first node in its line
 */
function isNodeFirstInLine(context: RuleContext, node: Node | Token) {
    const token = getFirstNodeInLine(context, node);
    const startLine = node.loc.start.line;
    const endLine = token ? token.loc.end.line : -1;
    return startLine !== endLine;
}

/**
 * Checks if the node is a function or arrow function expression.
 * @param node The node to check
 * @returns true if it's a function-like expression
 */
function isFunctionLikeExpression(node: Node) {
    return node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
}

/**
 * Checks if the node is a function.
 * @param node The node to check
 * @returns true if it's a function
 */
function isFunction(node: Node) {
    return node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration';
}

/**
 * Checks if node is a function declaration or expression or arrow function.
 * @param node The node to check
 * @returns true if it's a function-like
 */
function isFunctionLike(node: Node) {
    return node.type === 'FunctionDeclaration' || isFunctionLikeExpression(node);
}

/**
 * Checks if the node is a class.
 * @param node The node to check
 * @returns true if it's a class
 */
function isClass(node: Node) {
    return node.type === 'ClassDeclaration' || node.type === 'ClassExpression';
}

/**
 * Check if we are in a class constructor
 * @param context The value to inspect.
 * @param node The AST node being checked.
 * @returns The result of this check.
 */
function inConstructor(context: RuleContext, node: Node) {
    let scope: Scope | null = getScope(context, node);
    while (scope) {
        if (scope.block && scope.block.parent && scope.block.parent.kind === 'constructor') {
            return true;
        }
        scope = scope.upper;
    }
    return false;
}

/**
 * Removes quotes from around an identifier.
 * @param string the identifier to strip
 * @returns The result of this check.
 */
function stripQuotes(string: string) {
    return string.replace(/^'|'$/g, '');
}

/**
 * Retrieve the name of a key node
 * @param context The AST node with the key.
 * @param node The AST node with the key.
 * @returns the name of the key
 */
function getKeyValue(context: RuleContext, node: Node) {
    if (node.type === 'ObjectTypeProperty') {
        const tokens = getFirstTokens(context, node, 2);
        return tokens[0]!.value === '+' || tokens[0]!.value === '-'
            ? tokens[1]!.value
            : stripQuotes(tokens[0]!.value);
    }
    if (node.type === 'GenericTypeAnnotation') {
        return node.id.name;
    }
    if (node.type === 'ObjectTypeAnnotation') {
        return undefined;
    }
    const key = node.key || node.argument;
    if (!key) {
        return undefined;
    }
    return key.type === 'Identifier' ? key.name : key.value;
}

/**
 * Checks if a node is surrounded by parenthesis.
 * @param context - Context from the rule
 * @param node - Node to be checked
 * @returns The result of this check.
 */
function isParenthesized(context: RuleContext, node: Node) {
    const sourceCode = getSourceCode(context);
    const previousToken = sourceCode.getTokenBefore(node);
    const nextToken = sourceCode.getTokenAfter(node);

    return (
        !!previousToken
        && !!nextToken
        && previousToken.value === '('
        && previousToken.range[1] <= node.range[0]
        && nextToken.value === ')'
        && nextToken.range[0] >= node.range[1]
    );
}

/**
 * Checks if a node is being assigned a value: props.bar = 'bar'
 * @param node The AST node being checked.
 * @returns The result of this check.
 */
function isAssignmentLHS(node: Node) {
    return node.parent && node.parent.type === 'AssignmentExpression' && node.parent.left === node;
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTSAsExpression(node: Node | null | undefined): node is Node<'TSAsExpression'> {
    return !!node && node.type === 'TSAsExpression';
}

/**
 * Matcher used to check whether given node is a `CallExpression`
 * @param node The AST node
 * @returns True if node is a `CallExpression`, false if not
 */
function isCallExpression(node: Node | null | undefined): node is Node<'CallExpression'> {
    return !!node && node.type === 'CallExpression';
}

/**
 * Extracts the expression node that is wrapped inside a TS type assertion
 * @param node - potential TS node
 * @returns - unwrapped expression node
 */
function unwrapTSAsExpression(node: Node) {
    return isTSAsExpression(node) ? node.expression : node;
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTSTypeReference(node: Node | null | undefined): node is Node<'TSTypeReference'> {
    if (!node) {
        return false;
    }

    return node.type === 'TSTypeReference';
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTSTypeAnnotation(node: Node | null | undefined): node is Node<'TSTypeAnnotation'> {
    if (!node) {
        return false;
    }

    return node.type === 'TSTypeAnnotation';
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTSTypeLiteral(node: Node | null | undefined): node is Node<'TSTypeLiteral'> {
    if (!node) {
        return false;
    }

    return node.type === 'TSTypeLiteral';
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTSIntersectionType(node: Node | null | undefined): node is Node<'TSIntersectionType'> {
    if (!node) {
        return false;
    }

    return node.type === 'TSIntersectionType';
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTSInterfaceHeritage(node: Node | null | undefined): node is Node<'TSInterfaceHeritage'> {
    if (!node) {
        return false;
    }

    return node.type === 'TSInterfaceHeritage';
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTSInterfaceDeclaration(node: Node) {
    if (!node) {
        return false;
    }

    return (
        (node.type === 'ExportNamedDeclaration' && node.declaration
            ? node.declaration.type
            : node.type) === 'TSInterfaceDeclaration'
    );
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTSTypeDeclaration(node: Node) {
    if (!node) {
        return false;
    }

    const nodeToCheck = node.type === 'ExportNamedDeclaration' && node.declaration ? node.declaration : node;

    return nodeToCheck.type === 'VariableDeclaration' && nodeToCheck.kind === 'type';
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTSTypeAliasDeclaration(node: Node) {
    if (!node) {
        return false;
    }

    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
        return node.declaration.type === 'TSTypeAliasDeclaration' && node.exportKind === 'type';
    }
    return node.type === 'TSTypeAliasDeclaration';
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTSParenthesizedType(node: Node) {
    if (!node) {
        return false;
    }

    return node.type === 'TSTypeAliasDeclaration';
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTSFunctionType(node: Node | null | undefined): node is Node<'TSFunctionType'> {
    if (!node) {
        return false;
    }

    return node.type === 'TSFunctionType';
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTSTypeQuery(node: Node | null | undefined): node is Node<'TSTypeQuery'> {
    if (!node) {
        return false;
    }

    return node.type === 'TSTypeQuery';
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isTSTypeParameterInstantiation(
    node: Node | null | undefined,
): node is Node<'TSTypeParameterInstantiation'> {
    if (!node) {
        return false;
    }

    return node.type === 'TSTypeParameterInstantiation';
}

export default {
    findReturnStatement,
    getComponentProperties,
    getFirstNodeInLine,
    getKeyValue,
    getPropertyName,
    getPropertyNameNode,
    inConstructor,
    isAssignmentLHS,
    isCallExpression,
    isClass,
    isFunction,
    isFunctionLike,
    isFunctionLikeExpression,
    isNodeFirstInLine,
    isParenthesized,
    isTSAsExpression,
    isTSFunctionType,
    isTSInterfaceDeclaration,
    isTSInterfaceHeritage,
    isTSIntersectionType,
    isTSParenthesizedType,
    isTSTypeAliasDeclaration,
    isTSTypeAnnotation,
    isTSTypeDeclaration,
    isTSTypeLiteral,
    isTSTypeParameterInstantiation,
    isTSTypeQuery,
    isTSTypeReference,
    traverse,
    traverseReturns,
    unwrapTSAsExpression,
};
