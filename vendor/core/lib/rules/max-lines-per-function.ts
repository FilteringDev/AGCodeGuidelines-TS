import type {
    Comment, LegacyRule, Node, Token,
} from '../../../types';
/**
 * @file A rule to set the maximum number of line of code in a function.
 * @author Pete Ward <peteward44@gmail.com>
 */
import dependency0 from './utils/ast-utils';
import dependency1 from '../shared/string-utils';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;
const { upperCaseFirst } = dependency1;

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const OPTIONS_SCHEMA = {
    type: 'object',
    properties: {
        max: {
            type: 'integer',
            minimum: 0,
        },
        skipComments: {
            type: 'boolean',
        },
        skipBlankLines: {
            type: 'boolean',
        },
        IIFEs: {
            type: 'boolean',
        },
    },
    additionalProperties: false,
};

const OPTIONS_OR_INTEGER_SCHEMA = {
    oneOf: [
        OPTIONS_SCHEMA,
        {
            type: 'integer',
            minimum: 1,
        },
    ],
};

/**
 * Given a list of comment nodes, return a map with numeric keys (source code line numbers) and comment token
 * values.
 * @param comments An array of comment nodes.
 * @returns A map with numeric keys (source code line numbers) and comment token values.
 */
function getCommentLineNumbers(comments: Comment[]) {
    const map: Map<number, Token> = new Map();

    comments.forEach((comment: Token) => {
        for (let i = comment.loc.start.line; i <= comment.loc.end.line; i += 1) {
            map.set(i, comment);
        }
    });
    return map;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [
        (
            | {
                max?: number;
                skipComments?: boolean;
                skipBlankLines?: boolean;
                IIFEs?: boolean;
            }
            | number
        )?,
    ]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Enforce a maximum number of lines of code in a function',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/max-lines-per-function',
        },

        schema: [OPTIONS_OR_INTEGER_SCHEMA],
        messages: {
            exceed: '{{name}} has too many lines ({{lineCount}}). Maximum allowed is {{maxLines}}.',
        },
    },

    create(context) {
        const { sourceCode } = context;
        const { lines } = sourceCode;

        const option = context.options[0];
        let maxLines = 50;
        let skipComments = false;
        let skipBlankLines = false;
        let IIFEs = false;

        if (typeof option === 'object') {
            maxLines = typeof option.max === 'number' ? option.max : 50;
            skipComments = !!option.skipComments;
            skipBlankLines = !!option.skipBlankLines;
            IIFEs = !!option.IIFEs;
        } else if (typeof option === 'number') {
            maxLines = option;
        }

        const commentLineNumbers = getCommentLineNumbers(sourceCode.getAllComments());

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Tells if a comment encompasses the entire line.
         * @param line The source line with a trailing comment
         * @param lineNumber The one-indexed line number this is on
         * @param comment The comment to remove
         * @returns If the comment covers the entire line
         */
        function isFullLineComment(line: string, lineNumber: number, comment: Token) {
            const { start } = comment.loc;
            const { end } = comment.loc;
            const isFirstTokenOnLine = start.line === lineNumber && !line.slice(0, start.column).trim();
            const isLastTokenOnLine = end.line === lineNumber && !line.slice(end.column).trim();

            return (
                comment
                && (start.line < lineNumber || isFirstTokenOnLine)
                && (end.line > lineNumber || isLastTokenOnLine)
            );
        }

        /**
         * Identifies is a node is a FunctionExpression which is part of an IIFE
         * @param node Node to test
         * @returns True if it's an IIFE
         */
        function isIIFE(node: Node) {
            return (
                (node.type === 'FunctionExpression'
                    || node.type === 'ArrowFunctionExpression')
                && node.parent
                && node.parent.type === 'CallExpression'
                && node.parent.callee === node
            );
        }

        /**
         * Identifies is a node is a FunctionExpression which is embedded within a MethodDefinition or Property
         * @param node Node to test
         * @returns True if it's a FunctionExpression embedded within a MethodDefinition or Property
         */
        function isEmbedded(
            node: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
        ) {
            if (!node.parent) {
                return false;
            }
            if (node !== node.parent.value) {
                return false;
            }
            if (node.parent.type === 'MethodDefinition') {
                return true;
            }
            if (node.parent.type === 'Property') {
                return (
                    node.parent.method === true
                    || node.parent.kind === 'get'
                    || node.parent.kind === 'set'
                );
            }
            return false;
        }

        /**
         * Count the lines in the function
         * @param funcNode Function AST node
         */
        function processFunction(
            funcNode: Node<
                'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression'
            >,
        ) {
            const node = isEmbedded(funcNode) ? funcNode.parent : funcNode;

            if (!IIFEs && isIIFE(node)) {
                return;
            }
            let lineCount = 0;

            lines
                .slice(node.loc.start.line - 1, node.loc.end.line)
                .forEach((line, lineIndex) => {
                    const i = node.loc.start.line - 1 + lineIndex;

                    if (skipComments) {
                        if (
                            commentLineNumbers.has(i + 1)
                            && isFullLineComment(line!, i + 1, commentLineNumbers.get(i + 1)!)
                        ) {
                            return;
                        }
                    }

                    if (skipBlankLines) {
                        if (line!.match(/^\s*$/u)) {
                            return;
                        }
                    }

                    lineCount += 1;
                });

            if (lineCount > maxLines) {
                const name = upperCaseFirst(astUtils.getFunctionNameWithKind(funcNode));

                context.report({
                    node,
                    messageId: 'exceed',
                    data: { name, lineCount, maxLines },
                });
            }
        }

        //--------------------------------------------------------------------------
        // Public API
        //--------------------------------------------------------------------------

        return {
            FunctionDeclaration: processFunction,
            FunctionExpression: processFunction,
            ArrowFunctionExpression: processFunction,
        };
    },
};

export default rule;
