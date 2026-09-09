/**
 * @file Rule to flag consistent return values
 * @author Nicholas C. Zakas
 */
import dependency0 from './utils/ast-utils';
import dependency1 from '../shared/string-utils';
import type {
    CodePath, CodePathSegment, LegacyRule, Node,
} from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;
const { upperCaseFirst } = dependency1;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks all segments in a set and returns true if all are unreachable.
 * @param segments The segments to check.
 * @returns True if all segments are unreachable; false otherwise.
 */
function areAllSegmentsUnreachable(segments: Set<CodePathSegment>) {
    return !Array.from(segments).some((segment) => segment.reachable);
}

/**
 * Checks whether a given node is a `constructor` method in an ES6 class
 * @param node A node to check
 * @returns `true` if the node is a `constructor` method
 */
function isClassConstructor(
    node: Node<
        'ArrowFunctionExpression' | 'FunctionDeclaration' | 'FunctionExpression' | 'Program'
    >,
) {
    return (
        node.type === 'FunctionExpression'
        && node.parent
        && node.parent.type === 'MethodDefinition'
        && node.parent.kind === 'constructor'
    );
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ treatUndefinedAsUnspecified?: boolean }?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Require `return` statements to either always or never specify values',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/consistent-return',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    treatUndefinedAsUnspecified: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            missingReturn: 'Expected to return a value at the end of {{name}}.',
            missingReturnValue: '{{name}} expected a return value.',
            unexpectedReturnValue: '{{name}} expected no return value.',
        },
    },

    create(context) {
        const options = context.options[0] || {};
        const treatUndefinedAsUnspecified = options.treatUndefinedAsUnspecified === true;
        interface FuncInfoState {
            hasReturn: boolean;
            hasReturnValue: boolean;
            messageId: string;
            data?: { name: string };
            upper: FuncInfoState | null;
            codePath: CodePath;
            node: Node;
            currentSegments: Set<CodePathSegment>;
        }
        let funcInfo: FuncInfoState | null = null;

        /**
         * Checks whether of not the implicit returning is consistent if the last
         * code path segment is reachable.
         * @param node A program/function node to check.
         */
        function checkLastSegment(
            node: Node<
                | 'ArrowFunctionExpression'
                | 'FunctionDeclaration'
                | 'FunctionExpression'
                | 'Program'
            >,
        ) {
            let loc;
            let name;

            /**
             * Skip if it expected no return value or unreachable.
             * When unreachable, all paths are returned or thrown.
             */
            if (
                !funcInfo!.hasReturnValue
                || areAllSegmentsUnreachable(funcInfo!.currentSegments)
                || astUtils.isES5Constructor(node)
                || isClassConstructor(node)
            ) {
                return;
            }

            // Adjust a location and a message.
            if (node.type === 'Program') {
                // The head of program.
                loc = { line: 1, column: 0 };
                name = 'program';
            } else if (node.type === 'ArrowFunctionExpression') {
                // `=>` token
                loc = context!.sourceCode.getTokenBefore(node.body, astUtils.isArrowToken)!.loc;
            } else if (
                node.parent.type === 'MethodDefinition'
                || (node.parent.type === 'Property' && node.parent.method)
            ) {
                // Method name.
                loc = node.parent.key.loc;
            } else {
                // Function name or `function` keyword.
                loc = (node.id || context.sourceCode.getFirstToken(node)).loc;
            }

            if (!name) {
                name = astUtils.getFunctionNameWithKind(node);
            }

            // Reports.
            context.report({
                node,
                loc,
                messageId: 'missingReturn',
                data: { name },
            });
        }

        return {
            // Initializes/Disposes state of each code path.
            onCodePathStart(codePath: CodePath, node: Node) {
                funcInfo = {
                    upper: funcInfo,
                    codePath,
                    hasReturn: false,
                    hasReturnValue: false,
                    messageId: '',
                    node,
                    currentSegments: new Set(),
                };
            },
            onCodePathEnd() {
                funcInfo = funcInfo!.upper;
            },

            onUnreachableCodePathSegmentStart(segment: CodePathSegment) {
                funcInfo!.currentSegments.add(segment);
            },

            onUnreachableCodePathSegmentEnd(segment: CodePathSegment) {
                funcInfo!.currentSegments.delete(segment);
            },

            onCodePathSegmentStart(segment: CodePathSegment) {
                funcInfo!.currentSegments.add(segment);
            },

            onCodePathSegmentEnd(segment: CodePathSegment) {
                funcInfo!.currentSegments.delete(segment);
            },

            // Reports a given return statement if it's inconsistent.
            ReturnStatement(node: Node<'ReturnStatement'>) {
                const { argument } = node;
                let hasReturnValue = Boolean(argument);

                if (treatUndefinedAsUnspecified && hasReturnValue) {
                    hasReturnValue = !astUtils.isSpecificId(argument!, 'undefined')
                        && argument!.operator !== 'void';
                }

                if (!funcInfo!.hasReturn) {
                    funcInfo!.hasReturn = true;
                    funcInfo!.hasReturnValue = hasReturnValue;
                    funcInfo!.messageId = hasReturnValue
                        ? 'missingReturnValue'
                        : 'unexpectedReturnValue';
                    funcInfo!.data = {
                        name:
                            funcInfo!.node.type === 'Program'
                                ? 'Program'
                                : upperCaseFirst(
                                    astUtils.getFunctionNameWithKind(funcInfo!.node),
                                ),
                    };
                } else if (funcInfo!.hasReturnValue !== hasReturnValue) {
                    context.report({
                        node,
                        messageId: funcInfo!.messageId,
                        data: funcInfo!.data,
                    });
                }
            },

            // Reports a given program/function if the implicit returning is not consistent.
            'Program:exit': checkLastSegment,
            'FunctionDeclaration:exit': checkLastSegment,
            'FunctionExpression:exit': checkLastSegment,
            'ArrowFunctionExpression:exit': checkLastSegment,
        };
    },
};

export default rule;
