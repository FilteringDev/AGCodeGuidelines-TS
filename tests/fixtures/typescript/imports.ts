/**
 * @file Type-only and inline type imports and exports.
 */
import { type Shape } from './classes';
import { Square } from './square';
import type { Pair } from './types';

export type { Pair };

/**
 * Measure a shape.
 * @param shape Shape to measure.
 * @returns The shape area.
 */
export function measure(shape: Shape): number {
    return shape.area();
}

export const UNIT = new Square(1);
