/**
 * @file Rule to replace assignment expressions with logical operator assignment
 * @author Daniel Martens
 */
import dependency0 from './utils/ast-utils';
import type {
    Fixer,
    Report,
    Suggestion,
    Scope,
    LegacyRule,
    Node,
    SourceCode,
    Token,
} from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------
const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const baseTypes = new Set(['Identifier', 'Super', 'ThisExpression']);

/**
 * Returns true iff either "undefined" or a void expression (eg. "void 0")
 * @param expression Expression to check
 * @param scope Scope of the expression
 * @returns True iff "undefined" or "void ..."
 */
function isUndefined(expression: Node, scope: Scope) {
    if (expression.type === 'Identifier' && expression.name === 'undefined') {
        return astUtils.isReferenceToGlobalVariable(scope, expression);
    }

    return (
        expression.type === 'UnaryExpression'
        && expression.operator === 'void'
        && expression.argument.type === 'Literal'
        && expression.argument.value === 0
    );
}

/**
 * Returns true iff the reference is either an identifier or member expression
 * @param expression Expression to check
 * @returns True for identifiers and member expressions
 */
function isReference(expression: Node): expression is Node<'Identifier' | 'MemberExpression'> {
    return (
        (expression.type === 'Identifier' && expression.name !== 'undefined')
        || expression.type === 'MemberExpression'
    );
}

/**
 * Returns true iff the expression checks for nullish with loose equals.
 * Examples: value == null, value == void 0
 * @param expression Test condition
 * @param scope Scope of the expression
 * @returns True iff implicit nullish comparison
 */
function isImplicitNullishComparison(
    expression: Node,
    scope: Scope,
): expression is Node<'BinaryExpression'> {
    if (expression.type !== 'BinaryExpression' || expression.operator !== '==') {
        return false;
    }

    const reference = isReference(expression.left) ? 'left' : 'right';
    const nullish = reference === 'left' ? 'right' : 'left';

    return (
        isReference(expression[reference])
        && (astUtils.isNullLiteral(expression[nullish]) || isUndefined(expression[nullish], scope))
    );
}

/**
 * Condition with two equal comparisons.
 * @param expression Condition
 * @returns True iff matches ? === ? || ? === ?
 */
function isDoubleComparison(expression: Node): expression is Node<'LogicalExpression'> & {
    left: Node<'BinaryExpression'>;
    right: Node<'BinaryExpression'>;
} {
    return (
        expression.type === 'LogicalExpression'
        && expression.operator === '||'
        && expression.left.type === 'BinaryExpression'
        && expression.left.operator === '==='
        && expression.right.type === 'BinaryExpression'
        && expression.right.operator === '==='
    );
}

/**
 * Returns true iff the expression checks for undefined and null.
 * Example: value === null || value === undefined
 * @param expression Test condition
 * @param scope Scope of the expression
 * @returns True iff explicit nullish comparison
 */
function isExplicitNullishComparison(
    expression: Node,
    scope: Scope,
): expression is Node<'LogicalExpression'> & {
    left: Node<'BinaryExpression'>;
    right: Node<'BinaryExpression'>;
} {
    if (!isDoubleComparison(expression)) {
        return false;
    }
    const leftReference = isReference(expression.left.left) ? 'left' : 'right';
    const leftNullish = leftReference === 'left' ? 'right' : 'left';
    const rightReference = isReference(expression.right.left) ? 'left' : 'right';
    const rightNullish = rightReference === 'left' ? 'right' : 'left';

    return (
        astUtils.isSameReference(
            expression.left[leftReference],
            expression.right[rightReference],
        )
        && ((astUtils.isNullLiteral(expression.left[leftNullish])
            && isUndefined(expression.right[rightNullish], scope))
            || (isUndefined(expression.left[leftNullish], scope)
                && astUtils.isNullLiteral(expression.right[rightNullish])))
    );
}

/**
 * Returns true for Boolean(arg) calls
 * @param expression Test condition
 * @param scope Scope of the expression
 * @returns Whether the expression is a boolean cast
 */
function isBooleanCast(expression: Node, scope: Scope): expression is Node<'CallExpression'> {
    return (
        expression.type === 'CallExpression'
        && expression.callee.name === 'Boolean'
        && expression.arguments.length === 1
        && astUtils.isReferenceToGlobalVariable(scope, expression.callee)
    );
}

/**
 * Returns true for:
 * truthiness checks:  value, Boolean(value), !!value
 * falsiness checks:   !value, !Boolean(value)
 * nullish checks:     value == null, value === undefined || value === null
 * @param expression Test condition
 * @param scope Scope of the expression
 * @returns Null if not a known existence
 */
function getExistence(expression: Node, scope: Scope) {
    const isNegated = expression.type === 'UnaryExpression' && expression.operator === '!';
    const base = isNegated ? expression.argument : expression;

    switch (true) {
        case isReference(base):
            return { reference: base, operator: isNegated ? '||' : '&&' };
        case base.type === 'UnaryExpression'
            && base.operator === '!'
            && isReference(base.argument):
            return { reference: base.argument, operator: '&&' };
        case isBooleanCast(base, scope) && isReference(base.arguments[0]!):
            return { reference: base.arguments[0], operator: isNegated ? '||' : '&&' };
        case isImplicitNullishComparison(expression, scope):
            return {
                reference: isReference(expression.left) ? expression.left : expression.right,
                operator: '??',
            };
        case isExplicitNullishComparison(expression, scope):
            return {
                reference: isReference(expression.left.left)
                    ? expression.left.left
                    : expression.left.right,
                operator: '??',
            };
        default:
            return null;
    }
}

/**
 * Returns true iff the node is inside a with block
 * @param node Node to check
 * @returns True iff passed node is inside a with block
 */
function isInsideWithBlock(node: Node): boolean {
    if (node.type === 'Program') {
        return false;
    }

    return node.parent.type === 'WithStatement' && node.parent.body === node
        ? true
        : isInsideWithBlock(node.parent);
}

/**
 * Gets the leftmost operand of a consecutive logical expression.
 * @param sourceCode The ESLint source code object
 * @param node LogicalExpression
 * @returns Leftmost operand
 */
function getLeftmostOperand(sourceCode: SourceCode, node: Node<'LogicalExpression'>) {
    let { left } = node;

    while (left.type === 'LogicalExpression' && left.operator === node.operator) {
        if (astUtils.isParenthesised(sourceCode, left)) {
            /**
             * It should have associativity,
             * but ignore it if use parentheses to make the evaluation order clear.
             */
            return left;
        }
        left = left.left;
    }
    return left;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------
const rule: LegacyRule<['always'?, { enforceForIfStatements?: boolean }?] | ['never']> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Require or disallow logical assignment operator shorthand',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/logical-assignment-operators',
        },

        schema: {
            type: 'array',
            oneOf: [
                {
                    items: [
                        { const: 'always' },
                        {
                            type: 'object',
                            properties: {
                                enforceForIfStatements: {
                                    type: 'boolean',
                                },
                            },
                            additionalProperties: false,
                        },
                    ],
                    minItems: 0, // 0 for allowing passing no options
                    maxItems: 2,
                },
                {
                    items: [{ const: 'never' }],
                    minItems: 1,
                    maxItems: 1,
                },
            ],
        },
        fixable: 'code',
        hasSuggestions: true,
        messages: {
            assignment:
                'Assignment (=) can be replaced with operator assignment ({{operator}}).',
            useLogicalOperator: 'Convert this assignment to use the operator {{ operator }}.',
            logical: 'Logical expression can be replaced with an assignment ({{ operator }}).',
            convertLogical:
                'Replace this logical expression with an assignment with the operator {{ operator }}.',
            if: "'if' statement can be replaced with a logical operator assignment with operator {{ operator }}.",
            convertIf:
                "Replace this 'if' statement with a logical assignment with operator {{ operator }}.",
            unexpected: 'Unexpected logical operator assignment ({{operator}}) shorthand.',
            separate:
                'Separate the logical assignment into an assignment with a logical operator.',
        },
    },

    create(context) {
        const mode = context.options[0] === 'never' ? 'never' : 'always';
        const checkIf = mode === 'always'
            && context.options.length > 1
            && context.options[1]!.enforceForIfStatements;
        const { sourceCode } = context;
        const { isStrict } = sourceCode.getScope(sourceCode.ast);

        /**
         * Returns false if the access could be a getter
         * @param node Assignment expression
         * @returns True iff the fix is safe
         */
        function cannotBeGetter(node: Node) {
            return node.type === 'Identifier' && (isStrict || !isInsideWithBlock(node));
        }

        /**
         * Check whether only a single property is accessed
         * @param node reference
         * @returns True iff a single property is accessed
         */
        function accessesSingleProperty(node: Node) {
            if (!isStrict && isInsideWithBlock(node)) {
                return node.type === 'Identifier';
            }

            return (
                node.type === 'MemberExpression'
                && baseTypes.has(node.object.type)
                && (!node.computed
                    || (node.property.type !== 'MemberExpression'
                        && node.property.type !== 'ChainExpression'))
            );
        }

        /**
         * Adds a fixer or suggestion whether on the fix is safe.
         * @param descriptor Report descriptor without fix or suggest
         * @param descriptor.messageId The message id value.
         * @param descriptor.Node The node value.
         * @param suggestion Adds the fix or the whole suggestion as only element in "suggest" to suggestion
         * @param suggestion.messageId The message id value.
         * @param suggestion.fix The fix value.
         * @param shouldBeFixed Fix iff the condition is true
         * @returns Descriptor with either an added fix or suggestion
         */
        function createConditionalFixer(
            descriptor: Report,
            suggestion: Suggestion,
            shouldBeFixed: boolean,
        ) {
            if (shouldBeFixed) {
                return {
                    ...descriptor,
                    fix: suggestion.fix,
                };
            }

            return {
                ...descriptor,
                suggest: [suggestion],
            };
        }

        /**
         * Returns the operator token for assignments and binary expressions
         * @param node AssignmentExpression or BinaryExpression
         * @returns Operator token between the left and right expression
         */
        function getOperatorToken(
            node: Node<'AssignmentExpression' | 'BinaryExpression' | 'LogicalExpression'>,
        ) {
            return sourceCode.getFirstTokenBetween(
                node.left,
                node.right,
                (token: Token) => token.value === node.operator,
            );
        }

        if (mode === 'never') {
            return {
                // foo ||= bar
                AssignmentExpression(assignment) {
                    if (!astUtils.isLogicalAssignmentOperator(assignment.operator)) {
                        return;
                    }

                    const descriptor = {
                        messageId: 'unexpected',
                        node: assignment,
                        data: { operator: assignment.operator },
                    };
                    const suggestion = {
                        messageId: 'separate',
                        * fix(ruleFixer: Fixer) {
                            if (sourceCode.getCommentsInside(assignment).length > 0) {
                                return;
                            }

                            const operatorToken = getOperatorToken(assignment);

                            // -> foo = bar
                            yield ruleFixer.replaceText(operatorToken!, '=');

                            const assignmentText = sourceCode.getText(assignment.left);
                            const operator = assignment.operator.slice(0, -1);

                            // -> foo = foo || bar
                            yield ruleFixer.insertTextAfter(
                                operatorToken!,
                                ` ${assignmentText} ${operator}`,
                            );

                            const precedence = astUtils.getPrecedence(assignment.right)
                                <= astUtils.getPrecedence({ type: 'LogicalExpression', operator });

                            // ?? and || / && cannot be mixed but have same precedence
                            const mixed = assignment.operator === '??='
                                && astUtils.isLogicalExpression(assignment.right);

                            if (
                                !astUtils.isParenthesised(sourceCode, assignment.right)
                                && (precedence || mixed)
                            ) {
                                // -> foo = foo || (bar)
                                yield ruleFixer.insertTextBefore(assignment.right, '(');
                                yield ruleFixer.insertTextAfter(assignment.right, ')');
                            }
                        },
                    };

                    context.report(
                        createConditionalFixer(
                            descriptor,
                            suggestion,
                            cannotBeGetter(assignment.left),
                        ),
                    );
                },
            };
        }

        return {
            // foo = foo || bar
            "AssignmentExpression[operator='='][right.type='LogicalExpression']":
                function onAssignmentExpressionOperatorRightTypeLogicalExpression(
                    assignment: Node<'AssignmentExpression'> & {
                        right: Node<'LogicalExpression'>;
                    },
                ) {
                    const leftOperand = getLeftmostOperand(sourceCode, assignment.right);

                    if (!astUtils.isSameReference(assignment.left, leftOperand)) {
                        return;
                    }

                    const descriptor = {
                        messageId: 'assignment',
                        node: assignment,
                        data: { operator: `${assignment.right.operator}=` },
                    };
                    const suggestion = {
                        messageId: 'useLogicalOperator',
                        data: { operator: `${assignment.right.operator}=` },
                        * fix(ruleFixer: Fixer) {
                            if (sourceCode.getCommentsInside(assignment).length > 0) {
                                return;
                            }

                            // No need for parenthesis around the assignment based on precedence as the precedence
                            // stays the same even with changed operator
                            const assignmentOperatorToken = getOperatorToken(assignment);

                            // -> foo ||= foo || bar
                            yield ruleFixer.insertTextBefore(
                                assignmentOperatorToken!,
                                assignment.right.operator,
                            );

                            // -> foo ||= bar
                            const logicalOperatorToken = getOperatorToken(
                                leftOperand.parent as Node<'LogicalExpression'>,
                            );
                            const firstRightOperandToken = sourceCode.getTokenAfter(
                                logicalOperatorToken!,
                            );

                            yield ruleFixer.removeRange([
                                leftOperand.parent.range[0],
                                firstRightOperandToken!.range[0],
                            ]);
                        },
                    };

                    context.report(
                        createConditionalFixer(
                            descriptor,
                            suggestion,
                            cannotBeGetter(assignment.left),
                        ),
                    );
                },

            // foo || (foo = bar)
            'LogicalExpression[right.type="AssignmentExpression"][right.operator="="]':
                function onLogicalExpressionRightTypeAssignmentExpressionRightOperator(
                    logical: Node<'LogicalExpression'> & {
                        right: Node<'AssignmentExpression'>;
                    },
                ) {
                    // Right side has to be parenthesized, otherwise would be parsed as (foo || foo) = bar which is
                    // illegal
                    if (
                        isReference(logical.left)
                        && astUtils.isSameReference(logical.left, logical.right.left)
                    ) {
                        const descriptor = {
                            messageId: 'logical',
                            node: logical,
                            data: { operator: `${logical.operator}=` },
                        };
                        const suggestion = {
                            messageId: 'convertLogical',
                            data: { operator: `${logical.operator}=` },
                            * fix(ruleFixer: Fixer) {
                                if (sourceCode.getCommentsInside(logical).length > 0) {
                                    return;
                                }

                                const parentPrecedence = astUtils.getPrecedence(logical.parent);
                                const requiresOuterParenthesis = logical.parent.type !== 'ExpressionStatement'
                                    && (parentPrecedence === -1
                                        || astUtils.getPrecedence({
                                            type: 'AssignmentExpression',
                                        }) < parentPrecedence);

                                if (
                                    !astUtils.isParenthesised(sourceCode, logical)
                                    && requiresOuterParenthesis
                                ) {
                                    yield ruleFixer.insertTextBefore(logical, '(');
                                    yield ruleFixer.insertTextAfter(logical, ')');
                                }

                                // Also removes all opening parenthesis
                                yield ruleFixer.removeRange([
                                    logical.range[0],
                                    logical.right.range[0],
                                ]); // -> foo = bar)

                                // Also removes all ending parenthesis
                                yield ruleFixer.removeRange([
                                    logical.right.range[1],
                                    logical.range[1],
                                ]); // -> foo = bar

                                const operatorToken = getOperatorToken(logical.right);

                                yield ruleFixer.insertTextBefore(
                                    operatorToken!,
                                    logical.operator,
                                ); // -> foo ||= bar
                            },
                        };
                        const fix = cannotBeGetter(logical.left)
                            || accessesSingleProperty(logical.left);

                        context.report(createConditionalFixer(descriptor, suggestion, fix));
                    }
                },

            // if (foo) foo = bar
            'IfStatement[alternate=null]': function onIfStatementAlternateNull(
                ifNode: Node<'IfStatement'>,
            ) {
                if (!checkIf) {
                    return;
                }

                const hasBody = ifNode.consequent.type === 'BlockStatement';

                if (
                    ifNode.consequent.type === 'BlockStatement'
                    && ifNode.consequent.body.length !== 1
                ) {
                    return;
                }

                const body = ifNode.consequent.type === 'BlockStatement'
                    ? ifNode.consequent.body[0]!
                    : ifNode.consequent;
                const scope = sourceCode.getScope(ifNode);
                const existence = getExistence(ifNode.test, scope);

                if (
                    body.type === 'ExpressionStatement'
                    && body.expression.type === 'AssignmentExpression'
                    && body.expression.operator === '='
                    && existence !== null
                    && astUtils.isSameReference(existence.reference, body.expression.left)
                ) {
                    const descriptor = {
                        messageId: 'if',
                        node: ifNode,
                        data: { operator: `${existence.operator}=` },
                    };
                    const suggestion = {
                        messageId: 'convertIf',
                        data: { operator: `${existence.operator}=` },
                        * fix(ruleFixer: Fixer) {
                            if (sourceCode.getCommentsInside(ifNode).length > 0) {
                                return;
                            }

                            const firstBodyToken = sourceCode.getFirstToken(body);
                            const prevToken = sourceCode.getTokenBefore(ifNode);

                            if (
                                prevToken !== null
                                && prevToken.value !== ';'
                                && prevToken.value !== '{'
                                && firstBodyToken!.type !== 'Identifier'
                                && firstBodyToken!.type !== 'Keyword'
                            ) {
                                // Do not fix if the fixed statement could be part of the previous statement (eg.
                                // fn() if (a == null) (a) = b --> fn()(a) ??= b)
                                return;
                            }

                            const operatorToken = getOperatorToken(
                                body.expression as Node<'AssignmentExpression'>,
                            );

                            yield ruleFixer.insertTextBefore(
                                operatorToken!,
                                existence.operator,
                            ); // -> if (foo) foo ||= bar

                            yield ruleFixer.removeRange([ifNode.range[0], body.range[0]]); // -> foo ||= bar

                            // -> foo ||= bar, only present if "if" had a body

                            yield ruleFixer.removeRange([body.range[1], ifNode.range[1]]);

                            const nextToken = sourceCode.getTokenAfter(body.expression);

                            if (hasBody && nextToken !== null && nextToken.value !== ';') {
                                yield ruleFixer.insertTextAfter(ifNode, ';');
                            }
                        },
                    };
                    const shouldBeFixed = cannotBeGetter(existence.reference)
                        || (ifNode.test.type !== 'LogicalExpression'
                            && accessesSingleProperty(existence.reference));

                    context.report(
                        createConditionalFixer(descriptor, suggestion, shouldBeFixed),
                    );
                }
            },
        };
    },
};

export default rule;
