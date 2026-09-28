/**
 * @file Declaration merges that `@typescript-eslint/no-redeclare` accepts.
 */

interface Size {
    width: number;
}

interface Size {
    height: number;
}

export interface Widget {
    size: Size;
}

export class Widget {
    public readonly name: string = 'widget';
}

/**
 * Build a size.
 * @returns The default size.
 */
export function build(): number {
    return build.SIZE;
}

export namespace build {
    export const SIZE = 2;
}

export enum Direction {
    Up = 'Up',
    Down = 'Down',
}

export namespace Direction {
    export const DEFAULT = Direction.Up;
}
