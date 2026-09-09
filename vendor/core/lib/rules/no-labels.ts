/**
 * @file Disallow Labeled Statements
 * @author Nicholas C. Zakas
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[{ allowLoop?: boolean; allowSwitch?: boolean }?]> = {
    meta: {
        type: 'suggestion',

        docs: {
            description: 'Disallow labeled statements',
            recommended: false,
            url: 'https://eslint.org/docs/latest/rules/no-labels',
        },

        schema: [
            {
                type: 'object',
                properties: {
                    allowLoop: {
                        type: 'boolean',
                        default: false,
                    },
                    allowSwitch: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],

        messages: {
            unexpectedLabel: 'Unexpected labeled statement.',
            unexpectedLabelInBreak: 'Unexpected label in break statement.',
            unexpectedLabelInContinue: 'Unexpected label in continue statement.',
        },
    },

    create(context) {
        const options = context.options[0];
        const allowLoop = options && options.allowLoop;
        const allowSwitch = options && options.allowSwitch;
        interface ScopeInfoState {
            label: string;
            kind: string;
            upper: ScopeInfoState | null;
        }
        let scopeInfo: ScopeInfoState | null = null;

        /**
         * Gets the kind of a given node.
         * @param node A node to get.
         * @returns The kind of the node.
         */
        function getBodyKind(node: Node) {
            if (astUtils.isLoop(node)) {
                return 'loop';
            }
            if (node.type === 'SwitchStatement') {
                return 'switch';
            }
            return 'other';
        }

        /**
         * Checks whether the label of a given kind is allowed or not.
         * @param kind A kind to check.
         * @returns `true` if the kind is allowed.
         */
        function isAllowed(kind: string) {
            switch (kind) {
                case 'loop':
                    return allowLoop;
                case 'switch':
                    return allowSwitch;
                default:
                    return false;
            }
        }

        /**
         * Checks whether a given name is a label of a loop or not.
         * @param label A name of a label to check.
         * @returns `true` if the name is a label of a loop.
         */
        function getKind(label: string) {
            let info = scopeInfo;

            while (info) {
                if (info.label === label) {
                    return info.kind;
                }
                info = info.upper;
            }

            /* c8 ignore next */
            return 'other';
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            LabeledStatement(node: Node<'LabeledStatement'>) {
                scopeInfo = {
                    label: node.label.name,
                    kind: getBodyKind(node.body),
                    upper: scopeInfo,
                };
            },

            'LabeledStatement:exit': function onLabeledStatementExit(
                node: Node<'LabeledStatement'>,
            ) {
                if (!isAllowed(scopeInfo!.kind)) {
                    context.report({
                        node,
                        messageId: 'unexpectedLabel',
                    });
                }

                scopeInfo = scopeInfo!.upper;
            },

            BreakStatement(node: Node<'BreakStatement'>) {
                if (node.label && !isAllowed(getKind(node.label.name))) {
                    context.report({
                        node,
                        messageId: 'unexpectedLabelInBreak',
                    });
                }
            },

            ContinueStatement(node: Node<'ContinueStatement'>) {
                if (node.label && !isAllowed(getKind(node.label.name))) {
                    context.report({
                        node,
                        messageId: 'unexpectedLabelInContinue',
                    });
                }
            },
        };
    },
};

export default rule;
