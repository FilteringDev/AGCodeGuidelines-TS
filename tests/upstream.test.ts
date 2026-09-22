/**
 * @file Attributed upstream behavior regressions executed by Oxlint's RuleTester.
 */
import { readFileSync } from 'node:fs';
import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import { getRule, testCase } from './harness';

import type { Fixture } from './harness';

RuleTester.describe = describe;
RuleTester.it = it;

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/upstream.json', import.meta.url), 'utf8')) as Fixture[];

for (const group of Object.values(Object.groupBy(fixtures, (fixture) => fixture.sourceRule))) {
    const first = group?.[0];
    if (!first) {
        continue;
    }
    const valid = group.filter((fixture) => fixture.errors.length === 0).map(testCase);
    const invalid = group.filter((fixture) => fixture.errors.length > 0).map(testCase) as RuleTester.InvalidTestCase[];
    const tester = new RuleTester({ eslintCompat: true });
    tester.run(first.sourceRule, getRule(first), { valid, invalid });
    group.length = 0;
}
