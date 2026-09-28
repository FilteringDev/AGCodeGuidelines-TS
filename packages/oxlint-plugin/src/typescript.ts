/**
 * @file TypeScript-aware variants of pinned core rules whose upstream versions predate TypeScript syntax.
 */
import type {
    ESTree,
    Plugin,
    Rule,
    RuleMeta,
} from '@oxlint/plugins';
import builtinRules from '../../../vendor/core/lib/rules/index';

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

export const rules = {
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
