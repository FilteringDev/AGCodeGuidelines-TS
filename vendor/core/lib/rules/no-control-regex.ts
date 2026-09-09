/**
 * @file Rule to forbid control characters from regular expressions.
 * @author Nicholas C. Zakas
 */
import * as dependency0 from '@eslint-community/regexpp';
import type { LegacyRule, Node } from '../../../types';

const { RegExpValidator } = dependency0;
const collector = new (class ControlCharacterCollector {
    declare private source: string;

    declare private controlChars: string[];

    declare private validator: InstanceType<typeof RegExpValidator>;

    constructor() {
        this.source = '';
        this.controlChars = [];
        this.validator = new RegExpValidator(this);
    }

    onPatternEnter() {
        /**
         * `RegExpValidator` may parse the pattern twice in one `validatePattern`.
         * So `this.controlChars` should be cleared here as well.
         *
         * For example, the `/(?<a>\x1f)/` regex will parse the pattern twice.
         * This is based on the content described in Annex B.
         * If the regex contains a `GroupName` and the `u` flag is not used, `ParseText` will be called twice.
         * See
         * https://tc39.es/ecma262/#sec-parsepattern-annexb
         */
        this.controlChars = [];
    }

    onCharacter(start: number, end: number, cp: number) {
        if (
            cp >= 0x00
            && cp <= 0x1f
            && (this.source.codePointAt(start) === cp
                || this.source.slice(start, end).startsWith('\\x')
                || this.source.slice(start, end).startsWith('\\u'))
        ) {
            this.controlChars.push(`\\x${`0${cp.toString(16)}`.slice(-2)}`);
        }
    }

    collectControlChars(regexpStr: string, flags: string | null) {
        const uFlag = typeof flags === 'string' && flags.includes('u');
        const vFlag = typeof flags === 'string' && flags.includes('v');

        this.controlChars = [];
        this.source = regexpStr;

        try {
            this.validator.validatePattern(regexpStr, undefined, undefined, {
                unicode: uFlag,
                unicodeSets: vFlag,
            }); // Call onCharacter hook
        } catch {
            // Ignore syntax errors in RegExp.
        }
        return this.controlChars;
    }
})();

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow control characters in regular expressions',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-control-regex',
        },

        schema: [],

        messages: {
            unexpected:
                'Unexpected control character(s) in regular expression: {{controlChars}}.',
        },
    },

    create(context) {
        /**
         * Get the regex expression
         * @param node `Literal` node to evaluate
         * @returns Regex if found (the given node is either a regex literal
         * or a string literal that is the pattern argument of a RegExp constructor call). Otherwise `null`. If
         * flags cannot be determined,
         * the `flags` property will be `null`.
         */
        function getRegExp(node: Node<'Literal'>) {
            if (node.regex) {
                return node.regex;
            }
            if (
                typeof node.value === 'string'
                && (node.parent.type === 'NewExpression'
                    || node.parent.type === 'CallExpression')
                && node.parent.callee.type === 'Identifier'
                && node.parent.callee.name === 'RegExp'
                && node.parent.arguments[0] === node
            ) {
                const pattern = node.value;
                const flags = node.parent.arguments.length > 1
                    && node!.parent.arguments[1]!.type === 'Literal'
                    && typeof node!.parent.arguments[1]!.value === 'string'
                    ? node!.parent.arguments[1]!.value
                    : null;

                return { pattern, flags };
            }

            return null;
        }

        return {
            Literal(node: Node<'Literal'>) {
                const regExp = getRegExp(node);

                if (regExp) {
                    const { pattern, flags } = regExp;
                    const controlCharacters = collector.collectControlChars(pattern, flags);

                    if (controlCharacters.length > 0) {
                        context.report({
                            node,
                            messageId: 'unexpected',
                            data: {
                                controlChars: controlCharacters.join(', '),
                            },
                        });
                    }
                }
            },
        };
    },
};

export default rule;
