import buildRejectOrPreferRuleDefinition from '../buildRejectOrPreferRuleDefinition';
import { strictNativeTypes } from '../jsdocUtils';

export type CheckNativeTypes = (
    preferredTypes: import('../iterateJsdoc').PreferredTypes,
    typeNodeName: string,
    preferred: string | undefined,
    parentNode: import('jsdoc-type-pratt-parser').NonRootResult | undefined,
    invalidTypes: (string | false | undefined)[][],
) => string | undefined;

const checkNativeTypes: CheckNativeTypes = (
    preferredTypes,
    typeNodeName,
    preferred,
    parentNode,
    invalidTypes,
) => {
    let changedPreferred = preferred;
    const nativeTypes = Array.from(strictNativeTypes);
    for (let nativeTypesIndex = 0; nativeTypesIndex < nativeTypes.length; nativeTypesIndex += 1) {
        const strictNativeType = nativeTypes[nativeTypesIndex]!;
        if (!(strictNativeType === 'object'
            // This is not set to remap with exact type match (e.g.,
            //   `object: 'Object'`), so can ignore (including if circular)
            && (!preferredTypes?.[typeNodeName]
            // Although present on `preferredTypes` for remapping, this is a
            //   parent object without a parent match (and not
            //   `unifyParentAndChildTypeChecks`) and we don't want
            //   `object<>` given TypeScript issue https://github.com/microsoft/TypeScript/issues/20555

                || ((parentNode as import('jsdoc-type-pratt-parser').GenericResult)
                    ?.elements?.length

                    && (
                        parentNode as import('jsdoc-type-pratt-parser').GenericResult
                    )?.left?.type === 'JsdocTypeName'

                    && (
                        (
                            parentNode as import('jsdoc-type-pratt-parser').GenericResult
                        )?.left as import('jsdoc-type-pratt-parser').NameResult
                    )?.value === 'Object')))) {
            if (
                strictNativeType !== typeNodeName
            && strictNativeType.toLowerCase() === typeNodeName.toLowerCase()
            // Don't report if user has own map for a strict native type
            && (!preferredTypes
                || preferredTypes?.[strictNativeType] === undefined)
            ) {
                changedPreferred = strictNativeType;
                invalidTypes.push([typeNodeName, changedPreferred]);
                break;
            }
        }
    }

    return changedPreferred;
};

export default buildRejectOrPreferRuleDefinition({
    checkNativeTypes,
    schema: [
        {
            additionalProperties: false,
            properties: {
                exemptTagContexts: {
                    description:
                        'Avoids reporting when a bad type is found on a specified tag.',
                    items: {
                        additionalProperties: false,
                        properties: {
                            tag: {
                                description:
                                    'Set a key `tag` to the tag to exempt',
                                type: 'string',
                            },
                            types: {
                                description: `Set to \`true\` to indicate that any types on that tag will be allowed,
or to an array of strings which will only allow specific bad types.
If an array of strings is given, these must match the type exactly,
e.g., if you only allow \`"object"\`, it will not allow
\`"object<string, string>"\`. Note that this is different from the
behavior of \`settings.jsdoc.preferredTypes\`. This option is useful
for normally restricting generic types like \`object\` with
\`preferredTypes\`, but allowing \`typedef\` to indicate that its base
type is \`object\`.`,
                                oneOf: [
                                    {
                                        type: 'boolean',
                                    },
                                    {
                                        items: {
                                            type: 'string',
                                        },
                                        type: 'array',
                                    },
                                ],
                            },
                        },
                        type: 'object',
                    },
                    type: 'array',
                },
                noDefaults: {
                    description: `Insists that only the supplied option type
map is to be used, and that the default preferences (such as "string"
over "String") will not be enforced. The option's default is \`false\`.`,
                    type: 'boolean',
                },
                unifyParentAndChildTypeChecks: {
                    description: `@deprecated Use the \`preferredTypes[preferredType]\` setting of the same name instead.
If this option is \`true\`, will currently override \`unifyParentAndChildTypeChecks\` on the \`preferredTypes\` setting.`,
                    type: 'boolean',
                },
            },
            type: 'object',
        },
    ],
});
