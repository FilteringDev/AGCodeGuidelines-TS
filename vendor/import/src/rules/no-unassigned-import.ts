import path from 'node:path';
import minimatch from 'minimatch';
import { getPhysicalFilename } from '../../utils/contextCompat';
import type { LegacyRule, Node, RuleContext } from '../../types';
import isStaticRequire from '../core/staticRequire';
import docsUrl from '../docsUrl';

/**
 * Report an unassigned import.
 * @param context The rule context.
 * @param node The node to inspect.
 */
function report(context: RuleContext, node: Node): void {
    context.report({
        node,
        message: 'Imported module should be assigned',
    });
}

/**
 * Test whether the source matches an allowed glob.
 * @param globs The allowed patterns.
 * @param filename The current file name.
 * @param source The import source value.
 * @returns Whether the source is allowed.
 */
function testIsAllow(globs: unknown, filename: string, source: string): boolean {
    if (!Array.isArray(globs)) {
        return false; // default doesn't allow any patterns
    }

    let filePath: string;

    if (source[0] !== '.' && source[0] !== '/') { // a node module
        filePath = source;
    } else {
        filePath = path.resolve(path.dirname(filename), source); // get source absolute path
    }

    return (globs as string[]).find((glob) => minimatch(filePath, glob)
        || minimatch(filePath, path.join(process.cwd(), glob))) !== undefined;
}

const rule: LegacyRule<[{
    devDependencies?: boolean | string[];
    optionalDependencies?: boolean | string[];
    peerDependencies?: boolean | string[];
    allow?: string[];
}]> = {
    create(context) {
        const options = context.options[0] || {};
        const filename = getPhysicalFilename(context);
        const isAllow = (source: string): boolean => testIsAllow(options.allow, filename, source);

        return {
            ImportDeclaration(node: Node<'ImportDeclaration'>) {
                if (node.specifiers.length === 0 && !isAllow(node.source.value as string)) {
                    report(context, node);
                }
            },
            ExpressionStatement(node: Node<'ExpressionStatement'>) {
                if (node.expression.type !== 'CallExpression' || !isStaticRequire(node.expression)) {
                    return;
                }
                const expression = node.expression as Node<'CallExpression'> & { arguments: { value: string }[] };
                const [firstArgument] = expression.arguments ?? [];
                if (firstArgument && !isAllow(firstArgument.value)) {
                    report(context, node.expression);
                }
            },
        };
    },
    meta: {
        type: 'suggestion',
        docs: {
            category: 'Style guide',
            description: 'Forbid unassigned imports',
            url: docsUrl('no-unassigned-import'),
        },
        schema: [
            {
                type: 'object',
                properties: {
                    devDependencies: { type: ['boolean', 'array'] },
                    optionalDependencies: { type: ['boolean', 'array'] },
                    peerDependencies: { type: ['boolean', 'array'] },
                    allow: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                },
                additionalProperties: false,
            },
        ],
    },
};

export default rule;
