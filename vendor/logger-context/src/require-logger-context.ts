/**
 * @file ESLint rule for requiring logger calls to include a context tag
 * e.g. "[ext.page-handler]:" or "[tsweb.WebRequestApi.onBeforeRequest]:".
 */
import { basename, extname } from 'node:path';
import type {
    Fixer, LegacyRule, Node, RuleContext,
} from '../../types';
import { LogMethod } from './log-method';
import {
    buildTag, getEnclosingNames, startsWithTag,
} from './helpers';

const DEFAULT_CONTEXT_MODULE_NAME = 'logger';
const DEFAULT_LOGGER_VARIABLE_NAME = 'logger';
const UNKNOWN_FILE_NAME = 'unknown';
const FILE_EXTENSIONS: ReadonlySet<string> = new Set([
    '.ts',
    '.js',
    '.tsx',
    '.jsx',
]);

type Options = [
    {
        /**
         * Specifies the context module name to use in the tag. Defaults to 'logger'.
         */
        contextModuleName?: string;
        /**
         * Specifies the logger variable name to use in the tag.
         * Used to identify the logger instance variable name in the code to check all logger calls.
         * Defaults to 'logger'.
         */
        loggerVariableName?: string;
    }?,
];

/**
 * Extract the file name from the rule context.
 * @param context The rule context.
 * @returns The file name, or unknown when the extension is unexpected.
 */
function getFileName(context: RuleContext<Options>): string {
    const { filename } = context;
    return FILE_EXTENSIONS.has(extname(filename))
        // Only filename without extension
        ? basename(filename).replace(extname(filename), '')
        : UNKNOWN_FILE_NAME;
}

const rule: LegacyRule<Options> = {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Require logger calls to include a context tag',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    contextModuleName: { type: 'string' },
                    loggerVariableName: { type: 'string' },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            missingContextTag: 'Logger calls must start with a context tag, e.g. {{tag}} ...',
        },
    },
    create(context: RuleContext<Options>) {
        const [options = {}] = context.options;
        const contextModuleName = options.contextModuleName ?? DEFAULT_CONTEXT_MODULE_NAME;
        const loggerVariableName = options.loggerVariableName ?? DEFAULT_LOGGER_VARIABLE_NAME;
        const logLevelMethods = new Set<string>(Object.values(LogMethod));

        return {
            CallExpression(node: Node<'CallExpression'>): void {
                const callee = node.callee as Node<'MemberExpression'> & {
                    object: Node<'Identifier'>;
                    property: Node<'Identifier'>;
                };
                if (
                    node.callee.type !== 'MemberExpression'
                    || callee.object.type !== 'Identifier'
                    || callee.object.name !== loggerVariableName
                    || callee.property.type !== 'Identifier'
                ) {
                    return;
                }
                const calledMethodName = callee.property.name;
                if (!logLevelMethods.has(calledMethodName)) {
                    return;
                }

                const fileName = getFileName(context);
                const { className, methodName } = getEnclosingNames(
                    node,
                );
                const tag = buildTag(contextModuleName, fileName, className, methodName);

                const [firstArgument] = node.arguments as unknown[] as (Node | undefined)[];
                if (startsWithTag(firstArgument as never, tag)) {
                    return;
                }

                context.report({
                    node,
                    messageId: 'missingContextTag',
                    data: { tag },
                    fix: (fixer: Fixer) => {
                        const { sourceCode } = context;
                        // For simple strings
                        if (firstArgument?.type === 'Literal'
                            && typeof (firstArgument as Node<'Literal'>).value === 'string') {
                            const value = (firstArgument as Node<'Literal'>).value as string;
                            const cleaned = value.replace(/^\[[^\]]+\](?::)?\s*/, '');
                            return fixer.replaceText(firstArgument, `'${tag} ${cleaned}'`);
                        }

                        // For template strings
                        if (firstArgument?.type === 'TemplateLiteral') {
                            const template = firstArgument as Node<'TemplateLiteral'>;
                            const quasiRaw = template.quasis[0]!.value.raw;
                            const rest = quasiRaw.replace(/^\[[^\]]+\](?::)?\s*/, '');
                            const newQuasi = `${tag} ${rest}`;
                            let rebuilt = `\`${newQuasi}`;
                            for (let i = 0; i < template.expressions.length; i += 1) {
                                const expr = template.expressions[i]!;
                                const exprSource = sourceCode.getText(expr);
                                const quasi = template.quasis[i + 1]
                                    ? template.quasis[i + 1]!.value.raw
                                    : '';
                                rebuilt += `\${${exprSource}}${quasi}`;
                            }
                            rebuilt += '`';
                            return fixer.replaceText(firstArgument, rebuilt);
                        }

                        if (!firstArgument) {
                            return fixer.insertTextAfter(node.callee, `('${tag} ')`);
                        }
                        return null;
                    },
                });
            },
        };
    },
};

export default rule;
