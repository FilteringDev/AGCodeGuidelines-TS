import type {
    RuleContext, Fixer, LegacyRule, Node,
} from '../../types';
/**
 * @file Limit maximum of props on a single line in JSX
 * @author Yannick Croissant
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/eslint';
import dependency2 from '../util/report';

const docsUrl = dependency0;
const { getText } = dependency1;
const report = dependency2;

/**
 * @param context The rule context.
 * @param propNode The prop node value.
 * @returns The result of this check.
 */
function getPropName(context: RuleContext, propNode: Node<'JSXAttribute' | 'JSXSpreadAttribute'>) {
    if (propNode.type === 'JSXSpreadAttribute') {
        return getText(context, propNode.argument);
    }
    return propNode.name!.name;
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    newLine: 'Prop `{{prop}}` must be placed on a new line',
};

const rule: LegacyRule<
    [
        (
            | { maximum?: { single?: number; multi?: number; [key: string]: unknown } }
            | { maximum?: number; when?: 'always' | 'multiline' }
        )?,
    ]
> = {
    meta: {
        docs: {
            description: 'Enforce maximum of props on a single line in JSX',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-max-props-per-line'),
        },
        fixable: 'code',

        messages,

        schema: [
            {
                anyOf: [
                    {
                        type: 'object',
                        properties: {
                            maximum: {
                                type: 'object',
                                properties: {
                                    single: {
                                        type: 'integer',
                                        minimum: 1,
                                    },
                                    multi: {
                                        type: 'integer',
                                        minimum: 1,
                                    },
                                },
                            },
                        },
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            maximum: {
                                type: 'number',
                                minimum: 1,
                            },
                            when: {
                                type: 'string',
                                enum: ['always', 'multiline'],
                            },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || {};
        const maximum = configuration.maximum || 1;

        const maxConfig = typeof maximum === 'number'
            ? {
                single:
                          (configuration as { when?: 'always' | 'multiline' }).when === 'multiline'
                              ? Infinity
                              : maximum,
                multi: maximum,
            }
            : {
                single: maximum.single || Infinity,
                multi: maximum.multi || Infinity,
            };

        /**
         * @returns The result of this check.
         * @param line The line value.
         * @param max The max value.
         */
        function generateFixFunction(line: Node[], max: number) {
            const output = [];
            const front = line[0]!.range[0];
            const back = line[line.length - 1]!.range[1];

            for (let i = 0; i < line.length; i += max) {
                const nodes = line.slice(i, i + max);
                output.push(
                    nodes.reduce((prev, curr) => {
                        if (prev === '') {
                            return getText(context, curr);
                        }
                        return `${prev} ${getText(context, curr)}`;
                    }, ''),
                );
            }

            const code = output.join('\n');

            return function fix(fixer: Fixer) {
                return fixer.replaceTextRange([front, back], code);
            };
        }

        return {
            JSXOpeningElement(node: Node<'JSXOpeningElement'>) {
                if (!node.attributes.length) {
                    return;
                }

                const isSingleLineTag = node.loc.start.line === node.loc.end.line;

                if ((isSingleLineTag ? maxConfig.single : maxConfig.multi) === Infinity) {
                    return;
                }

                const firstProp = node.attributes[0]!;
                const linePartitionedProps = [[firstProp]];

                node.attributes.reduce((last, decl) => {
                    if (last.loc.end.line === decl.loc.start.line) {
                        linePartitionedProps[linePartitionedProps.length - 1]!.push(decl);
                    } else {
                        linePartitionedProps.push([decl]);
                    }
                    return decl;
                });

                linePartitionedProps.forEach((propsInLine) => {
                    const maxPropsCountPerLine = isSingleLineTag
&& propsInLine[0]!.loc.start.line === node.loc.start.line
                        ? maxConfig.single
                        : maxConfig.multi;

                    if (propsInLine.length > maxPropsCountPerLine) {
                        const name = getPropName(context, propsInLine[maxPropsCountPerLine]!);
                        report(context, messages.newLine, 'newLine', {
                            node: propsInLine[maxPropsCountPerLine]!,
                            data: {
                                prop: name,
                            },
                            fix: generateFixFunction(propsInLine, maxPropsCountPerLine),
                        });
                    }
                });
            },
        };
    },
};

export default rule;
