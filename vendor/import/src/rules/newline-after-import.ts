import debug from 'debug';
import type {
    Node, LegacyRule, Fixer, Scope, Comment,
} from '../../types';
import { getPhysicalFilename, getScope } from '../../utils/contextCompat';
import isStaticRequire from '../core/staticRequire';
import docsUrl from '../docsUrl';

/**
 * @file Rule to enforce new line after import not followed by another import.
 */

const log = debug('eslint-plugin-import:rules:newline-after-import');

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/**
 * Contains node or equal.
 * @param outerNode The outer node value.
 * @param innerNode The inner node value.
 * @returns The result of this check.
 */
function containsNodeOrEqual(outerNode: Node, innerNode: Node) {
    return outerNode.range[0] <= innerNode.range[0] && outerNode.range[1] >= innerNode.range[1];
}

/**
 * Get scope body.
 * @param scope The lexical scope.
 * @returns The result of this check.
 */
function getScopeBody(scope: Scope): Node[] | null | undefined {
    if (scope.block.type === 'SwitchStatement') {
        log('SwitchStatement scopes not supported');
        return null;
    }

    const { body } = scope.block;
    if (body && !Array.isArray(body) && body.type === 'BlockStatement') {
        return body.body;
    }

    return body as Node[] | null | undefined;
}

/**
 * Find node index in scope body.
 * @param body The body value.
 * @param nodeToFind The node to find value.
 * @returns The result of this check.
 */
function findNodeIndexInScopeBody(body: Node[], nodeToFind: Node) {
    return body.findIndex((node) => containsNodeOrEqual(node, nodeToFind));
}

/**
 * Get line difference.
 * @param node The node to inspect.
 * @param nextNode The next node value.
 * @returns The result of this check.
 */
function getLineDifference(node: Node, nextNode: Node | Comment) {
    return nextNode.loc.start.line - node.loc.end.line;
}

/**
 * Is class with decorator.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isClassWithDecorator(node: Node) {
    return node.type === 'ClassDeclaration' && node.decorators && node.decorators.length;
}

/**
 * Is export default class.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isExportDefaultClass(node: Node) {
    return node.type === 'ExportDefaultDeclaration' && node.declaration.type === 'ClassDeclaration';
}

/**
 * Is export name class.
 * @param node The node to inspect.
 * @returns The result of this check.
 */
function isExportNameClass(node: Node) {
    return (
        node.type === 'ExportNamedDeclaration'
        && node.declaration
        && node.declaration.type === 'ClassDeclaration'
    );
}

const rule: LegacyRule<[{ count?: number; exactCount?: boolean; considerComments?: boolean }?]> = {
    meta: {
        type: 'layout',
        docs: {
            category: 'Style guide',
            description: 'Enforce a newline after import statements.',
            url: docsUrl('newline-after-import'),
        },
        fixable: 'whitespace',
        schema: [
            {
                type: 'object',
                properties: {
                    count: {
                        type: 'integer',
                        minimum: 1,
                    },
                    exactCount: { type: 'boolean' },
                    considerComments: { type: 'boolean' },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        let level = 0;
        const requireCalls: Node<'CallExpression'>[] = [];
        const options = {
            count: 1,
            exactCount: false,
            considerComments: false,
            ...context.options[0],
        };

        /**
         * Check for new line.
         * @param node The node to inspect.
         * @param initialNextNode The initial next node value.
         * @param type The node or option kind.
         */
        function checkForNewLine(node: Node, initialNextNode: Node, type: string) {
            let nextNode = initialNextNode;

            if (isExportDefaultClass(nextNode) || isExportNameClass(nextNode)) {
                const classNode = nextNode.declaration!;

                if (isClassWithDecorator(classNode)) {
                    nextNode = classNode.decorators![0]!;
                }
            } else if (isClassWithDecorator(nextNode)) {
                nextNode = nextNode.decorators![0]!;
            }

            const lineDifference = getLineDifference(node, nextNode);
            const EXPECTED_LINE_DIFFERENCE = options.count + 1;

            if (
                lineDifference < EXPECTED_LINE_DIFFERENCE
                || (options.exactCount && lineDifference !== EXPECTED_LINE_DIFFERENCE)
            ) {
                let { column } = node.loc.start;

                if (node.loc.start.line !== node.loc.end.line) {
                    column = 0;
                }

                context.report({
                    loc: {
                        line: node.loc.end.line,
                        column,
                    },
                    message: `Expected ${options.count} empty line${options.count > 1 ? 's' : ''} after ${type} statement not followed by another ${type}.`,
                    fix:
                        options.exactCount && EXPECTED_LINE_DIFFERENCE < lineDifference
                            ? undefined
                            : (fixer: Fixer) => fixer.insertTextAfter(
                                node,
                                '\n'.repeat(EXPECTED_LINE_DIFFERENCE - lineDifference),
                            ),
                });
            }
        }

        /**
         * Comment after import.
         * @param node The node to inspect.
         * @param nextComment The next comment value.
         * @param type The node or option kind.
         */
        function commentAfterImport(node: Node, nextComment: Comment, type: string) {
            const lineDifference = getLineDifference(node, nextComment);
            const EXPECTED_LINE_DIFFERENCE = options.count + 1;

            if (lineDifference < EXPECTED_LINE_DIFFERENCE) {
                let { column } = node.loc.start;

                if (node.loc.start.line !== node.loc.end.line) {
                    column = 0;
                }

                context.report({
                    loc: {
                        line: node.loc.end.line,
                        column,
                    },
                    message: `Expected ${options.count} empty line${options.count > 1 ? 's' : ''} after ${type} statement not followed by another ${type}.`,
                    fix:
                        options.exactCount && EXPECTED_LINE_DIFFERENCE < lineDifference
                            ? undefined
                            : (fixer: Fixer) => fixer.insertTextAfter(
                                node,
                                '\n'.repeat(EXPECTED_LINE_DIFFERENCE - lineDifference),
                            ),
                });
            }
        }

        /**
         * Increment level.
         */
        function incrementLevel() {
            level += 1;
        }

        /**
         * Decrement level.
         */
        function decrementLevel() {
            level -= 1;
        }

        /**
         * Check import.
         * @param node The node to inspect.
         */
        function checkImport(node: Node) {
            const { parent } = node;

            if (!parent || !parent.body) {
                return;
            }

            const body = parent.body as Node[];
            const nodePosition = body.indexOf(node);
            const nextNode = body[nodePosition + 1];
            const endLine = node.loc.end.line;
            let nextComment;

            if (typeof parent.comments !== 'undefined' && options.considerComments) {
                nextComment = parent.comments.find(
                    (o) => o.loc.start.line >= endLine && o.loc.start.line <= endLine + options.count + 1,
                );
            }

            // skip "export import"s
            if (node.type === 'TSImportEqualsDeclaration' && node.isExport) {
                return;
            }

            if (nextComment && typeof nextComment !== 'undefined') {
                commentAfterImport(node, nextComment, 'import');
            } else if (
                nextNode
                && nextNode.type !== 'ImportDeclaration'
                && (nextNode.type !== 'TSImportEqualsDeclaration' || nextNode.isExport)
            ) {
                checkForNewLine(node, nextNode, 'import');
            }
        }

        return {
            ImportDeclaration: checkImport,
            TSImportEqualsDeclaration: checkImport,
            CallExpression(node: Node<'CallExpression'>) {
                if (isStaticRequire(node) && level === 0) {
                    requireCalls.push(node);
                }
            },
            'Program:exit': function onProgramExit(node: Node<'Program'>) {
                log('exit processing for', getPhysicalFilename(context));
                const scopeBody = getScopeBody(getScope(context, node))!;
                log('got scope:', scopeBody);

                requireCalls.forEach((selectedNode, index) => {
                    const nodePosition = findNodeIndexInScopeBody(scopeBody, selectedNode);
                    log('node position in scope:', nodePosition);

                    const statementWithRequireCall = scopeBody[nodePosition]!;
                    const nextStatement = scopeBody[nodePosition + 1];
                    const nextRequireCall = requireCalls[index + 1];

                    if (
                        nextRequireCall
                        && containsNodeOrEqual(statementWithRequireCall, nextRequireCall)
                    ) {
                        return;
                    }

                    if (
                        nextStatement
                        && (!nextRequireCall || !containsNodeOrEqual(nextStatement, nextRequireCall))
                    ) {
                        let nextComment;
                        if (
                            typeof statementWithRequireCall.parent.comments !== 'undefined'
                            && options.considerComments
                        ) {
                            const endLine = selectedNode.loc.end.line;
                            nextComment = statementWithRequireCall.parent.comments!.find(
                                (o) => o.loc.start.line >= endLine
                                    && o.loc.start.line <= endLine + options.count + 1,
                            );
                        }

                        if (nextComment && typeof nextComment !== 'undefined') {
                            commentAfterImport(statementWithRequireCall, nextComment, 'require');
                        } else {
                            checkForNewLine(statementWithRequireCall, nextStatement, 'require');
                        }
                    }
                });
            },
            FunctionDeclaration: incrementLevel,
            FunctionExpression: incrementLevel,
            ArrowFunctionExpression: incrementLevel,
            BlockStatement: incrementLevel,
            ObjectExpression: incrementLevel,
            Decorator: incrementLevel,
            'FunctionDeclaration:exit': decrementLevel,
            'FunctionExpression:exit': decrementLevel,
            'ArrowFunctionExpression:exit': decrementLevel,
            'BlockStatement:exit': decrementLevel,
            'ObjectExpression:exit': decrementLevel,
            'Decorator:exit': decrementLevel,
        };
    },
};
export default rule;
