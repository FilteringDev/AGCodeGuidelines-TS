/**
 * @file TypeScript-aware variants of pinned core rules whose upstream versions predate TypeScript syntax.
 */
import type {
    ESTree,
    LineColumn,
    Plugin,
    Rule,
    RuleMeta,
    SourceCode,
} from '@oxlint/plugins';
import builtinRules from '../../../vendor/core/lib/rules/index';
import { isCamelCase, isPascalCase, isUpperCase } from '../../../vendor/naming-format/format';

import { legacyContext } from './legacy-context';

type DeclarationKind = 'interface' | 'type' | 'namespace' | 'class' | 'function' | 'enum' | 'variable' | 'other';

interface Declaration {
    kind: DeclarationKind;
    implementation: boolean;
}

type Container = ESTree.Node & { body: ESTree.Node[] };

/**
 * Remove an export wrapper from a statement.
 * @param statement - Statement in a declaration container.
 * @returns The declaration or statement itself.
 */
function unwrapExport(statement: ESTree.Node): ESTree.Node | null {
    if (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration') {
        return statement.declaration as ESTree.Node | null;
    }
    return statement;
}

/**
 * Collect the names a statement declares with their TypeScript declaration kinds.
 * @param statement - Statement in a declaration container.
 * @returns Declared names and kinds.
 */
function declarationsOf(statement: ESTree.Node): [string, Declaration][] {
    const node = unwrapExport(statement);
    const single = (id: ESTree.Node | null | undefined, kind: DeclarationKind, implementation = false) => (
        id?.type === 'Identifier' ? [[id.name, { kind, implementation }] as [string, Declaration]] : []
    );
    switch (node?.type) {
        case 'VariableDeclaration':
            return node.declarations.flatMap((declarator) => single(declarator.id, 'variable'));
        case 'FunctionDeclaration':
        case 'TSDeclareFunction':
            return single(node.id, 'function', node.body !== null && node.body !== undefined);
        case 'ClassDeclaration':
            return single(node.id, 'class');
        case 'TSInterfaceDeclaration':
            return single(node.id, 'interface');
        case 'TSTypeAliasDeclaration':
            return single(node.id, 'type');
        case 'TSEnumDeclaration':
            return single(node.id, 'enum');
        case 'TSModuleDeclaration':
            return single(node.id, 'namespace');
        case 'ImportDeclaration':
            return node.specifiers.map((specifier) => [specifier.local.name, { kind: 'other', implementation: false }]);
        default:
            return [];
    }
}

/**
 * Find the statement list that directly contains a declared identifier.
 * @param identifier - Identifier reported as a redeclaration.
 * @returns The block, module body, or program containing the declaration.
 */
function containerOf(identifier: ESTree.Node): Container | null {
    let current: ESTree.Node | null = identifier.parent;
    while (current && current.type !== 'VariableDeclaration' && !/Declaration$|^TSDeclareFunction$/u.test(current.type)) {
        current = current.type === 'VariableDeclarator' ? current.parent : null;
    }
    let parent = current?.parent ?? null;
    if (parent?.type === 'ExportNamedDeclaration' || parent?.type === 'ExportDefaultDeclaration') {
        parent = parent.parent;
    }
    return parent && 'body' in parent && Array.isArray(parent.body) ? (parent as Container) : null;
}

/**
 * Decide whether declarations form a merge that `@typescript-eslint/no-redeclare` accepts with its default
 * `ignoreDeclarationMerge`: interfaces, namespaces, one class with interfaces and namespaces, one function
 * implementation with namespaces, or one enum with namespaces. TypeScript permits more (for example enum or
 * type and value merges), but the TypeScript version of the rule still reports them.
 * @param declarations - Every same-name declaration in one container.
 * @returns Whether the declarations are an accepted declaration merge.
 */
export function isAllowedMerge(declarations: Declaration[]): boolean {
    if (declarations.length < 2) {
        return false;
    }
    // Overload signatures and ambient declarations belong to their implementation.
    const kinds = declarations
        .filter((declaration) => declaration.kind !== 'function' || declaration.implementation)
        .map((declaration) => declaration.kind);
    const count = (kind: DeclarationKind) => kinds.filter((entry) => entry === kind).length;
    const only = (...allowed: DeclarationKind[]) => kinds.every((kind) => allowed.includes(kind));
    if (kinds.length < 2 || only('interface') || only('namespace')) {
        return true;
    }
    if (only('class', 'interface', 'namespace')) {
        return count('class') <= 1;
    }
    if (only('function', 'namespace')) {
        return count('function') <= 1;
    }
    return only('enum', 'namespace') && count('enum') === 1;
}

const noRedeclare = builtinRules.get('no-redeclare')!;

const classMethodsUseThis = builtinRules.get('class-methods-use-this')!;
const [classMethodsBaseSchema] = classMethodsUseThis.meta!.schema as [{ properties: Record<string, unknown> }];

interface ClassMethodsOptions {
    exceptMethods?: string[];
    enforceForClassFields?: boolean;
    ignoreOverrideMethods?: boolean;
    ignoreClassesThatImplementAnInterface?: boolean | 'public-fields';
}

/**
 * Decide whether the TypeScript-only options of `@typescript-eslint/class-methods-use-this` exempt a member.
 * @param member - Method or property definition whose function does not use `this`.
 * @param options - Rule options.
 * @returns Whether the member is exempt.
 */
export function isExemptClassMember(
    member: ESTree.MethodDefinition | ESTree.PropertyDefinition,
    options: ClassMethodsOptions,
): boolean {
    if (options.ignoreOverrideMethods === true && member.override === true) {
        return true;
    }
    const implementsInterface = ((member.parent.parent as ESTree.Class).implements?.length ?? 0) > 0;
    const isPublic = !member.accessibility || member.accessibility === 'public';
    return implementsInterface && (options.ignoreClassesThatImplementAnInterface === true
        || (options.ignoreClassesThatImplementAnInterface === 'public-fields' && isPublic));
}

const FORMATS = { camelCase: isCamelCase, PascalCase: isPascalCase, UPPER_CASE: isUpperCase };
type NamingSelector = 'variable' | 'function' | 'typeLike';
interface NamingOption {
    selector: NamingSelector;
    format: (keyof typeof FORMATS)[] | null;
}
const namingSchema = {
    type: 'array',
    minItems: 1,
    items: {
        type: 'object',
        properties: {
            selector: { enum: ['variable', 'function', 'typeLike'] },
            format: {
                anyOf: [
                    { type: 'null' },
                    {
                        type: 'array', minItems: 1, uniqueItems: true, items: { enum: Object.keys(FORMATS) },
                    },
                ],
            },
        },
        required: ['selector', 'format'],
        additionalProperties: false,
    },
} satisfies NonNullable<RuleMeta['schema']>;

/**
 * Collect local variable bindings without treating property keys as declared names.
 * @param node - A variable binding or destructuring pattern.
 * @returns Identifiers declared by the pattern.
 */
function bindingIdentifiers(node: ESTree.Node): ESTree.Node[] {
    switch (node.type) {
        case 'Identifier': return [node];
        case 'ObjectPattern': return node.properties.flatMap((property) => bindingIdentifiers(property));
        case 'ArrayPattern': return node.elements.flatMap((element) => (element ? bindingIdentifiers(element) : []));
        case 'Property': return bindingIdentifiers(node.value);
        case 'AssignmentPattern': return bindingIdentifiers(node.left);
        case 'RestElement': return bindingIdentifiers(node.argument);
        default: return [];
    }
}

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

interface ReturnTypeOptions {
    allowExpressions: boolean;
    allowTypedFunctionExpressions: boolean;
    allowHigherOrderFunctions: boolean;
    allowDirectConstAssertionInArrowFunctions: boolean;
    allowConciseArrowFunctionExpressionsStartingWithVoid: boolean;
    allowFunctionsWithoutTypeParameters: boolean;
    allowedNames: string[];
    allowIIFEs: boolean;
}

/**
 * Upstream rule semantics selected by the consumer's `@typescript-eslint/eslint-plugin` major version.
 */
interface ReturnTypeSemantics {
    /** Ancestors, default parameters, and JSX containers follow typescript-eslint 6 and later. */
    modern: boolean;
    /** `satisfies` wrappers around a const assertion follow typescript-eslint 8 and later. */
    satisfies: boolean;
}

const RETURN_TYPE_DEFAULTS: ReturnTypeOptions = {
    allowExpressions: false,
    allowTypedFunctionExpressions: true,
    allowHigherOrderFunctions: true,
    allowDirectConstAssertionInArrowFunctions: true,
    allowConciseArrowFunctionExpressionsStartingWithVoid: false,
    allowFunctionsWithoutTypeParameters: false,
    allowedNames: [],
    allowIIFEs: false,
};

const DEFAULT_TYPESCRIPT_ESLINT_MAJOR = 7;

const returnTypeSchema = [{
    type: 'object',
    properties: {
        ...Object.fromEntries(Object.keys(RETURN_TYPE_DEFAULTS)
            .filter((key) => key !== 'allowedNames')
            .map((key) => [key, { type: 'boolean' }])),
        allowedNames: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
}] satisfies NonNullable<RuleMeta['schema']>;

/**
 * Check whether a node is a function with a body.
 * @param node - Candidate node.
 * @returns Whether the node is an arrow function, function expression, or function declaration.
 */
function isFunctionNode(node: ESTree.Node | null | undefined): node is FunctionNode {
    return node?.type === 'ArrowFunctionExpression'
        || node?.type === 'FunctionExpression'
        || node?.type === 'FunctionDeclaration';
}

/**
 * Check whether a node is an `as` or angle-bracket type assertion.
 * @param node - Candidate node.
 * @returns Whether the node is a type assertion.
 */
function isTypeAssertion(node: ESTree.Node): node is ESTree.TSAsExpression | ESTree.TSTypeAssertion {
    return node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion';
}

/**
 * Check whether a node carries a type annotation.
 * @param node - Binding, parameter, or class property.
 * @returns Whether the node has a type annotation.
 */
function hasTypeAnnotation(node: ESTree.Node): boolean {
    return Boolean((node as { typeAnnotation?: unknown }).typeAnnotation);
}

/**
 * Check whether a parent node gives a function expression a contextual type.
 * @param parent - Parent of the function or of its object literal.
 * @param callee - The function itself, which is not typed by being called.
 * @param semantics - Selected upstream semantics.
 * @returns Whether the parent supplies a type.
 */
function isTypedParent(parent: ESTree.Node, callee: ESTree.Node | undefined, semantics: ReturnTypeSemantics): boolean {
    return isTypeAssertion(parent)
        || (parent.type === 'VariableDeclarator' && hasTypeAnnotation(parent.id))
        || (semantics.modern && parent.type === 'AssignmentPattern' && hasTypeAnnotation(parent.left))
        || (parent.type === 'PropertyDefinition' && hasTypeAnnotation(parent))
        || (parent.type === 'CallExpression' && parent.callee !== callee)
        || (semantics.modern && (parent.type === 'JSXExpressionContainer' || parent.type === 'JSXSpreadAttribute'));
}

/**
 * Check whether a property belongs to an object literal with a contextual type.
 * @param property - Parent of a function expression.
 * @param semantics - Selected upstream semantics.
 * @returns Whether the enclosing object literal is typed.
 */
function isPropertyOfObjectWithType(property: ESTree.Node | null, semantics: ReturnTypeSemantics): boolean {
    if (property?.type !== 'Property') {
        return false;
    }
    const objectExpression = property.parent;
    if (objectExpression?.type !== 'ObjectExpression' || !objectExpression.parent) {
        return false;
    }
    return isTypedParent(objectExpression.parent, undefined, semantics)
        || isPropertyOfObjectWithType(objectExpression.parent, semantics);
}

/**
 * Check whether an arrow function directly returns a const assertion.
 * @param node - Function expression.
 * @param semantics - Selected upstream semantics.
 * @returns Whether the body is `... as const`.
 */
function returnsConstAssertion(node: FunctionNode, semantics: ReturnTypeSemantics): boolean {
    if (node.type !== 'ArrowFunctionExpression') {
        return false;
    }
    let { body } = node as { body: ESTree.Node };
    while (semantics.satisfies && body.type === 'TSSatisfiesExpression') {
        body = body.expression;
    }
    if (!isTypeAssertion(body) || body.typeAnnotation.type !== 'TSTypeReference') {
        return false;
    }
    const { typeName } = body.typeAnnotation;
    return typeName.type === 'Identifier' && typeName.name === 'const';
}

/**
 * Check whether a function expression is exempt because of its context.
 * @param node - Function expression.
 * @param options - Rule options.
 * @param semantics - Selected upstream semantics.
 * @returns Whether the expression is typed by context, allowed as an expression, or returns `as const`.
 */
function isValidFunctionExpressionReturnType(
    node: FunctionNode,
    options: ReturnTypeOptions,
    semantics: ReturnTypeSemantics,
): boolean {
    const { parent } = node;
    if (options.allowTypedFunctionExpressions && (
        isTypedParent(parent, node, semantics)
        || isPropertyOfObjectWithType(parent, semantics)
        || parent.type === 'NewExpression'
    )) {
        return true;
    }
    const declarationParents = ['VariableDeclarator', 'MethodDefinition', 'ExportDefaultDeclaration', 'PropertyDefinition'];
    if (options.allowExpressions && !declarationParents.includes(parent.type)) {
        return true;
    }
    return options.allowDirectConstAssertionInArrowFunctions && returnsConstAssertion(node, semantics);
}

/**
 * Check whether a function only returns functions.
 * @param node - Function node.
 * @param returns - Return statements directly inside the function.
 * @param semantics - Selected upstream semantics.
 * @returns Whether the function is a higher-order function.
 */
function returnsFunction(
    node: FunctionNode,
    returns: ESTree.ReturnStatement[],
    semantics: ReturnTypeSemantics,
): boolean {
    let body = node.body as ESTree.Node | null;
    if (!semantics.modern) {
        // typescript-eslint 5 only inspects a body made of a single return statement.
        if (body?.type === 'BlockStatement' && body.body.length === 1) {
            const [statement] = body.body;
            if (statement?.type === 'ReturnStatement' && statement.argument) {
                body = statement.argument;
            }
        }
        return body?.type === 'ArrowFunctionExpression' || body?.type === 'FunctionExpression';
    }
    if (node.type === 'ArrowFunctionExpression' && isFunctionNode(body)) {
        return true;
    }
    return returns.length > 0 && returns.every((statement) => isFunctionNode(statement.argument));
}

/**
 * Check whether an enclosing function or variable already types a returned function.
 * @param node - Function expression.
 * @param semantics - Selected upstream semantics.
 * @returns Whether an ancestor provides the return type.
 */
function ancestorHasReturnType(node: FunctionNode, semantics: ReturnTypeSemantics): boolean {
    let ancestor: ESTree.Node | null = node.parent;
    if (ancestor.type === 'Property') {
        ancestor = ancestor.value;
    }
    const isReturn = ancestor.type === 'ReturnStatement';
    const isBodylessArrow = ancestor.type === 'ArrowFunctionExpression' && ancestor.body.type !== 'BlockStatement';
    if (!isReturn && !isBodylessArrow) {
        return false;
    }
    while (ancestor) {
        switch (ancestor.type) {
            case 'ArrowFunctionExpression':
            case 'FunctionExpression':
            case 'FunctionDeclaration':
                if (ancestor.returnType) {
                    return true;
                }
                break;
            case 'VariableDeclarator':
                if (hasTypeAnnotation(ancestor.id)) {
                    return true;
                }
                if (semantics.modern) {
                    return false;
                }
                break;
            case 'PropertyDefinition':
                if (semantics.modern) {
                    return hasTypeAnnotation(ancestor);
                }
                break;
            case 'ExpressionStatement':
                if (semantics.modern) {
                    return false;
                }
                break;
            default:
                break;
        }
        ancestor = ancestor.parent;
    }
    return false;
}

/**
 * Check whether a function is exempt by name, type parameters, or immediate invocation.
 * @param node - Function node.
 * @param options - Rule options.
 * @returns Whether the function is allowed without a return type.
 */
function isAllowedFunction(node: FunctionNode, options: ReturnTypeOptions): boolean {
    if (options.allowFunctionsWithoutTypeParameters && !node.typeParameters) {
        return true;
    }
    if (options.allowIIFEs && node.parent.type === 'CallExpression') {
        return true;
    }
    if (options.allowedNames.length === 0) {
        return false;
    }
    if (node.type === 'FunctionDeclaration') {
        return node.id?.type === 'Identifier' && options.allowedNames.includes(node.id.name);
    }
    let name = node.id?.name;
    const { parent } = node;
    if (!name && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
        name = parent.id.name;
    } else if (!name && (parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition'
        || parent.type === 'Property') && parent.key.type === 'Identifier' && !parent.computed) {
        name = parent.key.name;
    }
    return Boolean(name) && options.allowedNames.includes(name!);
}

type Position = LineColumn;

const isPunctuator = (value: string) => (token: { type: string; value: string }) => (
    token.type === 'Punctuator' && token.value === value
);

/**
 * Find the opening parenthesis of a function's parameters, or its single unparenthesized arrow parameter.
 * @param node - Function node.
 * @param sourceCode - Source code of the linted file.
 * @returns The token that starts the parameter list.
 */
function parameterStart(node: FunctionNode, sourceCode: SourceCode): ESTree.Token {
    if (node.type === 'ArrowFunctionExpression' && node.params.length === 1) {
        const argument = sourceCode.getFirstToken(node.params[0]!)!;
        const before = sourceCode.getTokenBefore(argument);
        return before && isPunctuator('(')(before) ? before : argument;
    }
    return (node.id
        ? sourceCode.getTokenAfter(node.id, isPunctuator('('))
        : sourceCode.getFirstToken(node, isPunctuator('(')))!;
}

/**
 * Compute the reported function head range used by the selected typescript-eslint version.
 * @param node - Function node.
 * @param sourceCode - Source code of the linted file.
 * @param semantics - Selected upstream semantics.
 * @returns The reported start and end positions.
 */
function functionHeadLoc(
    node: FunctionNode,
    sourceCode: SourceCode,
    semantics: ReturnTypeSemantics,
): { start: Position; end: Position } {
    const { parent } = node;
    const memberStart = (member: ESTree.MethodDefinition | ESTree.PropertyDefinition): Position => {
        const lastDecorator = member.decorators.at(-1);
        return lastDecorator ? sourceCode.getTokenAfter(lastDecorator)!.loc.start : member.loc.start;
    };
    const body = node.body as ESTree.Node;
    if (!semantics.modern) {
        let { start } = node.loc;
        if (parent.type === 'MethodDefinition') {
            start = memberStart(parent);
        } else if (parent.type === 'Property' && parent.method) {
            start = parent.loc.start;
        }
        const end = node.type === 'ArrowFunctionExpression'
            ? sourceCode.getTokenBefore(body, isPunctuator('=>'))!.loc.end
            : sourceCode.getTokenBefore(body)!.loc.end;
        return { start: { ...start }, end: { ...end } };
    }
    if (parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') {
        return { start: { ...memberStart(parent) }, end: { ...parameterStart(node, sourceCode).loc.start } };
    }
    if (parent.type === 'Property') {
        return { start: { ...parent.loc.start }, end: { ...parameterStart(node, sourceCode).loc.start } };
    }
    if (node.type === 'ArrowFunctionExpression') {
        const arrow = sourceCode.getTokenBefore(body, isPunctuator('=>'))!;
        return { start: { ...arrow.loc.start }, end: { ...arrow.loc.end } };
    }
    return { start: { ...node.loc.start }, end: { ...parameterStart(node, sourceCode).loc.start } };
}

export const rules = {
    'class-methods-use-this': {
        meta: {
            ...classMethodsUseThis.meta as RuleMeta,
            schema: [{
                ...classMethodsBaseSchema,
                properties: {
                    ...classMethodsBaseSchema.properties,
                    ignoreOverrideMethods: { type: 'boolean' },
                    ignoreClassesThatImplementAnInterface: {
                        oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['public-fields'] }],
                    },
                },
            }],
        },
        create(context) {
            const options = (context.options[0] ?? {}) as ClassMethodsOptions;
            const {
                ignoreOverrideMethods,
                ignoreClassesThatImplementAnInterface,
                ...base
            } = options;
            // The pinned rule counts `this` anywhere in the function, including default parameters, as
            // ESLint and typescript-eslint do; it rejects the TypeScript-only options.
            const filtered = Object.create(context, {
                options: { value: [base] },
                report: {
                    value: (descriptor: Parameters<typeof context.report>[0]) => {
                        const member = (descriptor as unknown as { node: ESTree.Node }).node.parent as
                            ESTree.MethodDefinition | ESTree.PropertyDefinition;
                        if (!isExemptClassMember(member, options)) {
                            context.report(descriptor);
                        }
                    },
                },
            }) as typeof context;
            return legacyContext(classMethodsUseThis as unknown as Rule, filtered);
        },
    } satisfies Rule,
    'explicit-function-return-type': {
        meta: {
            type: 'problem',
            docs: { description: 'Require explicit return types on functions and class methods.' },
            schema: returnTypeSchema,
            messages: { missingReturnType: 'Missing return type on function.' },
        },
        create(context) {
            const options = { ...RETURN_TYPE_DEFAULTS, ...(context.options[0] as Partial<ReturnTypeOptions>) };
            const rawMajor = context.settings.agTypeScriptEslint;
            const major = typeof rawMajor === 'number' ? rawMajor : DEFAULT_TYPESCRIPT_ESLINT_MAJOR;
            const semantics: ReturnTypeSemantics = { modern: major >= 6, satisfies: major >= 8 };
            const stack: { node: FunctionNode; returns: ESTree.ReturnStatement[] }[] = [];
            const enter = (node: FunctionNode) => {
                stack.push({ node, returns: [] });
            };
            const check = (node: FunctionNode, returns: ESTree.ReturnStatement[]) => {
                const { parent } = node;
                if (options.allowHigherOrderFunctions && returnsFunction(node, returns, semantics)) {
                    return;
                }
                const isConstructor = parent.type === 'MethodDefinition' && parent.kind === 'constructor';
                const isSetter = (parent.type === 'MethodDefinition' || parent.type === 'Property') && parent.kind === 'set';
                if (node.returnType || isConstructor || isSetter) {
                    return;
                }
                context.report({ node, loc: functionHeadLoc(node, context.sourceCode, semantics), messageId: 'missingReturnType' });
            };
            const exitExpression = (node: FunctionNode) => {
                const { returns } = stack.pop()!;
                const startsWithVoid = node.type === 'ArrowFunctionExpression' && node.expression
                    && node.body.type === 'UnaryExpression' && node.body.operator === 'void';
                if ((options.allowConciseArrowFunctionExpressionsStartingWithVoid && startsWithVoid)
                    || isAllowedFunction(node, options)) {
                    return;
                }
                if (options.allowTypedFunctionExpressions && (
                    isValidFunctionExpressionReturnType(node, options, semantics)
                    || ancestorHasReturnType(node, semantics)
                )) {
                    return;
                }
                check(node, returns);
            };
            return {
                ArrowFunctionExpression: enter,
                FunctionExpression: enter,
                FunctionDeclaration: enter,
                ReturnStatement(node) {
                    stack.at(-1)?.returns.push(node);
                },
                'ArrowFunctionExpression:exit': exitExpression,
                'FunctionExpression:exit': exitExpression,
                'FunctionDeclaration:exit': function exitDeclaration(node: ESTree.Function) {
                    const { returns } = stack.pop()!;
                    const typed = options.allowTypedFunctionExpressions && Boolean(node.returnType);
                    if (typed || isAllowedFunction(node, options)) {
                        return;
                    }
                    check(node, returns);
                },
            };
        },
    } satisfies Rule,
    'naming-convention': {
        meta: {
            type: 'suggestion',
            docs: { description: 'Check variable, function, and typeLike names with explicitly supported formats.' },
            schema: namingSchema,
            messages: { doesNotMatchFormat: '{{type}} name `{{name}}` must match one of the following formats: {{formats}}' },
        },
        create(context) {
            const options = context.options as unknown as readonly NamingOption[];
            if (options.length === 0) {
                throw new Error('naming-convention requires explicit supported selector/format options.');
            }
            if (new Set(options.map((option) => option.selector)).size !== options.length) {
                throw new Error('Repeated naming selectors are not supported.');
            }
            const check = (node: ESTree.Node | null | undefined, selector: NamingSelector) => {
                if (node?.type !== 'Identifier') {
                    return;
                }
                const option = options.find((entry) => entry.selector === selector);
                if (option?.format && !option.format.some((format) => FORMATS[format](node.name))) {
                    context.report({
                        node,
                        messageId: 'doesNotMatchFormat',
                        data: {
                            type: selector, name: node.name, formats: option.format.join(', '),
                        },
                    });
                }
            };
            return {
                VariableDeclarator(node) {
                    bindingIdentifiers(node.id).forEach((identifier) => check(identifier, 'variable'));
                },
                FunctionDeclaration(node) {
                    check(node.id, 'function');
                },
                FunctionExpression(node) {
                    check(node.id, 'function');
                },
                TSDeclareFunction(node) {
                    check(node.id, 'function');
                },
                ClassDeclaration(node) {
                    check(node.id, 'typeLike');
                },
                ClassExpression(node) {
                    check(node.id, 'typeLike');
                },
                TSInterfaceDeclaration(node) {
                    check(node.id, 'typeLike');
                },
                TSTypeAliasDeclaration(node) {
                    check(node.id, 'typeLike');
                },
                TSEnumDeclaration(node) {
                    check(node.id, 'typeLike');
                },
                TSTypeParameter(node) {
                    // typescript-eslint selects declared type parameters only, not `infer` or mapped-type keys.
                    if (node.parent?.type !== 'TSTypeParameterDeclaration') {
                        return;
                    }
                    check(node.name, 'typeLike');
                },
            };
        },
    } satisfies Rule,
    'no-redeclare': {
        meta: noRedeclare.meta as RuleMeta,
        create(context) {
            const filtered = Object.create(context, {
                report: {
                    value: (descriptor: Parameters<typeof context.report>[0] & { messageId?: string }) => {
                        const { node } = descriptor as { node?: ESTree.Node };
                        const container = descriptor.messageId === 'redeclared' && node?.type === 'Identifier'
                            ? containerOf(node)
                            : null;
                        const declarations = container?.body
                            .flatMap(declarationsOf)
                            .filter(([name]) => name === (node as ESTree.IdentifierReference).name)
                            .map(([, declaration]) => declaration) ?? [];
                        // Overloads and accepted interface, namespace, class, function, or enum merges
                        // declare one TypeScript symbol.
                        if (!isAllowedMerge(declarations)) {
                            context.report(descriptor);
                        }
                    },
                },
            }) as typeof context;
            return legacyContext(noRedeclare as unknown as Rule, filtered);
        },
    } satisfies Rule,
};

export default { meta: { name: 'ag-ts' }, rules } as Plugin;
