/** @file Verify runtime behavior at TypeScript source-port boundaries. */
import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import compat from '../packages/oxlint-plugin/src/compat';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { env: { builtin: true, es2026: true } } });
tester.run('do-while segment initialization', compat.rules['no-useless-return']!, {
    valid: [
        'function run() { do { step(); } while (again); }',
        'function run() { do {} while (again); }',
    ],
    invalid: [{
        code: 'function run() { do { step(); } while (again); return; }',
        errors: [{ messageId: 'unnecessaryReturn' }],
        output: 'function run() { do { step(); } while (again);  }',
    }],
});
