import { createRequire } from 'node:module';
import semver from 'semver';
import flatMap from 'array.prototype.flatmap';
import type {
    Node, Fixer, LegacyRule, Token, SourceCode, RuleContext,
} from '../../types';
import { getSourceCode } from '../../utils/contextCompat';
import resolve from '../../utils/resolve';
import docsUrl from '../docsUrl';

const requireExternal = createRequire(import.meta.url);
type ImportMap = Map<string, Node<'ImportDeclaration'>[]>;

let typescriptPkg: { version: string } | undefined;
try {
    typescriptPkg = requireExternal('typescript/package.json') as { version: string };
} catch (e) {
    // TypeScript is optional for consumers that only lint JavaScript.
}

/**
 * Is punctuator.
 * @param node The node to inspect.
 * @param value The value to inspect.
 * @returns The result of this check.
 */
function isPunctuator(node: Token | null, value: string) {
    return node!.type === 'Punctuator' && node!.value === value;
}

// Get the name of the default import of `node`, if any.

/**
 * Get default import name.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function getDefaultImportName(node: Node<'ImportDeclaration'>) {
    const defaultSpecifier = node.specifiers.find(
        (specifier) => specifier.type === 'ImportDefaultSpecifier',
    );
    return defaultSpecifier != null ? defaultSpecifier.local.name : undefined;
}

// Checks whether `node` has a namespace import.

/**
 * Has namespace.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function hasNamespace(node: Node<'ImportDeclaration'>) {
    const specifiers = node.specifiers.filter(
        (specifier) => specifier.type === 'ImportNamespaceSpecifier',
    );
    return specifiers.length > 0;
}

// Checks whether `node` has any non-default specifiers.

/**
 * Has specifiers.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function hasSpecifiers(node: Node<'ImportDeclaration'>) {
    const specifiers = node.specifiers.filter((specifier) => specifier.type === 'ImportSpecifier');
    return specifiers.length > 0;
}

// Checks whether `node` has a comment (that ends) on the previous line or on
// the same line as `node` (starts).

/**
 * Has comment before.
 * @param node The node to inspect.
 * @param sourceCode The source text and token accessors.
 * @returns The result of this check.
 */
function hasCommentBefore(node: Node, sourceCode: SourceCode) {
    return sourceCode
        .getCommentsBefore(node)
        .some((comment) => comment.loc.end.line >= node.loc.start.line - 1);
}

// Checks whether `node` has a comment (that starts) on the same line as `node`
// (ends).

/**
 * Has comment after.
 * @param node The node to inspect.
 * @param sourceCode The source text and token accessors.
 * @returns The result of this check.
 */
function hasCommentAfter(node: Node, sourceCode: SourceCode) {
    return sourceCode
        .getCommentsAfter(node)
        .some((comment) => comment.loc.start.line === node.loc.end.line);
}

// Checks whether `node` has any comments _inside,_ except inside the `{...}`
// part (if any).

/**
 * Has comment inside non specifiers.
 * @param node The node to inspect.
 * @param sourceCode The source text and token accessors.
 * @returns The result of this check.
 */
function hasCommentInsideNonSpecifiers(node: Node, sourceCode: SourceCode) {
    const tokens = sourceCode.getTokens(node);
    const openBraceIndex = tokens.findIndex((token) => isPunctuator(token, '{'));
    const closeBraceIndex = tokens.findIndex((token) => isPunctuator(token, '}'));
    // Slice away the first token, since we're no looking for comments _before_
    // `node` (only inside). If there's a `{...}` part, look for comments before
    // the `{`, but not before the `}` (hence the `+1`s).
    const someTokens = openBraceIndex >= 0 && closeBraceIndex >= 0
        ? tokens.slice(1, openBraceIndex + 1).concat(tokens.slice(closeBraceIndex + 1))
        : tokens.slice(1);
    return someTokens.some((token) => sourceCode.getCommentsBefore(token).length > 0);
}

// It's not obvious what the user wants to do with comments associated with
// duplicate imports, so skip imports with comments when autofixing.

/**
 * Has problematic comments.
 * @param node The node to inspect.
 * @param sourceCode The source text and token accessors.
 * @returns The result of this check.
 */
function hasProblematicComments(node: Node, sourceCode: SourceCode) {
    return (
        hasCommentBefore(node, sourceCode)
        || hasCommentAfter(node, sourceCode)
        || hasCommentInsideNonSpecifiers(node, sourceCode)
    );
}

/**
 * Get fix.
 * @param first The first value.
 * @param rest The rest value.
 * @param sourceCode The source text and token accessors.
 * @param context The rule context.
 * @returns The result of this check.
 */
function getFix(
    first: Node<'ImportDeclaration'>,
    rest: Node<'ImportDeclaration'>[],
    sourceCode: SourceCode,
    context: RuleContext<[{ 'prefer-inline'?: boolean }?]>,
) {
    // Sorry ESLint <= 3 users, no autofix for you. Autofixing duplicate imports
    // requires multiple `fixer.whatever()` calls in the `fix`: We both need to
    // update the first one, and remove the rest. Support for multiple
    // `fixer.whatever()` in a single `fix` was added in ESLint 4.1.
    // `sourceCode.getCommentsBefore` was added in 4.0, so that's an easy thing to
    // check for.
    if (typeof sourceCode.getCommentsBefore !== 'function') {
        return undefined;
    }

    // Adjusting the first import might make it multiline, which could break

    // import has comments. Also, if the first import is `import * as ns from
    // './foo'` there's nothing we can do.
    if (hasProblematicComments(first, sourceCode) || hasNamespace(first)) {
        return undefined;
    }

    const defaultImportNames = new Set(
        flatMap(
            ([] as Node<'ImportDeclaration'>[]).concat(first, rest || []),
            (x) => getDefaultImportName(x) || [],
        ),
    );

    // Bail if there are multiple different default import names – it's up to the
    // user to choose which one to keep.
    if (defaultImportNames.size > 1) {
        return undefined;
    }

    // Leave it to the user to handle comments. Also skip `import * as ns from
    // './foo'` imports, since they cannot be merged into another import.
    const restWithoutComments = rest.filter(
        (node) => !hasProblematicComments(node, sourceCode) && !hasNamespace(node),
    );

    const specifiers = restWithoutComments
        .map((node) => {
            const tokens = sourceCode.getTokens(node);
            const openBrace = tokens.find((token) => isPunctuator(token, '{'));
            const closeBrace = tokens.find((token) => isPunctuator(token, '}'));

            if (openBrace == null || closeBrace == null) {
                return undefined;
            }

            return {
                importNode: node,
                identifiers: sourceCode.text.slice(openBrace.range[1], closeBrace.range[0]).split(','),
                // Split the text into separate identifiers (retaining any whitespace before or after)
                isEmpty: !hasSpecifiers(node),
            };
        })
        .filter((x) => !!x);

    const unnecessaryImports = restWithoutComments.filter(
        (node) => !hasSpecifiers(node)
            && !hasNamespace(node)
            && !specifiers.some((specifier) => specifier.importNode === node),
    );

    const shouldAddDefault = getDefaultImportName(first) == null && defaultImportNames.size === 1;
    const shouldAddSpecifiers = specifiers.length > 0;
    const shouldRemoveUnnecessary = unnecessaryImports.length > 0;
    const preferInline = context.options[0] && context.options[0]['prefer-inline'];

    if (!(shouldAddDefault || shouldAddSpecifiers || shouldRemoveUnnecessary)) {
        return undefined;
    }

    return (fixer: Fixer) => {
        const tokens = sourceCode.getTokens(first);
        const openBrace = tokens.find((token) => isPunctuator(token, '{'));
        const closeBrace = tokens.find((token) => isPunctuator(token, '}'));
        const firstToken = sourceCode.getFirstToken(first);
        const [defaultImportName] = defaultImportNames;

        const firstHasTrailingComma = closeBrace != null && isPunctuator(sourceCode.getTokenBefore(closeBrace), ',');
        const firstIsEmpty = !hasSpecifiers(first);
        const firstExistingIdentifiers: Set<string> = firstIsEmpty
            ? new Set()
            : new Set(
                sourceCode.text
                    .slice(openBrace!.range[1], closeBrace!.range[0])
                    .split(',')
                    .map((x) => x.trim()),
            );

        const [specifiersText] = specifiers.reduce<[string, boolean, Set<string>]>(
            ([result, needsComma, existingIdentifiers], specifier) => {
                const isTypeSpecifier = specifier.importNode.importKind === 'type';

                // a user might set prefer-inline but not have a supporting TypeScript version. Flow does not support
                // inline types so this should fail in that case as well.
                if (
                    preferInline
                    && (!typescriptPkg || !semver.satisfies(typescriptPkg.version, '>= 4.5'))
                ) {
                    throw new Error('Your version of TypeScript does not support inline type imports.');
                }

                // Add *only* the new identifiers that don't already exist, and track any new identifiers so we don't
                // add them again in the next loop
                const [specifierText, updatedExistingIdentifiers] = specifier.identifiers.reduce<
                    [string, Set<string>]
                >(
                    ([text, set], cur) => {
                        const trimmed = cur.trim();
                        // Trim whitespace before/after to compare to our set of existing identifiers
                        const curWithType = trimmed.length > 0 && preferInline && isTypeSpecifier ? `type ${cur}` : cur;
                        if (existingIdentifiers.has(trimmed)) {
                            return [text, set];
                        }
                        return [
                            text.length > 0 ? `${text},${curWithType}` : curWithType,
                            set.add(trimmed),
                        ];
                    },
                    ['', existingIdentifiers],
                );

                return [
                    needsComma && !specifier.isEmpty && specifierText.length > 0
                        ? `${result},${specifierText}`
                        : `${result}${specifierText}`,
                    specifier.isEmpty ? needsComma : true,
                    updatedExistingIdentifiers,
                ];
            },
            ['', !firstHasTrailingComma && !firstIsEmpty, firstExistingIdentifiers],
        );

        const fixes = [];

        if (shouldAddSpecifiers && preferInline && first.importKind === 'type') {
            // `import type {a} from './foo'` → `import {type a} from './foo'`
            const typeIdentifierToken = tokens.find(
                (token) => token.type === 'Identifier' && token.value === 'type',
            );
            fixes.push(
                fixer.removeRange([typeIdentifierToken!.range[0], typeIdentifierToken!.range[1] + 1]),
            );

            tokens
                .filter((token) => firstExistingIdentifiers.has(token.value))
                .forEach((identifier) => {
                    fixes.push(
                        fixer.replaceTextRange(
                            [identifier.range[0], identifier.range[1]],
                            `type ${identifier.value}`,
                        ),
                    );
                });
        }

        if (shouldAddDefault && openBrace == null && shouldAddSpecifiers) {
            // `import './foo'` → `import def, {...} from './foo'`
            fixes.push(
                fixer.insertTextAfter(firstToken!, ` ${defaultImportName}, {${specifiersText}} from`),
            );
        } else if (shouldAddDefault && openBrace == null && !shouldAddSpecifiers) {
            // `import './foo'` → `import def from './foo'`
            fixes.push(fixer.insertTextAfter(firstToken!, ` ${defaultImportName} from`));
        } else if (shouldAddDefault && openBrace != null && closeBrace != null) {
            // `import {...} from './foo'` → `import def, {...} from './foo'`
            fixes.push(fixer.insertTextAfter(firstToken!, ` ${defaultImportName},`));
            if (shouldAddSpecifiers) {
                // `import def, {...} from './foo'` → `import def, {..., ...} from './foo'`
                fixes.push(fixer.insertTextBefore(closeBrace, specifiersText));
            }
        } else if (!shouldAddDefault && openBrace == null && shouldAddSpecifiers) {
            if (first.specifiers.length === 0) {
                // `import './foo'` → `import {...} from './foo'`
                fixes.push(fixer.insertTextAfter(firstToken!, ` {${specifiersText}} from`));
            } else {
                // `import def from './foo'` → `import def, {...} from './foo'`
                fixes.push(fixer.insertTextAfter(first.specifiers[0]!, `, {${specifiersText}}`));
            }
        } else if (!shouldAddDefault && openBrace != null && closeBrace != null) {
            // `import {...} './foo'` → `import {..., ...} from './foo'`
            fixes.push(fixer.insertTextBefore(closeBrace, specifiersText));
        }

        // Remove imports whose specifiers have been moved into the first import.
        specifiers.forEach((specifier) => {
            const { importNode } = specifier;
            fixes.push(fixer.remove(importNode));

            const charAfterImportRange: [number, number] = [
                importNode.range[1],
                importNode.range[1] + 1,
            ];
            const charAfterImport = sourceCode.text.substring(
                charAfterImportRange[0],
                charAfterImportRange[1],
            );
            if (charAfterImport === '\n') {
                fixes.push(fixer.removeRange(charAfterImportRange));
            }
        });

        // Remove imports whose default import has been moved to the first import,
        // and side-effect-only imports that are unnecessary due to the first
        // import.
        unnecessaryImports.forEach((node) => {
            fixes.push(fixer.remove(node));

            const charAfterImportRange: [number, number] = [node.range[1], node.range[1] + 1];
            const charAfterImport = sourceCode.text.substring(
                charAfterImportRange[0],
                charAfterImportRange[1],
            );
            if (charAfterImport === '\n') {
                fixes.push(fixer.removeRange(charAfterImportRange));
            }
        });

        return fixes;
    };
}

/**
 * Check imports.
 * @param imported The imported value.
 * @param context The rule context.
 */
function checkImports(imported: ImportMap, context: RuleContext<[{ 'prefer-inline'?: boolean }?]>) {
    const entryIterator0 = imported.entries()[Symbol.iterator]();
    for (
        let entryStep1 = entryIterator0.next();
        !entryStep1.done;
        entryStep1 = entryIterator0.next()
    ) {
        const [module, nodes] = entryStep1.value;
        if (nodes.length > 1) {
            const message = `'${module}' imported multiple times.`;
            const [first, ...rest] = nodes;
            const sourceCode = getSourceCode(context);
            const fix = getFix(first!, rest, sourceCode, context);

            context.report({
                node: first!.source,
                message,
                fix, // Attach the autofix (if any) to the first import.
            });

            rest.forEach((node) => {
                context.report({
                    node: node.source,
                    message,
                });
            });
        }
    }
}

const rule: LegacyRule<[{ considerQueryString?: boolean; 'prefer-inline'?: boolean }?]> = {
    meta: {
        type: 'problem',
        docs: {
            category: 'Style guide',
            description: 'Forbid repeated import of the same module in multiple places.',
            url: docsUrl('no-duplicates'),
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    considerQueryString: {
                        type: 'boolean',
                    },
                    'prefer-inline': {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    /**
     * @param context The rule context.
     * @returns The result of this check.
     */
    create(context) {
        // Prepare the resolver from options.
        const considerQueryStringOption = context.options[0] && context.options[0].considerQueryString;

        const preferInline = context.options[0] && context.options[0]['prefer-inline'];
        const defaultResolver = (sourcePath: string) => resolve(sourcePath, context) || sourcePath;
        const resolver = considerQueryStringOption
            ? (sourcePath: string) => {
                const parts = sourcePath.match(/^([^?]*)\?(.*)$/);
                if (!parts) {
                    return defaultResolver(sourcePath);
                }
                return `${defaultResolver(parts[1]!)}?${parts[2]}`;
            }
            : defaultResolver;

        const moduleMaps = new Map<
            Node,
            {
                imported: ImportMap;
                nsImported: ImportMap;
                defaultTypesImported: ImportMap;
                namedTypesImported: ImportMap;
            }
        >();

        /**
         * @param n The n value.
         */
        /**
         * @returns The result of this check.
         * @param n The n value.
         */
        function getImportMap(n: Node<'ImportDeclaration'>) {
            if (!moduleMaps.has(n.parent)) {
                moduleMaps.set(n.parent, {
                    imported: new Map(),
                    nsImported: new Map(),
                    defaultTypesImported: new Map(),
                    namedTypesImported: new Map(),
                });
            }
            const map = moduleMaps.get(n.parent)!;
            if (!preferInline && n.importKind === 'type') {
                return n.specifiers.length > 0 && n.specifiers[0]!.type === 'ImportDefaultSpecifier'
                    ? map.defaultTypesImported
                    : map.namedTypesImported;
            }
            if (!preferInline && n.specifiers.some((spec) => spec.importKind === 'type')) {
                return map.namedTypesImported;
            }

            return hasNamespace(n) ? map.nsImported : map.imported;
        }

        return {
            /**
             * @param n The n value.
             */
            ImportDeclaration(n) {
                // resolved path will cover aliased duplicates
                const resolvedPath = resolver(n.source.value);
                const importMap = getImportMap(n);

                if (importMap.has(resolvedPath)) {
                    importMap.get(resolvedPath)!.push(n);
                } else {
                    importMap.set(resolvedPath, [n]);
                }
            },

            'Program:exit': function onProgramExit() {
                const entryIterator1 = moduleMaps.values()[Symbol.iterator]();
                for (
                    let entryStep2 = entryIterator1.next();
                    !entryStep2.done;
                    entryStep2 = entryIterator1.next()
                ) {
                    const map = entryStep2.value;
                    checkImports(map.imported, context);
                    checkImports(map.nsImported, context);
                    checkImports(map.defaultTypesImported, context);
                    checkImports(map.namedTypesImported, context);
                }
            },
        };
    },
};
export default rule;
