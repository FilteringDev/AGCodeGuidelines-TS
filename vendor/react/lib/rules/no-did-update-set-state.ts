/**
 * @file Prevent usage of setState in componentDidUpdate
 * @author Yannick Croissant
 */
import dependency0 from '../util/makeNoMethodSetStateRule';
import type { LegacyRule } from '../../types';

const makeNoMethodSetStateRule = dependency0;

const rule: LegacyRule<['disallow-in-func'?]> = makeNoMethodSetStateRule('componentDidUpdate');

export default rule;
