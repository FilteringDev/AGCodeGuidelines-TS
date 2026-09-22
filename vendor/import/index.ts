import rule0 from './src/rules/no-unresolved';
import rule1 from './src/rules/named';
import rule2 from './src/rules/export';
import rule3 from './src/rules/no-named-as-default';
import rule4 from './src/rules/no-named-as-default-member';
import rule5 from './src/rules/no-extraneous-dependencies';
import rule6 from './src/rules/no-mutable-exports';
import rule7 from './src/rules/no-amd';
import rule8 from './src/rules/first';
import rule9 from './src/rules/no-duplicates';
import rule10 from './src/rules/extensions';
import rule11 from './src/rules/order';
import rule12 from './src/rules/newline-after-import';
import rule13 from './src/rules/prefer-default-export';
import rule14 from './src/rules/no-absolute-path';
import rule15 from './src/rules/no-dynamic-require';
import rule16 from './src/rules/no-webpack-loader-syntax';
import rule17 from './src/rules/no-named-default';
import rule18 from './src/rules/no-self-import';
import rule19 from './src/rules/no-cycle';
import rule20 from './src/rules/no-useless-path-segments';
import rule21 from './src/rules/no-import-module-exports';
import rule22 from './src/rules/no-relative-packages';
import rule23 from './src/rules/no-unassigned-import';

export default {
    meta: { name: 'ag-import' },
    rules: {
        'no-unresolved': rule0,
        named: rule1,
        export: rule2,
        'no-named-as-default': rule3,
        'no-named-as-default-member': rule4,
        'no-extraneous-dependencies': rule5,
        'no-mutable-exports': rule6,
        'no-amd': rule7,
        first: rule8,
        'no-duplicates': rule9,
        extensions: rule10,
        order: rule11,
        'newline-after-import': rule12,
        'prefer-default-export': rule13,
        'no-absolute-path': rule14,
        'no-dynamic-require': rule15,
        'no-webpack-loader-syntax': rule16,
        'no-named-default': rule17,
        'no-self-import': rule18,
        'no-cycle': rule19,
        'no-useless-path-segments': rule20,
        'no-import-module-exports': rule21,
        'no-relative-packages': rule22,
        'no-unassigned-import': rule23,
    },
};
