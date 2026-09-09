/** @file Enforce TypeScript ESM sources while retaining reviewed external CommonJS loaders. */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseSync, visitorKeys } from 'oxc-parser';

interface SyntaxNode extends Record<string, unknown> {
    type: string;
    start: number;
    end: number;
}
interface Issue { line: number; message: string }
type Scope = Map<string, 'local' | 'bridge'>;

// These loaders inspect external packages or pinned upstream inputs, never local source modules.
const externalLoaders: Record<string, string> = {
    'vendor/import/utils/module-require.ts': 'Consumer-selected dependency parsers.',
    'vendor/import/utils/resolve.ts': 'Consumer-installed resolver plugins.',
    'vendor/import/src/exportMap/typescript.ts': 'Optional consumer TypeScript compiler API.',
    'vendor/import/src/rules/no-duplicates.ts': 'Optional consumer TypeScript package version.',
    'vendor/import/src/rules/no-import-module-exports.ts': 'Consumer entrypoint resolution.',
    'vendor/react/compat/iterators.ts': 'CommonJS-only iterator helper package entrypoints.',
    'vendor/react/lib/util/version.ts': 'Consumer React and Flow package versions.',
    'scripts/airbnb.ts': 'Pinned Airbnb configuration data evaluated in a VM.',
    'scripts/generate.ts': 'Installed upstream metadata used to build the rule catalog.',
    'scripts/import-upstream.ts': 'Pinned upstream fixtures evaluated in a VM.',
    'tests/behavior.test.ts': 'Resolve the installed TypeScript compiler executable.',
    'tests/consumer.test.ts': 'Resolve tools inside the temporary packed consumer.',
    'tests/gaps.test.ts': 'Resolve the installed plugin entrypoints for CLI fixtures.',
    'tests/integration.test.ts': 'Resolve the installed plugin entrypoints for CLI fixtures.',
    'tests/typescript-syntax.test.ts': 'Resolve the installed plugin entrypoints for CLI fixtures.',
};
const scopeKinds = new Set([
    'Program', 'BlockStatement', 'StaticBlock', 'CatchClause', 'ForStatement', 'ForOfStatement',
    'ForInStatement', 'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

/**
 * Narrow an Oxc child value to an AST node.
 * @param value The parser child value.
 * @returns The node when the value has an AST tag.
 */
function syntaxNode(value: unknown): SyntaxNode | undefined {
    if (value && typeof value === 'object' && 'type' in value && typeof value.type === 'string') {
        return value as SyntaxNode;
    }
    return undefined;
}

/**
 * Visit only syntactic children, excluding comments and literal contents.
 * @param node The AST node.
 * @returns Direct child nodes in parser traversal order.
 */
function children(node: SyntaxNode): SyntaxNode[] {
    return (visitorKeys[node.type] ?? []).flatMap((key) => {
        const value = node[key];
        return (Array.isArray(value) ? value : [value]).flatMap((item) => {
            const child = syntaxNode(item);
            return child ? [child] : [];
        });
    });
}

/**
 * Read identifiers from a declaration or destructuring pattern.
 * @param value The binding pattern.
 * @returns Declared identifiers.
 */
function bindingNames(value: unknown): string[] {
    const node = syntaxNode(value);
    if (!node) {
        return [];
    }
    if (node.type === 'Identifier') {
        return [String(node.name)];
    }
    if (node.type === 'Property') {
        return bindingNames(node.value);
    }
    if (node.type === 'AssignmentPattern') {
        return bindingNames(node.left);
    }
    if (node.type === 'RestElement') {
        return bindingNames(node.argument);
    }
    return children(node).flatMap(bindingNames);
}

/**
 * Inspect source syntax without interpreting comments, fixtures, or sample strings as code.
 * @param filename Repository-relative filename with forward slashes.
 * @param source Source text.
 * @returns Source policy violations and their line numbers.
 */
export function inspectSource(filename: string, source: string): Issue[] {
    if (/\.(?:[cm]?js|jsx|cts)$/u.test(filename)) {
        return [{ line: 1, message: 'Source files must use TypeScript ESM (.ts, .tsx, or .mts).' }];
    }
    const parsed = parseSync(filename, source);
    const issues: Issue[] = [];
    const report = (offset: number, message: string) => {
        issues.push({ line: source.slice(0, offset).split('\n').length, message });
    };
    parsed.errors.forEach((error) => report(error.labels[0]?.start ?? 0, error.message));
    parsed.comments.forEach((comment) => {
        if (/@ts-(?:nocheck|ignore)\b/u.test(comment.value)) {
            report(comment.start, 'Source-wide checking and unverified type suppressions are forbidden.');
        }
    });
    const root = parsed.program as unknown as SyntaxNode;
    const factories = new Set<string>();
    const factoryNamespaces = new Set<string>();
    children(root).filter((node) => node.type === 'ImportDeclaration').forEach((node) => {
        const module = syntaxNode(node.source);
        if (module?.value === 'node:module' || module?.value === 'module') {
            children(node).filter((child) => ['ImportNamespaceSpecifier', 'ImportDefaultSpecifier'].includes(child.type))
                .forEach((specifier) => factoryNamespaces.add(String(syntaxNode(specifier.local)?.name)));
            children(node).filter((child) => child.type === 'ImportSpecifier').forEach((specifier) => {
                if (syntaxNode(specifier.imported)?.name === 'createRequire') {
                    factories.add(String(syntaxNode(specifier.local)?.name));
                }
            });
        }
    });
    const isFactoryCall = (node: SyntaxNode | undefined): boolean => {
        if (node?.type !== 'CallExpression') {
            return false;
        }
        const callee = syntaxNode(node.callee);
        if (callee?.type === 'Identifier') {
            return factories.has(String(callee.name));
        }
        const property = syntaxNode(callee?.property);
        return callee?.type === 'MemberExpression'
            && factoryNamespaces.has(String(syntaxNode(callee.object)?.name))
            && (callee.computed ? property?.value : property?.name) === 'createRequire';
    };
    const collect = (node: SyntaxNode, scope: Scope, owner: SyntaxNode): void => {
        if (node.type === 'VariableDeclarator') {
            bindingNames(node.id).forEach((name) => scope.set(name, isFactoryCall(syntaxNode(node.init)) ? 'bridge' : 'local'));
        }
        if (node.type.startsWith('Import') && node.local) {
            bindingNames(node.local).forEach((name) => scope.set(name, 'local'));
        }
        if (node !== owner && scopeKinds.has(node.type)) {
            if (node.type === 'FunctionDeclaration') {
                bindingNames(node.id).forEach((name) => scope.set(name, 'local'));
            }
            return;
        }
        children(node).forEach((child) => collect(child, scope, owner));
    };
    const visit = (node: SyntaxNode, ancestors: Scope[], ambient: boolean): void => {
        let scopes = ancestors;
        if (scopeKinds.has(node.type)) {
            const scope: Scope = new Map();
            bindingNames(node.id).forEach((name) => scope.set(name, 'local'));
            bindingNames(node.param).forEach((name) => scope.set(name, 'local'));
            if (Array.isArray(node.params)) {
                node.params.flatMap(bindingNames).forEach((name) => scope.set(name, 'local'));
            }
            collect(node, scope, node);
            scopes = [...ancestors, scope];
        }
        const lookup = (name: string) => scopes.toReversed().find((scope) => scope.has(name))?.get(name);
        const moduleName = syntaxNode(node.id)?.value;
        const externalDeclaration = ambient || (filename.endsWith('.d.ts')
            && node.type === 'TSModuleDeclaration' && typeof moduleName === 'string');
        if (node.type === 'TSModuleDeclaration' && typeof moduleName === 'string' && /(?:\*|vendor\/)/u.test(moduleName)) {
            report(node.start, 'Ambient wildcard or local vendor module shims conceal source types.');
        }
        if (node.type === 'TSAnyKeyword') {
            report(node.start, 'Use a concrete type or unknown at an external boundary.');
        }
        if (!externalDeclaration && ['TSImportEqualsDeclaration', 'TSExportAssignment'].includes(node.type)) {
            report(node.start, 'Local modules must use ESM import and export declarations.');
        }
        if (node.type === 'MemberExpression') {
            const object = syntaxNode(node.object);
            const property = syntaxNode(node.property);
            const key = node.computed ? property?.value : property?.name;
            if (object?.type === 'Identifier' && !lookup(String(object.name))
                && (object.name === 'exports' || (object.name === 'module' && ['exports', 'require'].includes(String(key))))) {
                report(node.start, 'CommonJS module globals are forbidden in local source modules.');
            }
        }
        if (node.type === 'CallExpression') {
            const callee = syntaxNode(node.callee);
            const name = callee?.type === 'Identifier' ? String(callee.name) : '';
            if (name === 'require' && !lookup(name)) {
                report(node.start, 'Use an ESM import for local modules.');
            }
            if (isFactoryCall(node) && !externalLoaders[filename]) {
                report(node.start, 'New createRequire boundaries need an explicit external-loader review.');
            }
            if (lookup(name) === 'bridge' || isFactoryCall(callee)) {
                const argument = Array.isArray(node.arguments) ? syntaxNode(node.arguments[0]) : undefined;
                if (typeof argument?.value === 'string' && /^(?:\.|\/|[A-Za-z]:[\\/]|file:)/u.test(argument.value)) {
                    report(node.start, 'CommonJS bridges may load external packages, not local source paths.');
                }
            }
        }
        children(node).forEach((child) => visit(child, scopes, externalDeclaration));
    };
    visit(root, [], false);
    return issues;
}

/**
 * Check all authored source directories, excluding generated output and fixture data.
 * @param root Repository directory.
 * @returns Number of checked source files.
 */
export async function checkSources(root: string): Promise<number> {
    const files: string[] = [];
    const scan = async (directory: string): Promise<void> => {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            const file = join(directory, entry.name);
            if (entry.isDirectory()) {
                if (!['node_modules', 'dist', '.cache', 'coverage', '.git'].includes(entry.name)
                    && relative(root, file).replaceAll('\\', '/') !== 'tests/fixtures') {
                    await scan(file);
                }
            } else if (/\.(?:[cm]?[jt]s|[jt]sx)$/u.test(entry.name)) {
                files.push(file);
            }
        }
    };
    for (const directory of ['packages', 'vendor', 'scripts', 'tests', 'docs/reference']) {
        await scan(join(root, directory));
    }
    (await readdir(root)).filter((name) => /\.(?:[cm]?[jt]s|[jt]sx)$/u.test(name))
        .forEach((name) => files.push(join(root, name)));
    const failures: string[] = [];
    for (const file of files) {
        const filename = relative(root, file).replaceAll('\\', '/');
        inspectSource(filename, await readFile(file, 'utf8')).forEach((issue) => {
            failures.push(`${filename}:${issue.line}: ${issue.message}`);
        });
    }
    if (failures.length) {
        throw new Error(failures.join('\n'));
    }
    return files.length;
}
