import type { Fixer, LegacyRule, Node } from '../../types';
/**
 * @file Enforce boolean attributes notation in JSX
 * @author Yannick Croissant
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/report';

const docsUrl = dependency0;
const report = dependency1;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const exceptionsSchema = {
    type: 'array',
    items: { type: 'string', minLength: 1 },
    uniqueItems: true,
};

const ALWAYS = 'always';
const NEVER = 'never';

/**
 * @param configuration The value to inspect.
 * @param exceptions The value to inspect.
 * @param propName The value to inspect.
 * @returns propName
 */
function isAlways(configuration: string, exceptions: Set<string>, propName: string) {
    const isException = exceptions.has(propName);
    if (configuration === ALWAYS) {
        return !isException;
    }
    return isException;
}
/**
 * @param configuration The value to inspect.
 * @param exceptions The value to inspect.
 * @param propName The value to inspect.
 * @returns propName
 */
function isNever(configuration: string, exceptions: Set<string>, propName: string) {
    const isException = exceptions.has(propName);
    if (configuration === NEVER) {
        return !isException;
    }
    return isException;
}

const messages = {
    omitBoolean: 'Value must be omitted for boolean attribute `{{propName}}`',
    setBoolean: 'Value must be set for boolean attribute `{{propName}}`',
    omitPropAndBoolean: 'Value must be omitted for `false` attribute: `{{propName}}`',
};

const rule: LegacyRule<
    | [('always' | 'never')?]
    | ['always'?, { never?: string[]; assumeUndefinedIsFalse?: boolean }?]
    | ['never'?, { always?: string[]; assumeUndefinedIsFalse?: boolean }?]
> = {
    meta: {
        docs: {
            description: 'Enforce boolean attributes notation in JSX',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('jsx-boolean-value'),
        },
        fixable: 'code',

        messages,

        schema: {
            anyOf: [
                {
                    type: 'array',
                    items: [{ enum: [ALWAYS, NEVER] }],
                    additionalItems: false,
                },
                {
                    type: 'array',
                    items: [
                        {
                            enum: [ALWAYS],
                        },
                        {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                [NEVER]: exceptionsSchema,
                                assumeUndefinedIsFalse: {
                                    type: 'boolean',
                                },
                            },
                        },
                    ],
                    additionalItems: false,
                },
                {
                    type: 'array',
                    items: [
                        {
                            enum: [NEVER],
                        },
                        {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                [ALWAYS]: exceptionsSchema,
                                assumeUndefinedIsFalse: {
                                    type: 'boolean',
                                },
                            },
                        },
                    ],
                    additionalItems: false,
                },
            ],
        },
    },

    create(context) {
        const configuration = context.options[0] || NEVER;
        const configObject: {
            never?: string[];
            always?: string[];
            assumeUndefinedIsFalse?: boolean;
        } = context.options[1] || {};
        const exceptions = new Set<string>(
            (configuration === ALWAYS ? configObject[NEVER] : configObject[ALWAYS]) || [],
        );

        return {
            JSXAttribute(node: Node<'JSXAttribute'>) {
                const propName = (node.name && node.name.name) as string;
                const { value } = node;

                if (isAlways(configuration, exceptions, propName) && value === null) {
                    const messageId = 'setBoolean';
                    const data = { propName };
                    report(context, messages[messageId], messageId, {
                        node,
                        data,
                        fix(fixer: Fixer) {
                            return fixer.insertTextAfter(node, '={true}');
                        },
                    });
                }
                if (
                    isNever(configuration, exceptions, propName)
                    && value
                    && value.type === 'JSXExpressionContainer'
                    && value.expression.value === true
                ) {
                    const messageId = 'omitBoolean';
                    const data = { propName };
                    report(context, messages[messageId], messageId, {
                        node,
                        data,
                        fix(fixer: Fixer) {
                            return fixer.removeRange([node.name.range[1], value.range[1]]);
                        },
                    });
                }
                if (
                    isNever(configuration, exceptions, propName)
                    && configObject.assumeUndefinedIsFalse
                    && value
                    && value.type === 'JSXExpressionContainer'
                    && value.expression.value === false
                ) {
                    const messageId = 'omitPropAndBoolean';
                    const data = { propName };
                    report(context, messages[messageId], messageId, {
                        node,
                        data,
                        fix(fixer: Fixer) {
                            return fixer.removeRange([node.name.range[0], value.range[1]]);
                        },
                    });
                }
            },
        };
    },
};

export default rule;
