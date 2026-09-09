import {
  buildForbidRuleDefinition,
} from './src/buildForbidRuleDefinition.js';
import {
  buildRejectOrPreferRuleDefinition,
} from './src/buildRejectOrPreferRuleDefinition.js';
import checkAccess from './src/rules/checkAccess.js';
import checkAlignment from './src/rules/checkAlignment.js';
import checkParamNames from './src/rules/checkParamNames.js';
import checkPropertyNames from './src/rules/checkPropertyNames.js';
import checkTagNames from './src/rules/checkTagNames.js';
import checkTypes from './src/rules/checkTypes.js';
import checkValues from './src/rules/checkValues.js';
import emptyTags from './src/rules/emptyTags.js';
import escapeInlineTags from './src/rules/escapeInlineTags.js';
import implementsOnClasses from './src/rules/implementsOnClasses.js';
import multilineBlocks from './src/rules/multilineBlocks.js';
import noDefaults from './src/rules/noDefaults.js';
import noMultiAsterisks from './src/rules/noMultiAsterisks.js';
import noTypes from './src/rules/noTypes.js';
import noUndefinedTypes from './src/rules/noUndefinedTypes.js';
import requireFileOverview from './src/rules/requireFileOverview.js';
import requireJsdoc from './src/rules/requireJsdoc.js';
import requireParam from './src/rules/requireParam.js';
import requireParamDescription from './src/rules/requireParamDescription.js';
import requireParamName from './src/rules/requireParamName.js';
import requireParamType from './src/rules/requireParamType.js';
import requireProperty from './src/rules/requireProperty.js';
import requirePropertyDescription from './src/rules/requirePropertyDescription.js';
import requirePropertyName from './src/rules/requirePropertyName.js';
import requirePropertyType from './src/rules/requirePropertyType.js';
import requireReturns from './src/rules/requireReturns.js';
import requireReturnsCheck from './src/rules/requireReturnsCheck.js';
import requireReturnsDescription from './src/rules/requireReturnsDescription.js';
import requireReturnsType from './src/rules/requireReturnsType.js';
import requireYields from './src/rules/requireYields.js';
import requireYieldsCheck from './src/rules/requireYieldsCheck.js';
import tagLines from './src/rules/tagLines.js';
import tsNoEmptyObjectType from './src/rules/tsNoEmptyObjectType.js';
import validTypes from './src/rules/validTypes.js';
export default { meta: {name: 'ag-jsdoc'}, configs: {recommended: {"plugins":["jsdoc"],"rules":{"jsdoc/check-access":"warn","jsdoc/check-alignment":"warn","jsdoc/check-examples":"off","jsdoc/check-indentation":"off","jsdoc/check-line-alignment":"off","jsdoc/check-param-names":"warn","jsdoc/check-property-names":"warn","jsdoc/check-syntax":"off","jsdoc/check-tag-names":"warn","jsdoc/check-template-names":"off","jsdoc/check-types":"warn","jsdoc/check-values":"warn","jsdoc/convert-to-jsdoc-comments":"off","jsdoc/empty-tags":"warn","jsdoc/escape-inline-tags":"warn","jsdoc/implements-on-classes":"warn","jsdoc/imports-as-dependencies":"off","jsdoc/informative-docs":"off","jsdoc/lines-before-block":"off","jsdoc/match-description":"off","jsdoc/match-name":"off","jsdoc/multiline-blocks":"warn","jsdoc/no-bad-blocks":"off","jsdoc/no-blank-block-descriptions":"off","jsdoc/no-blank-blocks":"off","jsdoc/no-defaults":"warn","jsdoc/no-missing-syntax":"off","jsdoc/no-multi-asterisks":"warn","jsdoc/no-restricted-syntax":"off","jsdoc/no-types":"off","jsdoc/no-undefined-types":"warn","jsdoc/no-unnecessary-type-assertion":"off","jsdoc/normalize-see-links":"off","jsdoc/prefer-import-tag":"off","jsdoc/reject-any-type":"warn","jsdoc/reject-function-type":"warn","jsdoc/require-asterisk-prefix":"off","jsdoc/require-description":"off","jsdoc/require-description-complete-sentence":"off","jsdoc/require-example":"off","jsdoc/require-file-overview":"off","jsdoc/require-hyphen-before-param-description":"off","jsdoc/require-jsdoc":"warn","jsdoc/require-next-description":"off","jsdoc/require-next-type":"warn","jsdoc/require-param":"warn","jsdoc/require-param-description":"warn","jsdoc/require-param-name":"warn","jsdoc/require-param-type":"warn","jsdoc/require-property":"warn","jsdoc/require-property-description":"warn","jsdoc/require-property-name":"warn","jsdoc/require-property-type":"warn","jsdoc/require-rejects":"off","jsdoc/require-returns":"warn","jsdoc/require-returns-check":"warn","jsdoc/require-returns-description":"warn","jsdoc/require-returns-type":"warn","jsdoc/require-tags":"off","jsdoc/require-template":"off","jsdoc/require-template-description":"off","jsdoc/require-throws":"off","jsdoc/require-throws-description":"off","jsdoc/require-throws-type":"warn","jsdoc/require-yields":"warn","jsdoc/require-yields-check":"warn","jsdoc/require-yields-description":"off","jsdoc/require-yields-type":"warn","jsdoc/sort-tags":"off","jsdoc/tag-lines":"warn","jsdoc/text-escaping":"off","jsdoc/ts-method-signature-style":"off","jsdoc/ts-no-empty-object-type":"warn","jsdoc/ts-no-unnecessary-template-expression":"off","jsdoc/ts-prefer-function-type":"off","jsdoc/type-formatting":"off","jsdoc/valid-types":"warn"}}}, rules: {'check-access': checkAccess,
'check-alignment': checkAlignment,
'check-param-names': checkParamNames,
'check-property-names': checkPropertyNames,
'check-tag-names': checkTagNames,
'check-types': checkTypes,
'check-values': checkValues,
'empty-tags': emptyTags,
'escape-inline-tags': escapeInlineTags,
'implements-on-classes': implementsOnClasses,
'multiline-blocks': multilineBlocks,
'no-defaults': noDefaults,
'no-multi-asterisks': noMultiAsterisks,
'no-types': noTypes,
'no-undefined-types': noUndefinedTypes,
'reject-any-type': buildRejectOrPreferRuleDefinition({
    description: 'Reports use of `any` or `*` type',
    overrideSettings: {
      '*': {
        message: 'Prefer a more specific type to `*`',
        replacement: false,
        unifyParentAndChildTypeChecks: true,
      },
      any: {
        message: 'Prefer a more specific type to `any`',
        replacement: false,
        unifyParentAndChildTypeChecks: true,
      },
    },
    url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/reject-any-type.md#repos-sticky-header',
  }),
'reject-function-type': buildRejectOrPreferRuleDefinition({
    description: 'Reports use of `Function` type',
    overrideSettings: {
      Function: {
        message: 'Prefer a more specific type to `Function`',
        replacement: false,
        unifyParentAndChildTypeChecks: true,
      },
    },
    url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/reject-function-type.md#repos-sticky-header',
  }),
'require-file-overview': requireFileOverview,
'require-jsdoc': requireJsdoc,
'require-next-type': buildForbidRuleDefinition({
    contexts: [
      {
        comment: 'JsdocBlock:has(JsdocTag[tag=next]:not([parsedType.type]))',
        context: 'any',
        message: '@next should have a type',
      },
    ],
    description: 'Requires a type for `@next` tags',
    url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/require-next-type.md#repos-sticky-header',
  }),
'require-param': requireParam,
'require-param-description': requireParamDescription,
'require-param-name': requireParamName,
'require-param-type': requireParamType,
'require-property': requireProperty,
'require-property-description': requirePropertyDescription,
'require-property-name': requirePropertyName,
'require-property-type': requirePropertyType,
'require-returns': requireReturns,
'require-returns-check': requireReturnsCheck,
'require-returns-description': requireReturnsDescription,
'require-returns-type': requireReturnsType,
'require-throws-type': buildForbidRuleDefinition({
    contexts: [
      {
        comment: 'JsdocBlock:has(JsdocTag[tag=/^(?:throws|exception)$/]:not([parsedType.type]))',
        context: 'any',
        message: '@throws should have a type',
      },
    ],
    description: 'Requires a type for `@throws` tags',
    url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/require-throws-type.md#repos-sticky-header',
  }),
'require-yields': requireYields,
'require-yields-check': requireYieldsCheck,
'require-yields-type': buildForbidRuleDefinition({
    contexts: [
      {
        comment: 'JsdocBlock:has(JsdocTag[tag=/^yields?$/]:not([parsedType.type]))',
        context: 'any',
        message: '@yields should have a type',
      },
    ],
    description: 'Requires a type for `@yields` tags',
    url: 'https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/require-yields-type.md#repos-sticky-header',
  }),
'tag-lines': tagLines,
'ts-no-empty-object-type': tsNoEmptyObjectType,
'valid-types': validTypes} };
