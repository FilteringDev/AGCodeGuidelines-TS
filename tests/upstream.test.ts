/**
 * @file Attributed upstream behavior regressions executed by Oxlint's RuleTester.
 */
import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import fixtures from './fixtures/upstream.json' with { type: 'json' };
import { getRule, testCase } from './harness';

import type { Fixture } from './harness';

RuleTester.describe = describe;
RuleTester.it = it;

Object.values(Object.groupBy(fixtures as Fixture[], (fixture) => fixture.sourceRule)).forEach((group) => {
    const first = group?.[0];
    if (!first) {
        return;
    }
    const tester = new RuleTester({ eslintCompat: true });
    tester.run(first.sourceRule, getRule(first), {
        valid: group.filter((fixture) => fixture.errors.length === 0).map(testCase),
        invalid: group.filter((fixture) => fixture.errors.length > 0).map(testCase) as RuleTester.InvalidTestCase[],
    });
});
