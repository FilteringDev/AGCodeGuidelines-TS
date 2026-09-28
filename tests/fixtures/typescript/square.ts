/**
 * @file A concrete shape.
 */
import { Shape } from './classes';

export class Square extends Shape {
    public constructor(private readonly side: number) {
        super('square');
    }

    public area(): number {
        return this.side ** 2;
    }
}

export const SQUARE_SIDES = 4;
