/**
 * @file AdGuard-specific rules executed by Oxlint's JavaScript plugin runtime.
 */
import { definePlugin, defineRule } from '@oxlint/plugins';

import type { ESTree, RuleMeta } from '@oxlint/plugins';
import {
    concatenationOperands,
    isDefaultMutation,
    isDirectiveComment,
    isPascalCase,
    isPrimitiveConstant,
    isStaticString,
    isUpperSnakeCase,
    memberName,
    unwrapTypeExpression,
    writesPrototype,
} from './helpers';

/**
 * Describe a source-backed rule.
 * @param anchor - Source guideline anchor.
 * @param message - Diagnostic text.
 * @param schema - Option schema; most rules have no configurable heuristics.
 * @returns Rule metadata.
 */
function metadata(anchor: string, message: string, schema: RuleMeta['schema'] = []): RuleMeta {
    return {
        type: 'suggestion',
        docs: {
            description: message,
            url: `https://github.com/AdguardTeam/CodeGuidelines/blob/master/JavaScript/Javascript.md#${anchor}`,
        },
        schema,
        messages: { guideline: message },
    };
}

type Report = (node: ESTree.Node) => void;

/**
 * Report accessor-kind members.
 * @param report - Reporter bound to the rule context.
 * @returns Handler for members that expose a `kind`.
 */
function reportAccessorKind(report: Report): (node: ESTree.Node & { kind: string }) => void {
    return (node) => {
        if (node.kind === 'get' || node.kind === 'set') {
            report(node);
        }
    };
}

export const rules = {
    'no-accessors': defineRule({
        meta: metadata('accessors--no-getters-setters', 'Use explicit accessor methods instead of getters or setters.'),
        create(context) {
            const report: Report = (node) => context.report({ node, messageId: 'guideline' });
            const accessor = reportAccessorKind(report);
            return {
                Property: accessor,
                MethodDefinition: accessor,
                TSAbstractMethodDefinition: accessor,
                TSMethodSignature: accessor,
                // Auto-accessors define a getter and setter pair.
                AccessorProperty: report,
                TSAbstractAccessorProperty: report,
            };
        },
    }),
    'enum-name': defineRule({
        meta: metadata('typescript--enum-naming-conventions', 'Use PascalCase for enum names and member names.'),
        create(context) {
            return {
                TSEnumDeclaration(node) {
                    if (!isPascalCase(node.id.name)) {
                        context.report({ node: node.id, messageId: 'guideline' });
                    }
                },
                TSEnumMember(node) {
                    let name: string;
                    if (node.id.type === 'Identifier') {
                        name = node.id.name;
                    } else if (node.id.type === 'Literal') {
                        name = String(node.id.value);
                    } else {
                        name = node.id.quasis.map((part) => part.value.cooked ?? part.value.raw).join('');
                    }
                    if (!isPascalCase(name)) {
                        context.report({ node: node.id, messageId: 'guideline' });
                    }
                },
            };
        },
    }),
    'unknown-catch': defineRule({
        meta: metadata('typescript--caught-error-type', 'Use unknown instead of any for caught errors.'),
        create(context) {
            return {
                CatchClause(node) {
                    const annotation = node.param && 'typeAnnotation' in node.param
                        ? node.param.typeAnnotation
                        : null;
                    if (annotation?.typeAnnotation.type === 'TSAnyKeyword') {
                        context.report({ node: annotation, messageId: 'guideline' });
                    }
                },
            };
        },
    }),
    'no-direct-reexport': defineRule({
        meta: metadata('modules--no-export-from-import', 'Import a binding before exporting it.'),
        create(context) {
            return {
                ExportNamedDeclaration(node) {
                    if (node.source) {
                        context.report({ node, messageId: 'guideline' });
                    }
                },
                ExportAllDeclaration(node) {
                    context.report({ node, messageId: 'guideline' });
                },
            };
        },
    }),
    'no-prototype-mutation': defineRule({
        meta: metadata('constructors--use-class', 'Use class declarations instead of directly modifying prototypes.'),
        create(context) {
            const report = (node: ESTree.Node) => {
                if (writesPrototype(node)) {
                    context.report({ node, messageId: 'guideline' });
                }
            };
            return {
                AssignmentExpression(node) {
                    report(node.left);
                },
                UpdateExpression(node) {
                    report(node.argument);
                },
                UnaryExpression(node) {
                    if (node.operator === 'delete') {
                        report(node.argument);
                    }
                },
            };
        },
    }),
    'no-default-side-effects': defineRule({
        meta: metadata(
            'functions--default-side-effects',
            'Do not assign or update another value inside a default value.',
        ),
        create(context) {
            const report = (node: ESTree.Node) => {
                if (isDefaultMutation(node)) {
                    context.report({ node, messageId: 'guideline' });
                }
            };
            return { AssignmentExpression: report, UpdateExpression: report };
        },
    }),
    'prefer-array-from-map': defineRule({
        meta: metadata('arrays--mapping', 'Use Array.from(iterable, mapper) when mapping a spread iterable.'),
        create(context) {
            return {
                CallExpression(node) {
                    if (node.callee.type !== 'MemberExpression' || memberName(node.callee) !== 'map') {
                        return;
                    }
                    const array = node.callee.object;
                    if (
                        array.type === 'ArrayExpression'
                        && array.elements.length === 1
                        && array.elements[0]?.type === 'SpreadElement'
                        && node.arguments.length > 0
                    ) {
                        context.report({ node, messageId: 'guideline' });
                    }
                },
            };
        },
    }),
    'require-docblock': defineRule({
        meta: metadata('comments--multiline', 'Use /** ... */ for multiline block comments.', [{
            type: 'object',
            properties: { lineCommentRuns: { type: 'boolean' } },
            additionalProperties: false,
        }]),
        create(context) {
            const { lineCommentRuns = false } = (context.options[0] ?? {}) as { lineCommentRuns?: boolean };
            const { lines } = context.sourceCode;
            const standalone = (comment: ESTree.Comment) => (lines[comment.loc.start.line - 1] ?? '')
                .slice(0, comment.loc.start.column)
                .trim() === '';
            return {
                Program() {
                    let run: ESTree.Comment[] = [];
                    const flush = () => {
                        if (run.length > 1) {
                            context.report({
                                loc: { start: run[0]!.loc.start, end: run.at(-1)!.loc.end },
                                messageId: 'guideline',
                            });
                        }
                        run = [];
                    };
                    context.sourceCode.getAllComments().forEach((comment) => {
                        if (comment.type === 'Block') {
                            flush();
                            if (/\r|\n/u.test(comment.value) && !comment.value.startsWith('*')) {
                                context.report({ loc: comment.loc, messageId: 'guideline' });
                            }
                            return;
                        }
                        if (!lineCommentRuns) {
                            return;
                        }
                        if (!standalone(comment) || isDirectiveComment(comment.value)) {
                            flush();
                            return;
                        }
                        if (run.length > 0 && run.at(-1)!.loc.end.line + 1 !== comment.loc.start.line) {
                            flush();
                        }
                        run.push(comment);
                    });
                    flush();
                },
            };
        },
    }),
    'no-multiline-string-concat': defineRule({
        meta: metadata(
            'strings--line-length',
            'Do not break a long string across lines with concatenation.',
        ),
        create(context) {
            return {
                BinaryExpression(node) {
                    if (node.operator !== '+' || (node.parent.type === 'BinaryExpression' && node.parent.operator === '+')) {
                        return;
                    }
                    const operands = concatenationOperands(node);
                    const broken = operands.some((operand, index) => {
                        const next = operands[index + 1];
                        return next !== undefined
                            && isStaticString(operand)
                            && isStaticString(next)
                            && operand.loc.end.line !== next.loc.start.line;
                    });
                    if (broken) {
                        context.report({ node, messageId: 'guideline' });
                    }
                },
            };
        },
    }),
    'multiline-condition-layout': defineRule({
        meta: metadata(
            'control-statements',
            'Start a multiline condition on a new line and put the closing parenthesis on its own line.',
        ),
        create(context) {
            const { sourceCode } = context;
            const check = (test: ESTree.Node, open: ESTree.Token | null, close: ESTree.Token | null) => {
                if (!open || !close || unwrapTypeExpression(test).type !== 'LogicalExpression') {
                    return;
                }
                const first = sourceCode.getTokenAfter(open)!;
                const last = sourceCode.getTokenBefore(close)!;
                if (
                    first.loc.start.line !== last.loc.end.line
                    && (first.loc.start.line === open.loc.end.line || last.loc.end.line === close.loc.start.line)
                ) {
                    context.report({ node: test, messageId: 'guideline' });
                }
            };
            const statement = (node: ESTree.IfStatement | ESTree.WhileStatement) => check(
                node.test,
                sourceCode.getTokenAfter(sourceCode.getFirstToken(node)!),
                sourceCode.getTokenBefore('consequent' in node ? node.consequent : node.body),
            );
            return {
                IfStatement: statement,
                WhileStatement: statement,
                DoWhileStatement(node) {
                    const keyword = sourceCode.getTokenAfter(node.body)!;
                    const last = sourceCode.getLastToken(node)!;
                    check(
                        node.test,
                        sourceCode.getTokenAfter(keyword),
                        last.value === ')' ? last : sourceCode.getTokenBefore(last),
                    );
                },
            };
        },
    }),
    'constant-name': defineRule({
        meta: metadata(
            'naming--constants',
            'Use UPPER_SNAKE_CASE for module-level constants initialized with primitive literals.',
        ),
        create(context) {
            return {
                Program(program) {
                    program.body.forEach((statement) => {
                        const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
                        if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') {
                            return;
                        }
                        declaration.declarations.forEach((declarator) => {
                            if (
                                declarator.id.type === 'Identifier'
                                && declarator.init
                                && isPrimitiveConstant(declarator.init)
                                && !isUpperSnakeCase(declarator.id.name)
                            ) {
                                context.report({ node: declarator.id, messageId: 'guideline' });
                            }
                        });
                    });
                },
            };
        },
    }),
};

const plugin = definePlugin({ meta: { name: 'ag' }, rules });

export default plugin;
