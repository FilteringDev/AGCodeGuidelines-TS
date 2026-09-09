import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file HTML special characters should be escaped.
 * @author Patrick Hayes
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/eslint';
import dependency2 from '../util/jsx';
import dependency3 from '../util/report';
import dependency4 from '../util/message';

const docsUrl = dependency0;
const { getSourceCode } = dependency1;
const jsxUtil = dependency2;
const report = dependency3;
const getMessageData = dependency4;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

// NOTE: '<' and '{' are also problematic characters, but they do not need
// to be included here because it is a syntax error when these characters are
// included accidentally.
const DEFAULTS = [
    {
        char: '>',
        alternatives: ['&gt;'],
    },
    {
        char: '"',
        alternatives: ['&quot;', '&ldquo;', '&#34;', '&rdquo;'],
    },
    {
        char: "'",
        alternatives: ['&apos;', '&lsquo;', '&#39;', '&rsquo;'],
    },
    {
        char: '}',
        alternatives: ['&#125;'],
    },
];

const messages = {
    unescapedEntity: 'HTML entity, `{{entity}}` , must be escaped.',
    unescapedEntityAlts: '`{{entity}}` can be escaped with {{alts}}.',
    replaceWithAlt: 'Replace with `{{alt}}`.',
};

const rule: LegacyRule<
    [{ forbid?: (string | { char?: string; alternatives?: string[]; [key: string]: unknown })[] }?]
> = {
    meta: {
        hasSuggestions: true,
        docs: {
            description: 'Disallow unescaped HTML entities from appearing in markup',
            category: 'Possible Errors',
            recommended: true,
            url: docsUrl('no-unescaped-entities'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    forbid: {
                        type: 'array',
                        items: {
                            anyOf: [
                                {
                                    type: 'string',
                                },
                                {
                                    type: 'object',
                                    properties: {
                                        char: {
                                            type: 'string',
                                        },
                                        alternatives: {
                                            type: 'array',
                                            uniqueItems: true,
                                            items: {
                                                type: 'string',
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        /**
         * @param node The node to inspect.
         */
        function reportInvalidEntity(node: Node) {
            const configuration = context.options[0] || {};
            const entities = configuration.forbid || DEFAULTS;

            // HTML entities are already escaped in node.value (as well as node.raw),
            // so pull the raw text from getSourceCode(context)
            for (let i = node.loc.start.line; i <= node.loc.end.line; i += 1) {
                let rawLine = getSourceCode(context).lines[i - 1];
                let start = 0;
                let end = rawLine!.length;
                if (i === node.loc.start.line) {
                    start = node.loc.start.column;
                }
                if (i === node.loc.end.line) {
                    end = node.loc.end.column;
                }
                rawLine = rawLine!.slice(start, end);
                for (let j = 0; j < entities.length; j += 1) {
                    const entity = entities[j]!;
                    for (let index = 0; index < rawLine.length; index += 1) {
                        const c = rawLine[index];
                        if (typeof entity === 'string') {
                            if (c === entity) {
                                report(context, messages.unescapedEntity, 'unescapedEntity', {
                                    node,
                                    loc: { line: i, column: start + index },
                                    data: {
                                        entity,
                                    },
                                });
                            }
                        } else if (c === entity.char) {
                            report(context, messages.unescapedEntityAlts, 'unescapedEntityAlts', {
                                node,
                                loc: { line: i, column: start + index },
                                data: {
                                    entity: entity.char,
                                    alts: entity.alternatives!.map((alt) => `\`${alt}\``).join(', '),
                                },
                                suggest: entity.alternatives!.map((alt: string) => Object.assign(
                                    getMessageData('replaceWithAlt', messages.replaceWithAlt),
                                    {
                                        data: { alt },
                                        fix(fixer: Fixer) {
                                            const lineToChange = i - node.loc.start.line;

                                            const newText = node
                                                .raw!.split('\n')
                                                .map((line, idx) => {
                                                    if (idx === lineToChange) {
                                                        return (
                                                            line.slice(0, index)
                                                                + alt
                                                                + line.slice(index + 1)
                                                        );
                                                    }

                                                    return line;
                                                })
                                                .join('\n');

                                            return fixer.replaceText(node, newText);
                                        },
                                    },
                                )),
                            });
                        }
                    }
                }
            }
        }

        return {
            'Literal, JSXText': function onLiteralJSXText(node: Node<'Literal' | 'JSXText'>) {
                if (jsxUtil.isJSX(node.parent)) {
                    reportInvalidEntity(node);
                }
            },
        };
    },
};

export default rule;
