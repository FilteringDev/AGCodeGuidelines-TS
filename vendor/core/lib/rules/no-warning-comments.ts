/**
 * @file Rule that warns about used warning comments
 * @author Alexander Schmidt <https://github.com/lxanders>
 */
import dependency0 from 'escape-string-regexp';
import dependency1 from './utils/ast-utils';
import type { Comment, LegacyRule, Token } from '../../../types';

const escapeRegExp = dependency0;
const astUtils = dependency1;

const CHAR_LIMIT = 40;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<
    [{ terms?: string[]; location?: 'start' | 'anywhere'; decoration?: string[] }?]
> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow specified warning terms in comments',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-warning-comments',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    terms: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    location: {
                        enum: ['start', 'anywhere'],
                    },
                    decoration: {
                        type: 'array',
                        items: {
                            type: 'string',
                            pattern: '^\\S$',
                        },
                        minItems: 1,
                        uniqueItems: true,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            unexpectedComment: "Unexpected '{{matchedTerm}}' comment: '{{comment}}'.",
        },
    },

    create(context) {
        const { sourceCode } = context;
        const configuration = context.options[0] || {};
        const warningTerms = configuration.terms || ['todo', 'fixme', 'xxx'];
        const location = configuration.location || 'start';
        const decoration = [...(configuration.decoration || [])].join('');
        const selfConfigRegEx = /\bno-warning-comments\b/u;

        /**
         * Convert a warning term into a RegExp which will match a comment containing that whole word in the
         * specified
         * location ("start" or "anywhere"). If the term starts or ends with non word characters, then the match
         * will not
         * require word boundaries on that side.
         * @param term A term to convert to a RegExp
         * @returns The term converted to a RegExp
         */
        function convertToRegExp(term: string) {
            const escaped = escapeRegExp(term);
            const escapedDecoration = escapeRegExp(decoration);

            /**
             * When matching at the start, ignore leading whitespace, and
             * there's no need to worry about word boundaries.
             *
             * These expressions for the prefix and suffix are designed as follows:
             * ^   handles any terms at the beginning of a comment.
             *     e.g. terms ["TODO"] matches `//TODO something`
             * $   handles any terms at the end of a comment
             *     e.g. terms ["TODO"] matches `// something TODO`
             * \b  handles terms preceded/followed by word boundary
             *     e.g. terms: ["!FIX", "FIX!"] matches `// FIX!something` or `// something!FIX`
             *          terms: ["FIX"] matches `// FIX!` or `// !FIX`, but not `// fixed or affix`
             *
             * For location start:
             * [\s]* handles optional leading spaces
             *     e.g. terms ["TODO"] matches `//    TODO something`
             * [\s\*]* (where "\*" is the escaped string of decoration)
             *     handles optional leading spaces or decoration characters (for "start" location only)
             *     e.g. terms ["TODO"] matches `/**** TODO something ... `
             */
            const wordBoundary = '\\b';

            let prefix = '';

            if (location === 'start') {
                prefix = `^[\\s${escapedDecoration}]*`;
            } else if (/^\w/u.test(term)) {
                prefix = wordBoundary;
            }

            const suffix = /\w$/u.test(term) ? wordBoundary : '';
            const flags = 'iu'; // Case-insensitive with Unicode case folding.

            /**
             * For location "start", the typical regex is:
             *   /^[\s]*ESCAPED_TERM\b/iu.
             * Or if decoration characters are specified (e.g. "*"), then any of
             * those characters may appear in any order at the start:
             *   /^[\s\*]*ESCAPED_TERM\b/iu.
             *
             * For location "anywhere" the typical regex is
             *   /\bESCAPED_TERM\b/iu
             *
             * If it starts or ends with non-word character, the prefix and suffix are empty, respectively.
             */
            return new RegExp(`${prefix}${escaped}${suffix}`, flags);
        }

        const warningRegExps = warningTerms.map(convertToRegExp);

        /**
         * Checks the specified comment for matches of the configured warning terms and returns the matches.
         * @param comment The comment which is checked.
         * @returns All matched warning terms for this comment.
         */
        function commentContainsWarningTerm(comment: string) {
            const matches: (string | undefined)[] = [];

            warningRegExps.forEach((regex, index) => {
                if (regex.test(comment)) {
                    matches.push(warningTerms[index]);
                }
            });

            return matches;
        }

        /**
         * Checks the specified node for matching warning comments and reports them.
         * @param node The AST node being checked.
         */
        function checkComment(node: Comment) {
            const comment = node.value;

            if (astUtils.isDirectiveComment(node) && selfConfigRegEx.test(comment)) {
                return;
            }

            const matches = commentContainsWarningTerm(comment);

            matches.forEach((matchedTerm) => {
                let commentToDisplay = '';
                let truncated = false;

                const commentWords = comment!.trim().split(/\s+/u);
                for (let commentWordsIndex = 0; commentWordsIndex < commentWords.length; commentWordsIndex += 1) {
                    const c = commentWords[commentWordsIndex]!;
                    const tmp = commentToDisplay ? `${commentToDisplay} ${c}` : c;

                    if (tmp.length <= CHAR_LIMIT) {
                        commentToDisplay = tmp;
                    } else {
                        truncated = true;
                        break;
                    }
                }

                context.report({
                    node,
                    messageId: 'unexpectedComment',
                    data: {
                        matchedTerm,
                        comment: `${commentToDisplay}${truncated ? '...' : ''}`,
                    },
                });
            });
        }

        return {
            Program() {
                const comments = sourceCode.getAllComments();

                comments
                    .filter((token: Token) => token.type !== 'Shebang')
                    .forEach(checkComment);
            },
        };
    },
};

export default rule;
