export type TagStructure = Map<string, Map<string, string | boolean>>;
/**
 * @param mode The mode value.
 * @returns The result of this check.
 */
const getDefaultTagStructureForMode = (
    mode: import('./jsdocUtils').ParserMode,
): TagStructure => {
    const isJsdoc = mode === 'jsdoc';
    const isClosure = mode === 'closure';
    const isTypescript = mode === 'typescript';
    const isPermissive = mode === 'permissive';

    const isJsdocOrPermissive = isJsdoc || isPermissive;
    const isJsdocOrTypescript = isJsdoc || isTypescript;
    const isTypescriptOrClosure = isTypescript || isClosure;
    const isClosureOrPermissive = isClosure || isPermissive;
    const isJsdocTypescriptOrPermissive = isJsdocOrTypescript || isPermissive;

    // Properties:
    // `namepathRole` -
    // 'namepath-referencing'|'name-defining'|'namepath-defining'|'namepath-or-url-referencing'|'text'|false
    // `typeAllowed` - boolean
    // `nameRequired` - boolean
    // `typeRequired` - boolean
    // `typeOrNameRequired` - boolean

    // All of `typeAllowed` have a signature with "type" except for
    //  `augments`/`extends` ("namepath")
    //  `param`/`arg`/`argument` (no signature)
    //  `property`/`prop` (no signature)
    //  `modifies` (undocumented)

    // None of the `namepathRole: 'namepath-defining'` show as having curly
    //  brackets for their name/namepath

    // Among `namepath-defining` and `namepath-referencing`, these do not seem
    //  to allow curly brackets in their doc signature or examples (`modifies`
    //  references namepaths within its type brackets)

    // Todo: Should support a `tutorialID` type (for `@tutorial` block and
    //  inline)

    return new Map([
        [
            'alias',
            new Map([
                // Signature seems to require a "namepath" (and no counter-examples)
                ['namepathRole', 'namepath-defining'],

                // "namepath"
                ['typeOrNameRequired', true],
            ] as [string, string | boolean][]),
        ],

        [
            'arg',
            new Map([
                ['namepathRole', 'namepath-defining'],

                // See `param`
                ['nameRequired', true],

                // Has no formal signature in the docs but shows curly brackets
                //   in the examples
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'argument',
            new Map([
                ['namepathRole', 'namepath-defining'],

                // See `param`
                ['nameRequired', true],

                // Has no formal signature in the docs but shows curly brackets
                //   in the examples
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'augments',
            new Map([
                // Signature seems to require a "namepath" (and no counter-examples)
                ['namepathRole', 'namepath-referencing'],

                // Does not show curly brackets in either the signature or examples
                ['typeAllowed', true],

                // "namepath"
                ['typeOrNameRequired', true],
            ] as [string, string | boolean][]),
        ],

        [
            'borrows',
            new Map([
                // `borrows` has a different format, however, so needs special parsing;
                //   seems to require both, and as "namepath"'s
                ['namepathRole', 'namepath-referencing'],

                // "namepath"
                ['typeOrNameRequired', true],
            ] as [string, string | boolean][]),
        ],

        [
            'callback',
            new Map([
                // Seems to require a "namepath" in the signature (with no
                //   counter-examples); TypeScript does not enforce but seems
                //   problematic as not attached so presumably not useable without it
                ['namepathRole', 'namepath-defining'],

                // "namepath"
                ['nameRequired', true],
            ] as [string, string | boolean][]),
        ],

        [
            'class',
            new Map([
                // Not in use, but should be this value if using to power `empty-tags`
                ['nameAllowed', true],

                // Allows for "name"'s in signature, but indicated as optional
                ['namepathRole', 'namepath-defining'],

                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'const',
            new Map([
                // Allows for "name"'s in signature, but indicated as optional
                ['namepathRole', 'namepath-defining'],

                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],
        [
            'constant',
            new Map([
                // Allows for "name"'s in signature, but indicated as optional
                ['namepathRole', 'namepath-defining'],

                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],
        [
            'constructor',
            new Map([
                // Allows for "name"'s in signature, but indicated as optional
                ['namepathRole', 'namepath-defining'],

                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'constructs',
            new Map([
                // Allows for "name"'s in signature, but indicated as optional
                ['namepathRole', 'namepath-defining'],

                ['nameRequired', false],

                ['typeAllowed', false],
            ] as [string, string | boolean][]),
        ],

        [
            'define',
            new Map([
                ['typeRequired', isClosure],
            ] as [string, string | boolean][]),
        ],

        [
            'emits',
            new Map([
                // Signature seems to require a "name" (of an event) and no counter-examples
                ['namepathRole', 'namepath-referencing'],

                ['nameRequired', true],

                ['typeAllowed', false],
            ] as [string, string | boolean][]),
        ],

        [
            'enum',
            new Map([
                ['namepathRole', 'name-defining'],
                // Has example showing curly brackets but not in doc signature
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'event',
            new Map([
                // Appears to require a "name" in its signature, albeit somewhat
                //  different from other "name"'s (including as described
                //  at https://jsdoc.app/about-namepaths.html )
                ['namepathRole', 'namepath-defining'],

                // The doc signature of `event` seems to require a "name"
                ['nameRequired', true],
            ] as [string, string | boolean][]),
        ],

        [
            'exception',
            new Map([
                // Shows curly brackets in the signature and in the examples
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        // Closure
        [
            'export',
            new Map([
                ['typeAllowed', isClosureOrPermissive],
            ] as [string, string | boolean][]),
        ],

        [
            'exports',
            new Map([
                ['namepathRole', 'namepath-defining'],

                ['nameRequired', isJsdoc],

                ['typeAllowed', isClosureOrPermissive],
            ] as [string, string | boolean][]),
        ],

        [
            'extends',
            new Map([
                // Signature seems to require a "namepath" (and no counter-examples)
                ['namepathRole', 'namepath-referencing'],

                ['nameRequired', isJsdoc],

                // Does not show curly brackets in either the signature or examples
                ['typeAllowed', isTypescriptOrClosure || isPermissive],

                // "namepath"
                [
                    'typeOrNameRequired',
                    isTypescriptOrClosure || isPermissive,
                ],
            ] as [string, string | boolean][]),
        ],

        [
            'external',
            new Map([
                // Appears to require a "name" in its signature, albeit somewhat
                //  different from other "name"'s (including as described
                //  at https://jsdoc.app/about-namepaths.html )
                ['namepathRole', 'namepath-defining'],

                // "name" (and a special syntax for the `external` name)
                ['nameRequired', true],

                ['typeAllowed', false],
            ] as [string, string | boolean][]),
        ],

        [
            'fires',
            new Map([
                // Signature seems to require a "name" (of an event) and no
                //  counter-examples
                ['namepathRole', 'namepath-referencing'],

                ['nameRequired', true],

                ['typeAllowed', false],
            ] as [string, string | boolean][]),
        ],

        [
            'func',
            new Map([
                // Allows for "name"'s in signature, but indicated as optional
                ['namepathRole', 'namepath-defining'],
            ] as [string, string | boolean][]),
        ],
        [
            'function',
            new Map([
                // Allows for "name"'s in signature, but indicated as optional
                ['namepathRole', 'namepath-defining'],

                ['nameRequired', false],

                ['typeAllowed', false],
            ] as [string, string | boolean][]),
        ],

        [
            'host',
            new Map([
                // Appears to require a "name" in its signature, albeit somewhat
                //  different from other "name"'s (including as described
                //  at https://jsdoc.app/about-namepaths.html )
                ['namepathRole', 'namepath-defining'],

                // See `external`
                ['nameRequired', true],

                ['typeAllowed', false],
            ] as [string, string | boolean][]),
        ],

        [
            'implements',
            new Map([
                // Shows curly brackets in the doc signature and examples
                // "typeExpression"
                ['typeRequired', true],
            ] as [string, string | boolean][]),
        ],

        [
            'interface',
            new Map([
                // Not in use, but should be this value if using to power `empty-tags`
                ['nameAllowed', isClosure],

                // Allows for "name" in signature, but indicates as optional
                [
                    'namepathRole',
                    isJsdocTypescriptOrPermissive
                        ? 'namepath-defining'
                        : false,
                ],

                ['typeAllowed', false],
            ] as [string, string | boolean][]),
        ],

        [
            'internal',
            new Map([
                // Not in use, but should be this value if using to power `empty-tags`
                ['nameAllowed', false],
                // https://www.typescriptlang.org/tsconfig/#stripInternal
                ['namepathRole', false],
            ] as [string, string | boolean][]),
        ],

        [
            'lends',
            new Map([
                // Signature seems to require a "namepath" (and no counter-examples)
                ['namepathRole', 'namepath-referencing'],

                // "namepath"
                ['typeOrNameRequired', true],
            ] as [string, string | boolean][]),
        ],

        [
            'link',
            new Map([
                // Signature seems to require a namepath OR URL and might be checked as such.
                ['namepathRole', 'namepath-or-url-referencing'],
            ] as [string, string | boolean][]),
        ],

        [
            'linkcode',
            new Map([
                // Synonym for "link"
                // Signature seems to require a namepath OR URL and might be checked as such.
                ['namepathRole', 'namepath-or-url-referencing'],
            ] as [string, string | boolean][]),
        ],

        [
            'linkplain',
            new Map([
                // Synonym for "link"
                // Signature seems to require a namepath OR URL and might be checked as such.
                ['namepathRole', 'namepath-or-url-referencing'],
            ] as [string, string | boolean][]),
        ],

        [
            'listens',
            new Map([
                // Signature seems to require a "name" (of an event) and no
                //  counter-examples
                ['namepathRole', 'namepath-referencing'],

                ['nameRequired', true],

                ['typeAllowed', false],
            ] as [string, string | boolean][]),
        ],

        [
            'member',
            new Map([
                // Allows for "name"'s in signature, but indicated as optional
                ['namepathRole', 'namepath-defining'],

                // Has example showing curly brackets but not in doc signature
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'memberof!',
            new Map([
                // Signature seems to require a "namepath" (and no counter-examples),
                //  though it allows an incomplete namepath ending with connecting symbol
                ['namepathRole', 'namepath-referencing'],

                // "namepath"
                ['typeOrNameRequired', true],
            ] as [string, string | boolean][]),
        ],
        [
            'memberof',
            new Map([
                // Signature seems to require a "namepath" (and no counter-examples),
                //  though it allows an incomplete namepath ending with connecting symbol
                ['namepathRole', 'namepath-referencing'],

                // "namepath"
                ['typeOrNameRequired', true],
            ] as [string, string | boolean][]),
        ],

        [
            'method',
            new Map([
                // Allows for "name"'s in signature, but indicated as optional
                ['namepathRole', 'namepath-defining'],
            ] as [string, string | boolean][]),
        ],
        [
            'mixes',
            new Map([
                // Signature seems to require a "OtherObjectPath" with no
                //   counter-examples
                ['namepathRole', 'namepath-referencing'],

                // "OtherObjectPath"
                ['typeOrNameRequired', true],
            ] as [string, string | boolean][]),
        ],

        [
            'mixin',
            new Map([
                // Allows for "name"'s in signature, but indicated as optional
                ['namepathRole', 'namepath-defining'],

                ['nameRequired', false],

                ['typeAllowed', false],
            ] as [string, string | boolean][]),
        ],

        [
            'modifies',
            new Map([
                // Has no documentation, but test example has curly brackets, and
                //  "name" would be suggested rather than "namepath" based on example;
                //  not sure if name is required
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'module',
            new Map([
                // Optional "name" and no curly brackets
                //  this block impacts `no-undefined-types` and `valid-types` (search for
                //  "isNameOrNamepathDefiningTag|tagMightHaveNameOrNamepath|tagMightHaveEitherTypeOrNamePosition")
                ['namepathRole', isJsdoc ? 'namepath-defining' : 'text'],

                // Shows the signature with curly brackets but not in the example
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'name',
            new Map([
                // Seems to require a "namepath" in the signature (with no
                //   counter-examples)
                ['namepathRole', 'namepath-defining'],

                // "namepath"
                ['nameRequired', true],

                // "namepath"
                ['typeOrNameRequired', true],
            ] as [string, string | boolean][]),
        ],

        [
            'namespace',
            new Map([
                // Allows for "name"'s in signature, but indicated as optional
                ['namepathRole', 'namepath-defining'],

                // Shows the signature with curly brackets but not in the example
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],
        [
            'package',
            new Map([
                // Shows the signature with curly brackets but not in the example
                // "typeExpression"
                ['typeAllowed', isClosureOrPermissive],
            ] as [string, string | boolean][]),
        ],

        [
            'param',
            new Map([
                ['namepathRole', 'namepath-defining'],

                // Though no signature provided requiring, per
                //  https://jsdoc.app/tags-param.html:
                // "The @param tag requires you to specify the name of the parameter you
                //  are documenting."
                ['nameRequired', true],

                // Has no formal signature in the docs but shows curly brackets
                //   in the examples
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'private',
            new Map([
                // Shows the signature with curly brackets but not in the example
                // "typeExpression"
                ['typeAllowed', isClosureOrPermissive],
            ] as [string, string | boolean][]),
        ],

        [
            'prop',
            new Map([
                ['namepathRole', 'namepath-defining'],

                // See `property`
                ['nameRequired', true],

                // Has no formal signature in the docs but shows curly brackets
                //   in the examples
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'property',
            new Map([
                ['namepathRole', 'namepath-defining'],

                // No docs indicate required, but since parallel to `param`, we treat as
                //   such:
                ['nameRequired', true],

                // Has no formal signature in the docs but shows curly brackets
                //   in the examples
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'protected',
            new Map([
                // Shows the signature with curly brackets but not in the example
                // "typeExpression"
                ['typeAllowed', isClosureOrPermissive],
            ] as [string, string | boolean][]),
        ],

        [
            'public',
            new Map([
                // Does not show a signature nor show curly brackets in the example
                ['typeAllowed', isClosureOrPermissive],
            ] as [string, string | boolean][]),
        ],

        [
            'requires',
            new Map([
                // <someModuleName>
                ['namepathRole', 'namepath-referencing'],

                ['nameRequired', true],

                ['typeAllowed', false],
            ] as [string, string | boolean][]),
        ],

        [
            'return',
            new Map([
                // Shows curly brackets in the signature and in the examples
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],
        [
            'returns',
            new Map([
                // Shows curly brackets in the signature and in the examples
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'satisfies',
            new Map([
                // Shows curly brackets in the doc signature and examples
                ['typeRequired', true],
            ] as [string, string | boolean][]),
        ],

        [
            'see',
            new Map([
                // Signature allows for "namepath" or text, so user must configure to
                //  'namepath-referencing' to enforce checks
                ['namepathRole', 'text'],
            ] as [string, string | boolean][]),
        ],

        [
            'static',
            new Map([
                // Does not show a signature nor show curly brackets in the example
                ['typeAllowed', isClosureOrPermissive],
            ] as [string, string | boolean][]),
        ],

        [
            'suppress',
            new Map([
                ['namepathRole', !isClosure],
                ['typeRequired', isClosure],
            ] as [string, string | boolean][]),
        ],

        [
            'template',
            new Map([
                ['namepathRole', isJsdoc ? 'text' : 'namepath-referencing'],

                ['nameRequired', !isJsdoc],

                // Though defines `namepathRole: 'namepath-defining'` in a sense, it is
                //   not parseable in the same way for template (e.g., allowing commas),
                //   so not adding
                ['typeAllowed', isTypescriptOrClosure || isPermissive],
            ] as [string, string | boolean][]),
        ],

        [
            'this',
            new Map([
                // Signature seems to require a "namepath" (and no counter-examples)
                // Not used with namepath in Closure/TypeScript, however
                ['namepathRole', isJsdoc ? 'namepath-referencing' : false],

                // namepath
                ['typeOrNameRequired', isJsdoc],

                ['typeRequired', isTypescriptOrClosure],
            ] as [string, string | boolean][]),
        ],

        [
            'throws',
            new Map([
                // Shows curly brackets in the signature and in the examples
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'tutorial',
            new Map([
                // (a tutorial ID)
                ['nameRequired', true],

                ['typeAllowed', false],
            ] as [string, string | boolean][]),
        ],

        [
            'type',
            new Map([
                // Shows curly brackets in the doc signature and examples
                // "typeName"
                ['typeRequired', true],
            ] as [string, string | boolean][]),
        ],

        [
            'typedef',
            new Map([
                // Seems to require a "namepath" in the signature (with no
                //  counter-examples)
                ['namepathRole', 'name-defining'],

                // TypeScript may allow it to be dropped if followed by @property or @member;
                //   also shown as missing in Closure
                // "namepath"
                ['nameRequired', isJsdocOrPermissive],

                // Is not `typeRequired` for TypeScript because it gives an error:
                // JSDoc '@typedef' tag should either have a type annotation or be followed by '@property' or
                // '@member' tags.

                // Has example showing curly brackets but not in doc signature
                ['typeAllowed', true],

                // TypeScript may allow it to be dropped if followed by @property or @member
                // "namepath"
                ['typeOrNameRequired', !isTypescript],
            ] as [string, string | boolean][]),
        ],

        [
            'var',
            new Map([
                // Allows for "name"'s in signature, but indicated as optional
                ['namepathRole', 'namepath-defining'],

                // Has example showing curly brackets but not in doc signature
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],

        [
            'yield',
            new Map([
                // Shows curly brackets in the signature and in the examples
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],
        [
            'yields',
            new Map([
                // Shows curly brackets in the signature and in the examples
                ['typeAllowed', true],
            ] as [string, string | boolean][]),
        ],
    ]);
};

export default getDefaultTagStructureForMode;
