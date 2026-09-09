/**
 * @file Prevent usage of setState in componentWillUpdate
 * @author Yannick Croissant
 */
import dependency0 from '../util/makeNoMethodSetStateRule';
import dependency1 from '../util/version';
import type { LegacyRule } from '../../types';

const makeNoMethodSetStateRule = dependency0;
const { testReactVersion } = dependency1;

const rule: LegacyRule<['disallow-in-func'?]> = makeNoMethodSetStateRule(
    'componentWillUpdate',
    (context) => testReactVersion(context, '>= 16.3.0'),
);

export default rule;
