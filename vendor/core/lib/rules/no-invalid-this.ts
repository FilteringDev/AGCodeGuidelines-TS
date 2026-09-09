/**
 * @file A rule to disallow `this` keywords in contexts where the value of `this` is `undefined`.
 * @author Toru Nagashima
 */
import dependency0 from './utils/ast-utils';
import type { CodePath, LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Determines if the given code path is a code path with lexical `this` binding.
 * That is, if `this` within the code path refers to `this` of surrounding code path.
 * @param codePath Code path.
 * @param node Node that started the code path.
 * @returns `true` if it is a code path with lexical `this` binding.
 */
function isCodePathWithLexicalThis(codePath: CodePath, node: Node) {
    return codePath.origin === 'function' && node.type === 'ArrowFunctionExpression';
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ capIsConstructor?: boolean }?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description:
                'Disallow use of `this` in contexts where the value of `this` is `undefined`',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-invalid-this',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    capIsConstructor: {
                        type: 'boolean',
                        default: true,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            unexpectedThis: "Unexpected 'this'.",
        },
    },

    create(context) {
        const options = context.options[0] || {};
        const capIsConstructor = options.capIsConstructor !== false;
        const stack: { init: boolean; node: Node; valid: boolean }[] = [];
        const { sourceCode } = context;

        /**
         * Gets the current checking context.
         * @returns The checking context with its this-binding validity initialized.
         *
         * The return value has a flag that whether or not `this` keyword is valid.
         * The flag is initialized when got at the first time.
         *   an object which has a flag that whether or not `this` keyword is valid.
         */
        function getCurrent() {
            const current = stack[stack.length - 1];

            if (!current!.init) {
                current!.init = true;
                current!.valid = !astUtils.isDefaultThisBinding(current!.node, sourceCode, {
                    capIsConstructor,
                });
            }
            return current;
        }

        return {
            onCodePathStart(codePath: CodePath, node: Node) {
                if (isCodePathWithLexicalThis(codePath, node)) {
                    return;
                }

                if (codePath.origin === 'program') {
                    const scope = sourceCode.getScope(node);
                    const features = context!.languageOptions.parserOptions!.ecmaFeatures || {};

                    // `this` at the top level of scripts always refers to the global object
                    stack.push({
                        init: true,
                        node,
                        valid: !(
                            ('sourceType' in node && node.sourceType === 'module')
                            || (features.globalReturn && scope!.childScopes[0]!.isStrict)
                        ),
                    });

                    return;
                }

                /**
                 * `init: false` means that `valid` isn't determined yet.
                 * Most functions don't use `this`, and the calculation for `valid`
                 * is relatively costly, so we'll calculate it lazily when the first
                 * `this` within the function is traversed. A special case are non-strict
                 * functions, because `this` refers to the global object and therefore is
                 * always valid, so we can set `init: true` right away.
                 */
                stack.push({
                    init: !sourceCode.getScope(node).isStrict,
                    node,
                    valid: true,
                });
            },

            onCodePathEnd(codePath: CodePath, node: Node) {
                if (isCodePathWithLexicalThis(codePath, node)) {
                    return;
                }

                stack.pop();
            },

            // Reports if `this` of the current context is invalid.
            ThisExpression(node: Node<'ThisExpression'>) {
                const current = getCurrent();

                if (current && !current.valid) {
                    context.report({
                        node,
                        messageId: 'unexpectedThis',
                    });
                }
            },
        };
    },
};

export default rule;
