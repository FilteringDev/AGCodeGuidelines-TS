import { CALL, CONSTRUCT } from '@eslint-community/eslint-utils';
/**
 * @file Rule to disallow useless backreferences in regular expressions
 * @author Milos Djermanovic
 */
import * as dependency1 from '@eslint-community/regexpp';
import type { AST as regexpp } from '@eslint-community/regexpp';
import dependency0 from '../../compat/eslint-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const { ReferenceTracker, getStringIfConstant } = dependency0;
const { RegExpParser, visitRegExpAST } = dependency1;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const parser = new RegExpParser();

/**
 * Finds the path from the given `regexpp` AST node to the root node.
 * @param node Node.
 * @returns Array that starts with the given node and ends with the root node.
 */
function getPathToRoot(node: regexpp.Node) {
    const path: dependency1.AST.Node[] = [];
    let current: regexpp.Node | null = node;

    do {
        path.push(current);
        current = current.parent;
    } while (current);

    return path;
}

/**
 * Determines whether the given `regexpp` AST node is a lookaround node.
 * @param node Node.
 * @returns `true` if it is a lookaround node.
 */
function isLookaround(node: regexpp.Node) {
    return (
        node.type === 'Assertion' && (node.kind === 'lookahead' || node.kind === 'lookbehind')
    );
}

/**
 * Determines whether the given `regexpp` AST node is a negative lookaround node.
 * @param node Node.
 * @returns `true` if it is a negative lookaround node.
 */
function isNegativeLookaround(node: regexpp.Node) {
    return isLookaround(node) && node.negate;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow useless backreferences in regular expressions',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-useless-backreference',
        },

        schema: [],

        messages: {
            nested: "Backreference '{{ bref }}' will be ignored. It references group '{{ group }}' from within that group.",
            forward:
                "Backreference '{{ bref }}' will be ignored. It references group '{{ group }}' which appears later in the pattern.",
            backward:
                "Backreference '{{ bref }}' will be ignored. It references group '{{ group }}' which appears before in the same lookbehind.",
            disjunctive:
                "Backreference '{{ bref }}' will be ignored. It references group '{{ group }}' which is in another alternative.",
            intoNegativeLookaround:
                "Backreference '{{ bref }}' will be ignored. It references group '{{ group }}' which is in a negative lookaround.",
        },
    },

    create(context) {
        const { sourceCode } = context;

        /**
         * Checks and reports useless backreferences in the given regular expression.
         * @param node Node that represents regular expression. A regex literal or RegExp constructor call.
         * @param pattern Regular expression pattern.
         * @param flags Regular expression flags.
         */
        function checkRegex(node: Node, pattern: string, flags: string) {
            let regExpAST;

            try {
                regExpAST = parser.parsePattern(pattern, 0, pattern.length, {
                    unicode: flags.includes('u'),
                    unicodeSets: flags.includes('v'),
                });
            } catch {
                // Ignore regular expressions with syntax errors
                return;
            }

            visitRegExpAST(regExpAST, {
                onBackreferenceEnter(bref) {
                    // The inherited rule handles the single-target backreference form.
                    const group = bref.resolved as regexpp.CapturingGroup;
                    const brefPath = getPathToRoot(bref);
                    const groupPath = getPathToRoot(group);
                    let messageId = null;

                    if (brefPath.includes(group)) {
                        // group is bref's ancestor => bref is nested ('nested reference') => group hasn't matched
                        // yet when bref starts to match.
                        messageId = 'nested';
                    } else {
                        // Start from the root to find the lowest common ancestor.
                        let i = brefPath.length - 1;
                        let j = groupPath.length - 1;

                        do {
                            i -= 1;
                            j -= 1;
                        } while (brefPath[i] === groupPath[j]);

                        const indexOfLowestCommonAncestor = j + 1;
                        const groupCut = groupPath.slice(0, indexOfLowestCommonAncestor);
                        const commonPath = groupPath.slice(indexOfLowestCommonAncestor);
                        const lowestCommonLookaround = commonPath.find(isLookaround);
                        const isMatchingBackward = lowestCommonLookaround
                            && lowestCommonLookaround.kind === 'lookbehind';

                        if (!isMatchingBackward && bref.end <= group.start) {
                            // bref is left, group is right ('forward reference') => group hasn't matched yet when
                            // bref starts to match.
                            messageId = 'forward';
                        } else if (isMatchingBackward && group.end <= bref.start) {
                            // the opposite of the previous when the regex is matching backward in a lookbehind
                            // context.
                            messageId = 'backward';
                        } else if (groupCut![groupCut.length - 1]!.type === 'Alternative') {
                            // group's and bref's ancestor nodes below the lowest common ancestor are sibling
                            // alternatives => they're disjunctive.
                            messageId = 'disjunctive';
                        } else if (groupCut.some(isNegativeLookaround)) {
                            // group is in a negative lookaround which isn't bref's ancestor => group has already
                            // failed when bref starts to match.
                            messageId = 'intoNegativeLookaround';
                        }
                    }

                    if (messageId) {
                        context.report({
                            node,
                            messageId,
                            data: {
                                bref: bref.raw,
                                group: group.raw,
                            },
                        });
                    }
                },
            });
        }

        return {
            'Literal[regex]': function onLiteralRegex(node: Node<'Literal'>) {
                const { pattern, flags } = node.regex!;

                checkRegex(node, pattern, flags);
            },
            Program(node: Node<'Program'>) {
                const scope = sourceCode.getScope(node);
                const tracker = new ReferenceTracker(scope);
                const traceMap = {
                    RegExp: {
                        [CALL]: true,
                        [CONSTRUCT]: true,
                    },
                };

                Array.from(tracker.iterateGlobalReferences(traceMap)).forEach(
                    ({ node: refNode }) => {
                        const [patternNode, flagsNode] = refNode.arguments;
                        const pattern = getStringIfConstant(patternNode!, scope);
                        const flags = getStringIfConstant(flagsNode!, scope);

                        if (typeof pattern === 'string') {
                            checkRegex(refNode, pattern, flags || '');
                        }
                    },
                );
            },
        };
    },
};

export default rule;
