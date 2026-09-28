/**
 * @file A class merged with a namespace.
 */

export class Box {
    public readonly width: number = Box.DEFAULT_WIDTH;
}

export namespace Box {
    export const DEFAULT_WIDTH = 1;
}
