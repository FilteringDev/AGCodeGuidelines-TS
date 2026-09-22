import type {
    Comment, Fixer, LegacyRule, Node, RuleContext,
} from '../../types';

const SPEC_IMPORT = 'ImportSpecifier';
const SPEC_DEFAULT_IMPORT = 'ImportDefaultSpecifier';
const SPEC_NAMESPACE_IMPORT = 'ImportNamespaceSpecifier';
const nonSplittableImportTypes = new Set([SPEC_DEFAULT_IMPORT, SPEC_NAMESPACE_IMPORT]);

/**
 * Render the local binding with its alias and type prefix.
 * @param currentNode The import specifier node.
 * @returns The rendered specifier text.
 */
function applyAliasAndType(currentNode: Node<'ImportSpecifier' | 'ImportDefaultSpecifier'>): string {
    const { local } = currentNode;
    const localName = (local as Node<'Identifier'>).name;
    const { imported } = (currentNode as Node<'ImportSpecifier'>);
    if (!imported) {
        return localName;
    }
    const importedName = (imported as Node<'Identifier'>).name;
    const { parent } = (currentNode as unknown as { parent: { importKind?: string } });
    const importedNameWithPrefix = parent.importKind === 'type'
        ? `type ${importedName}`
        : importedName;
    return importedName !== localName
        ? `${importedNameWithPrefix} as ${localName}`
        : importedNameWithPrefix;
}

/**
 * Render comments attached to the import statement.
 * @param commentNode The comment node.
 * @returns The rendered comment text.
 */
function outputComment(commentNode: Comment | null | undefined): string {
    const commentNodeType = commentNode && commentNode.type;
    switch (commentNodeType) {
        case 'Block':
            return `\n\n/*${(commentNode as Comment).value}*/\n`;
        case 'Line':
            return `\n\n//${(commentNode as Comment).value}\n`;
        default:
            return '';
    }
}

/**
 * Count the lines occupied by a comment node.
 * @param commentNode The comment node.
 * @returns The line count including the comment itself.
 */
function getCommentLineCount(commentNode: Comment | null | undefined): number {
    let newLineCount = 0;
    if (commentNode) {
        const newLinesInComment = (commentNode as Comment).value.match(/\n/g);
        if (Array.isArray(newLinesInComment)) {
            newLineCount = newLinesInComment.length;
        }
    }
    return 1 + newLineCount;
}

/**
 * Parent with optional attached comments.
 */
type ImportParent = { parent: { comments?: ((Comment & { value: string }) & { range: [number, number] })[] } };

/**
 * Collect comments starting inside the import statement.
 * @param node The import declaration node.
 * @returns The comments inside the import.
 */
function getCommentsInsideImport(node: Node<'ImportDeclaration'>): (Comment & { value: string })[] {
    const comments: (Comment & { value: string })[] = [];
    const { parent } = (node as unknown as ImportParent);
    if (parent.comments) {
        const [nodeStartPos, nodeEndPos] = (node as unknown as { range: [number, number] }).range;
        parent.comments.some((comment) => {
            const [commentStartPos] = (comment as unknown as { range: [number, number] }).range;
            if (commentStartPos > nodeEndPos) {
                // Comments after the import are ignored
                return true;
            }

            if (commentStartPos > nodeStartPos) {
                // The comment starts inside the import
                comments.push(comment as Comment | Comment);
            }
            return false;
        });
    }
    return comments;
}

/**
 * Special case for when semicolons are omitted in code style but
 * there is an IIFE with a comment and a semicolon before it on
 * the next token, resulting in the comment being treated as part
 * of the import statement.
 * @param node The import declaration node.
 * @param comments The comments inside the import.
 * @returns The trailing comment when present.
 */
function findTrailingCommentInImport(
    node: Node<'ImportDeclaration'>,
    comments: (Comment & { value: string })[],
): (Comment & { value: string }) | null {
    let trailingCommentBeforeEnd: (Comment & { value: string }) | null = null;
    const [, nodeSourceEndPos] = ((node.source as unknown as { range: [number, number] }).range);
    comments.some((comment) => {
        const [commentStartPos] = ((comment as unknown as { range: [number, number] }).range);
        if (commentStartPos > nodeSourceEndPos) {
            // The comment starts after the import source token
            trailingCommentBeforeEnd = comment;
            return true;
        }
        return false;
    });
    return trailingCommentBeforeEnd;
}

/**
 * Special case for when there is a comment inside the import
 * between the last specifier and the source line.
 * @param node The import declaration node.
 * @param comments The comments inside the import.
 * @returns The comment before the last line when present.
 */
function findCommentBeforeLastLine(
    node: Node<'ImportDeclaration'>,
    comments: (Comment & { value: string })[],
): (Comment & { value: string }) | null {
    let commentBeforeLastLine: (Comment & { value: string }) | null = null;
    if (node.specifiers.length > 0) {
        const lastSpecifierEndLine = node.specifiers[node.specifiers.length - 1]!.loc!.end.line;
        const sourceLine = node.source.loc!.start.line;
        comments.some((comment) => {
            const commentStartLine = comment.loc!.start.line;
            if (commentStartLine > lastSpecifierEndLine) {
                const commentEndLine = comment.loc!.end.line;
                if (commentEndLine < sourceLine) {
                    // The comment is between the last specifier and the source line
                    commentBeforeLastLine = comment;
                    return true;
                }
            }
            return false;
        });
    }
    return commentBeforeLastLine;
}

type ImportNewlinesOptions =
    | [{ items?: number; 'max-len'?: number; semi?: boolean; forceSingleLine?: boolean; allowBlankLines?: boolean }?]
    | [number?, number?];

/**
 * Build the fixer that rewrites the import statement.
 * @param node The import declaration node.
 * @param semi Whether to include a semicolon.
 * @param spacer The separator between specifiers.
 * @returns The fixer function.
 */
function fixer(node: Node<'ImportDeclaration'>, semi: boolean, spacer = '\n') {
    return (eslintFixer: Fixer) => {
        const comments = getCommentsInsideImport(node);
        const trailingComment = findTrailingCommentInImport(node, comments);
        const lastLineComment = findCommentBeforeLastLine(node, comments);
        let defaultImport = '';
        let namespaceImport = '';
        const objectImports: string[] = [];
        const {
            specifiers,
            importKind,
        } = node as Node<'ImportDeclaration'> & { importKind?: string };
        for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex += 1) {
            const currentNode = specifiers[specifierIndex]!;
            switch (currentNode.type) {
                case SPEC_DEFAULT_IMPORT:
                    defaultImport = applyAliasAndType(currentNode as Node<'ImportDefaultSpecifier'>);
                    break;
                case SPEC_NAMESPACE_IMPORT:
                    namespaceImport = `* as ${(currentNode.local as Node<'Identifier'>).name}`;
                    break;
                case SPEC_IMPORT:
                    objectImports.push(applyAliasAndType(currentNode as Node<'ImportSpecifier'>));
                    break;
                default:
                    break;
            }
        }
        const hasObjectImports = objectImports.length > 0;
        let namespaceImportValue = namespaceImport;
        if (namespaceImport.length > 0 && hasObjectImports) {
            namespaceImportValue = `${namespaceImport}, `;
        }
        let defaultImportValue = defaultImport;
        if (defaultImport.length > 0 && (hasObjectImports || namespaceImportValue.length > 0)) {
            defaultImportValue = `${defaultImport}, `;
        }
        const objectImportsValue = hasObjectImports
            ? `{${spacer}${objectImports.join(`,${spacer}`)}${spacer}}`
            : '';

        let lastLineCommentForSingleLineImport = '';
        if (lastLineComment) {
            if (hasObjectImports && spacer === '\n') {
                // If there is a last line comment, add it to the object imports
                objectImports.push(outputComment(lastLineComment).trim());
            } else {
                // or if there are no object imports, as a prefix for the whole import
                lastLineCommentForSingleLineImport = outputComment(lastLineComment).trimStart();
            }
        }

        const importKeyword = importKind === 'type' ? 'import type' : 'import';
        const newValue = [
            lastLineCommentForSingleLineImport,
            importKeyword,
            ' ',
            defaultImportValue,
            namespaceImportValue,
            objectImportsValue,
            ' from ',
            (node.source as unknown as { raw: string }).raw,
            outputComment(trailingComment),
            semi || trailingComment ? ';' : '',
        ].join('');
        return eslintFixer.replaceText(node, newValue);
    };
}

const DEFAULT_ITEMS = 4;
const MIN_ITEMS = 0;
const DEFAULT_MAX_LENGTH = Infinity;
const MIN_MAX_LENGTH = 17;
const DEFAULT_SEMICOLON = true;
const DEFAULT_FORCE_SINGLE_LINE = true;
const DEFAULT_ALLOW_BLANK_LINES = false;

const rule: LegacyRule<ImportNewlinesOptions> = {
    meta: {
        type: 'layout',
        docs: {
            description: 'enforce multiple lines for import statements past a certain number of items',
            category: 'Stylistic Issues',
            url: 'https://github.com/SeinopSys/eslint-plugin-import-newlines',
        },
        fixable: 'whitespace',
        schema: {
            oneOf: [
                {
                    type: 'array',
                    minItems: 1,
                    maxItems: 1,
                    items: {
                        type: 'object',
                        properties: {
                            items: {
                                type: 'number',
                                minimum: 0,
                            },
                            'max-len': {
                                type: 'number',
                                minimum: 17,
                            },
                            semi: {
                                type: 'boolean',
                            },
                            forceSingleLine: {
                                type: 'boolean',
                            },
                            allowBlankLines: {
                                type: 'boolean',
                            },
                        },
                    },
                },
                {
                    type: 'array',
                    minItems: 0,
                    maxItems: 2,
                    items: {
                        type: 'number',
                    },
                },
            ],
        },
        messages: {
            mustSplitMany: 'Imports must be broken into multiple lines if there are more than {{maxItems}} elements.',
            mustSplitLong: 'Imports must be broken into multiple lines if the line length exceeds {{maxLineLength}} characters, saw {{lineLength}}.',
            mustNotSplit: 'Imports must not be broken into multiple lines if there are {{maxItems}} or less elements.',
            noBlankBetween: 'Import lines cannot have blank lines between them.',
            limitLineCount: 'Import lines must have one element per line. (Expected import to span {{expectedLineCount}} lines, saw {{importLineCount}})',
        },
    },
    create(context: RuleContext<ImportNewlinesOptions>) {
        let maxItems = DEFAULT_ITEMS;
        let maxLineLength = DEFAULT_MAX_LENGTH;
        // Legacy default, prior to a refactoring this value was not set for array type configurations
        let includeSemi = false;
        let forceSingleLine = DEFAULT_FORCE_SINGLE_LINE;
        let allowBlankLines = DEFAULT_ALLOW_BLANK_LINES;
        type ObjectOption = {
            items?: number; 'max-len'?: number; semi?: boolean; forceSingleLine?: boolean; allowBlankLines?: boolean;
        };
        const firstOption = context.options[0] as ObjectOption | number | undefined;
        if (typeof firstOption === 'object') {
            // Supported object-based configuration
            ({
                items: maxItems = DEFAULT_ITEMS,
                'max-len': maxLineLength = DEFAULT_MAX_LENGTH,
                semi: includeSemi = DEFAULT_SEMICOLON,
                forceSingleLine = DEFAULT_FORCE_SINGLE_LINE,
                allowBlankLines = DEFAULT_ALLOW_BLANK_LINES,
            } = firstOption);
        } else {
            // Legacy array-based configuration
            [
                maxItems = DEFAULT_ITEMS,
                maxLineLength = DEFAULT_MAX_LENGTH,
            ] = context.options as [number?, number?];
        }
        if (maxItems < MIN_ITEMS) {
            throw new Error(`Minimum items must not be less than ${MIN_MAX_LENGTH}`);
        }
        if (maxLineLength < MIN_MAX_LENGTH) {
            throw new Error(`Maximum line length must not be less than ${MIN_MAX_LENGTH}`);
        }
        return {
            ImportDeclaration(node: Node<'ImportDeclaration'>) {
                const { specifiers } = node;

                // If blank lines are allowed, skip checking them by setting this to true
                let blankLinesChecked = allowBlankLines;
                const startColumn = node.loc!.start.column;
                const commentsInsideImport = getCommentsInsideImport(node);
                const commentBeforeLastLine = findCommentBeforeLastLine(node, commentsInsideImport);
                // # of lines between the start of the import statement and the end of the import source
                const linesOfActualImport = node.source.loc!.end.line - node.loc!.start.line;
                // We include the line count of the last line comment in the calculation
                const commentsCompensation = commentBeforeLastLine
                    ? getCommentLineCount(commentBeforeLastLine)
                    : 0;
                const importLineCount = 1 + linesOfActualImport - commentsCompensation;
                const importedItems = specifiers.reduce(
                    (count, specifier) => count + (specifier.type === SPEC_IMPORT ? 1 : 0),
                    0,
                );

                for (let specifierIndex = 1; specifierIndex < specifiers.length; specifierIndex += 1) {
                    const currentItem = specifiers[specifierIndex]!;
                    const previousItem = specifiers[specifierIndex - 1]!;
                    const previousEndLine = previousItem.loc!.end.line;
                    const currentStartLine = currentItem.loc!.start.line;
                    const lineDifference = currentStartLine - previousEndLine;
                    if (!blankLinesChecked && lineDifference > 1) {
                        context.report({
                            node,
                            messageId: 'noBlankBetween',
                            fix: fixer(node, includeSemi),
                        });
                        blankLinesChecked = true;
                    }
                }

                if (!blankLinesChecked) {
                    const singleLine = importLineCount === 1;
                    if (singleLine) {
                        const line = context.sourceCode.getText(node);
                        if (line.length > maxLineLength) {
                            const canBeSplit = specifiers.length > 2
                                || specifiers.some((specifier) => !nonSplittableImportTypes.has(specifier.type));
                            // There's nothing we can really do about a very long line
                            // that has only default and namespace imports (barring a
                            // refactor of the import statement itself) so we'll just
                            // ignore it.
                            if (canBeSplit) {
                                context.report({
                                    node,
                                    messageId: 'mustSplitLong',
                                    data: { maxLineLength, lineLength: line.length },
                                    fix: fixer(node, includeSemi),
                                });
                            }
                            return;
                        }
                        if (importedItems > maxItems) {
                            context.report({
                                node,
                                messageId: 'mustSplitMany',
                                data: { maxItems },
                                fix: fixer(node, includeSemi),
                            });
                        }
                        return;
                    }

                    // One item per line + line with import + line with from
                    const expectedLineCount = importedItems + 2;
                    if (importLineCount !== expectedLineCount) {
                        context.report({
                            node,
                            messageId: 'limitLineCount',
                            data: { expectedLineCount, importLineCount },
                            fix: fixer(node, includeSemi),
                        });
                        return;
                    }

                    if (forceSingleLine && importedItems <= maxItems) {
                        let fixedValue: string | undefined;
                        const fix = fixer(node, includeSemi, ' ');
                        fix({
                            replaceText: (_node: unknown, value: string) => {
                                fixedValue = value;
                            },
                        } as never);
                        // Only enforce this rule if fixing it would not cause going over the line length limit
                        if ((fixedValue?.length ?? 0) + startColumn <= maxLineLength) {
                            context.report({
                                node,
                                messageId: 'mustNotSplit',
                                data: { maxItems },
                                fix,
                            });
                        }
                    }
                }
            },
        };
    },
};

export default rule;
