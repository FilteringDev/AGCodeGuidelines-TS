/**
 * @file Prevent usage of setState in componentDidMount
 * @author Yannick Croissant
 */
import dependency0 from '../util/makeNoMethodSetStateRule';
import type { LegacyRule } from '../../types';

const makeNoMethodSetStateRule = dependency0;

const rule: LegacyRule<['disallow-in-func'?]> = makeNoMethodSetStateRule('componentDidMount');

export default rule;
