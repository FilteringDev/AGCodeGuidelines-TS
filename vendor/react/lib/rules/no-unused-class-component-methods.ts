/**
 * @file Prevent declaring unused methods and properties of component class
 * @author Paweł Nowak, Berton Zhu
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/componentUtil';
import dependency2 from '../util/report';
import type { LegacyRule, Node } from '../../types';

const docsUrl = dependency0;
const componentUtil = dependency1;
const report = dependency2;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const LIFECYCLE_METHODS = new Set([
    'constructor',
    'componentDidCatch',
    'componentDidMount',
    'componentDidUpdate',
    'componentWillMount',
    'componentWillReceiveProps',
    'componentWillUnmount',
    'componentWillUpdate',
    'getChildContext',
    'getSnapshotBeforeUpdate',
    'render',
    'shouldComponentUpdate',
    'UNSAFE_componentWillMount',
    'UNSAFE_componentWillReceiveProps',
    'UNSAFE_componentWillUpdate',
]);

const ES6_LIFECYCLE = new Set(['state']);

const ES5_LIFECYCLE = new Set(['getInitialState', 'getDefaultProps', 'mixins']);

/**
 * @param node The node to inspect.
 * @param property The property value.
 * @returns The result of this check.
 */
function isKeyLiteralLike(node: Node, property: Node) {
    return (
        property.type === 'Literal'
        || (property.type === 'TemplateLiteral' && property.expressions.length === 0)
        || (node.computed === false && property.type === 'Identifier')
    );
}

// Descend through all wrapping TypeCastExpressions and return the expression
// that was cast.
/**
 * @param initialNode The initial node value.
 * @returns The result of this check.
 */
function uncast(initialNode: Node) {
    let node = initialNode;

    while (node.type === 'TypeCastExpression') {
        node = node.expression;
    }
    return node;
}

// Return the name of an identifier or the string value of a literal. Useful
// anywhere that a literal may be used as a key (e.g., member expressions,
// method definitions, ObjectExpression property keys).
/**
 * @param initialNode The initial node value.
 * @returns The result of this check.
 */
function getName(initialNode: Node) {
    let node = initialNode;

    node = uncast(node);
    const { type } = node;

    if (type === 'Identifier') {
        return node.name;
    }
    if (type === 'Literal') {
        return String(node.value);
    }
    if (type === 'TemplateLiteral' && node.expressions.length === 0) {
        return node.quasis[0]!.value.raw;
    }
    return null;
}

/**
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isThisExpression(node: Node) {
    return uncast(node).type === 'ThisExpression';
}

/**
 * @param node The node to inspect.
 * @param isClass The is class value.
 * @returns The result of this check.
 */
function getInitialClassInfo(node: Node, isClass: boolean) {
    return {
        classNode: node,
        isClass,
        // Set of nodes where properties were defined.
        properties: new Set<Node>(),

        // Set of names of properties that we've seen used.
        usedProperties: new Set<string | null>(),

        inStatic: false,
    };
}

const messages = {
    unused: 'Unused method or property "{{name}}"',
    unusedWithClass: 'Unused method or property "{{name}}" of class "{{className}}"',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow declaring unused methods of component class',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('no-unused-class-component-methods'),
        },
        messages,
        schema: [],
    },

    create: (context) => {
        let classInfo: ReturnType<typeof getInitialClassInfo> | null = null;

        // Takes an ObjectExpression node and adds all named Property nodes to the
        // current set of properties.
        /**
         * @param node The node to inspect.
         */
        function addProperty(node: Node) {
            classInfo!.properties.add(node);
        }

        // Adds the name of the given node as a used property if the node is an
        // Identifier or a Literal. Other node types are ignored.
        /**
         * @param node The node to inspect.
         */
        function addUsedProperty(node: Node) {
            const name = getName(node);
            if (name) {
                classInfo!.usedProperties.add(name);
            }
        }

        /**
         *
         */
        function reportUnusedProperties() {
            // Report all unused properties.
            classInfo!.properties.forEach((node) => {
                const name = getName(node);
                if (
                    !classInfo!.usedProperties.has(name)
                    && !LIFECYCLE_METHODS.has(name!)
                    && (classInfo!.isClass ? !ES6_LIFECYCLE.has(name!) : !ES5_LIFECYCLE.has(name!))
                ) {
                    const className = (classInfo!.classNode.id && classInfo!.classNode.id.name) || '';

                    const messageID = className ? 'unusedWithClass' : 'unused';
                    report(context, messages[messageID], messageID, {
                        node,
                        data: {
                            name,
                            className,
                        },
                    });
                }
            });
        }

        /**
         *
         */
        function exitMethod() {
            if (!classInfo || !classInfo.inStatic) {
                return;
            }

            classInfo.inStatic = false;
        }

        return {
            ClassDeclaration(node: Node<'ClassDeclaration'>) {
                if (componentUtil.isES6Component(node, context)) {
                    classInfo = getInitialClassInfo(node, true);
                }
            },

            ObjectExpression(node: Node<'ObjectExpression'>) {
                if (componentUtil.isES5Component(node, context)) {
                    classInfo = getInitialClassInfo(node, false);
                }
            },

            'ClassDeclaration:exit': function onClassDeclarationExit() {
                if (!classInfo) {
                    return;
                }
                reportUnusedProperties();
                classInfo = null;
            },

            'ObjectExpression:exit': function onObjectExpressionExit(node: Node<'ObjectExpression'>) {
                if (!classInfo || classInfo.classNode !== node) {
                    return;
                }
                reportUnusedProperties();
                classInfo = null;
            },

            Property(node: Node<'Property'>) {
                if (!classInfo || classInfo.classNode !== node.parent) {
                    return;
                }

                if (isKeyLiteralLike(node, node.key)) {
                    addProperty(node.key);
                }
            },

            'ClassProperty, MethodDefinition, PropertyDefinition':
                function onClassPropertyMethodDefinitionPropertyDefinition(
                    node: Node<'ClassProperty' | 'MethodDefinition' | 'PropertyDefinition'>,
                ) {
                    if (!classInfo) {
                        return;
                    }

                    if (node.static) {
                        classInfo.inStatic = true;
                        return;
                    }

                    if (isKeyLiteralLike(node, node.key)) {
                        addProperty(node.key);
                    }
                },

            'ClassProperty:exit': exitMethod,
            'MethodDefinition:exit': exitMethod,
            'PropertyDefinition:exit': exitMethod,

            MemberExpression(node: Node<'MemberExpression'>) {
                if (!classInfo || classInfo.inStatic) {
                    return;
                }

                if (isThisExpression(node.object) && isKeyLiteralLike(node, node.property)) {
                    if (node.parent.type === 'AssignmentExpression' && node.parent.left === node) {
                        // detect `this.property = xxx`
                        addProperty(node.property);
                    } else {
                        // detect `this.property()`, `x = this.property`, etc.
                        addUsedProperty(node.property);
                    }
                }
            },

            VariableDeclarator(node: Node<'VariableDeclarator'>) {
                if (!classInfo || classInfo.inStatic) {
                    return;
                }

                // detect `{ foo, bar: baz } = this`
                if (node.init && isThisExpression(node.init) && node.id.type === 'ObjectPattern') {
                    node.id.properties
                        .filter((prop) => prop.type === 'Property' && isKeyLiteralLike(prop, prop.key))
                        .forEach((prop) => {
                            addUsedProperty(('key' in prop ? prop.key : undefined)!);
                        });
                }
            },
        };
    },
};

export default rule;
