/**
 * @file Utility functions for JSX
 */
import dependency0 from 'jsx-ast-utils/elementType.js';
import dependency1 from './ast';
import dependency2 from './isCreateElement';
import dependency3 from './variable';
import type { Node, RuleContext } from '../../types';

const elementType = dependency0;

const astUtil = dependency1;
const isCreateElement = dependency2;
const variableUtil = dependency3;

// See https://github.com/babel/babel/blob/ce420ba51c68/packages/babel-types/src/validators/react/isCompatTag.js
// for why we only test for the first character
const COMPAT_TAG_REGEX = /^[a-z]/;

/**
 * Checks if a node represents a DOM element according to React.
 * @param node - JSXOpeningElement to check.
 * @returns Whether or not the node corresponds to a DOM element.
 */
function isDOMComponent(node: Node) {
    const name = elementType(node);
    return COMPAT_TAG_REGEX.test(name);
}

/**
 * Test whether a JSXElement is a fragment
 * @param node The value to inspect.
 * @param reactPragma The value to inspect.
 * @param fragmentPragma The value to inspect.
 * @returns The result of this check.
 */
function isFragment(node: Node<'JSXElement'>, reactPragma: string, fragmentPragma: string) {
    const { name } = node.openingElement;

    // <Fragment>
    if (name.type === 'JSXIdentifier' && name.name === fragmentPragma) {
        return true;
    }

    // <React.Fragment>
    if (
        name.type === 'JSXMemberExpression'
        && name.object.type === 'JSXIdentifier'
        && name.object.name === reactPragma
        && name.property.type === 'JSXIdentifier'
        && name.property.name === fragmentPragma
    ) {
        return true;
    }

    return false;
}

/**
 * Checks if a node represents a JSX element or fragment.
 * @param node - node to check.
 * @returns Whether or not the node if a JSX element or fragment.
 */
function isJSX(node: Node | null | undefined): node is Node<'JSXElement' | 'JSXFragment'> {
    return !!node && ['JSXElement', 'JSXFragment'].indexOf(node.type) >= 0;
}

/**
 * Check if node is like `key={...}` as in `<Foo key={...} />`
 * @param node The value to inspect.
 * @returns The result of this check.
 */
function isJSXAttributeKey(node: Node) {
    return (
        node.type === 'JSXAttribute'
        && node.name
        && node.name.type === 'JSXIdentifier'
        && node.name.name === 'key'
    );
}

/**
 * Check if value has only whitespaces
 * @param value The value to inspect.
 * @returns The result of this check.
 */
function isWhiteSpaces(value: unknown) {
    return typeof value === 'string' ? /^\s*$/.test(value) : false;
}

/**
 * Check if the node is returning JSX or null
 * @param context The context of `ASTNode`.
 * @param ASTnode The AST node being checked
 * @param [strict] If true, in a ternary condition the node must return JSX in both cases
 * @param [ignoreNull] If true, null return values will be ignored
 * @returns True if the node is returning JSX or null, false if not
 */
function isReturningJSX(context: RuleContext, ASTnode: Node, strict?: boolean, ignoreNull?: boolean) {
    const isJSXValue = (node: Node | null | undefined): boolean => {
        if (!node) {
            return false;
        }
        switch (node.type) {
            case 'ConditionalExpression':
                if (strict) {
                    return isJSXValue(node.consequent) && isJSXValue(node.alternate);
                }
                return isJSXValue(node.consequent) || isJSXValue(node.alternate);
            case 'LogicalExpression':
                if (strict) {
                    return isJSXValue(node.left) && isJSXValue(node.right);
                }
                return isJSXValue(node.left) || isJSXValue(node.right);
            case 'SequenceExpression':
                return isJSXValue(node.expressions[node.expressions.length - 1]);
            case 'JSXElement':
            case 'JSXFragment':
                return true;
            case 'CallExpression':
                return isCreateElement(context, node);
            case 'Literal':
                if (!ignoreNull && node.value === null) {
                    return true;
                }
                return false;
            case 'Identifier': {
                const variable = variableUtil.findVariableByName(context, node, node.name);
                return isJSX(variable);
            }
            default:
                return false;
        }
    };

    let found = false;
    astUtil.traverseReturns(ASTnode, context, (node, breakTraverse) => {
        if (isJSXValue(node)) {
            found = true;
            breakTraverse();
        }
    });

    return found;
}

/**
 * Check if the node is returning only null values
 * @param ASTnode The AST node being checked
 * @param context The context of `ASTNode`.
 * @returns True if the node is returning only null values
 */
function isReturningOnlyNull(ASTnode: Node, context: RuleContext) {
    let found = false;
    let foundSomethingElse = false;
    astUtil.traverseReturns(ASTnode, context, (node) => {
        // Traverse return statement
        astUtil.traverse(node!, {
            enter(childNode) {
                const setFound = () => {
                    found = true;
                    this.skip();
                };
                const setFoundSomethingElse = () => {
                    foundSomethingElse = true;
                    this.skip();
                };
                switch (childNode.type) {
                    case 'ReturnStatement':
                        break;
                    case 'ConditionalExpression':
                        if (childNode.consequent.value === null && childNode.alternate.value === null) {
                            setFound();
                        }
                        break;
                    case 'Literal':
                        if (childNode.value === null) {
                            setFound();
                        }
                        break;
                    default:
                        setFoundSomethingElse();
                }
            },
        });
    });

    return found && !foundSomethingElse;
}

export default {
    isDOMComponent,
    isFragment,
    isJSX,
    isJSXAttributeKey,
    isWhiteSpaces,
    isReturningJSX,
    isReturningOnlyNull,
};
