/**
 * @file AdGuard-specific rules executed by Oxlint's JavaScript plugin runtime.
 */
import { definePlugin, defineRule } from '@oxlint/plugins';

import type { ESTree, RuleMeta } from '@oxlint/plugins';
import {
    isDefaultMutation,
    isPascalCase,
    memberName,
    writesPrototype,
} from './helpers';

/**
 * Describe a source-backed rule with no configurable detection heuristics.
 * @param anchor - Source guideline anchor.
 * @param message - Diagnostic text.
 * @returns Rule metadata.
 */
function metadata(anchor: string, message: string): RuleMeta {
    return {
        type: 'suggestion',
        docs: {
            description: message,
            url: `https://github.com/AdguardTeam/CodeGuidelines/blob/master/JavaScript/Javascript.md#${anchor}`,
        },
        schema: [],
        messages: { guideline: message },
    };
}

export const rules = {
    'no-accessors': defineRule({
        meta: metadata('accessors--no-getters-setters', 'Use explicit accessor methods instead of getters or setters.'),
        create(context) {
            return {
                Property(node) {
                    if (node.kind === 'get' || node.kind === 'set') {
                        context.report({ node, messageId: 'guideline' });
                    }
                },
                MethodDefinition(node) {
                    if (node.kind === 'get' || node.kind === 'set') {
                        context.report({ node, messageId: 'guideline' });
                    }
                },
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
                    if (
                        node.param?.type === 'Identifier'
                        && node.param.typeAnnotation?.typeAnnotation.type === 'TSAnyKeyword'
                    ) {
                        context.report({ node: node.param.typeAnnotation, messageId: 'guideline' });
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
        meta: metadata('comments--multiline', 'Use /** ... */ for multiline block comments.'),
        create(context) {
            return {
                Program() {
                    context.sourceCode.getAllComments().forEach((comment) => {
                        if (
                            comment.type === 'Block'
                            && /\r|\n/u.test(comment.value)
                            && !comment.value.startsWith('*')
                        ) {
                            context.report({ loc: comment.loc, messageId: 'guideline' });
                        }
                    });
                },
            };
        },
    }),
};

const plugin = definePlugin({ meta: { name: 'ag' }, rules });

export default plugin;
