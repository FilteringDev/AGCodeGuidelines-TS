/**
 * @file Declaration merges that TypeScript permits.
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

export type Mode = 'light' | 'dark';

export const Mode = {
    Light: 'light',
    Dark: 'dark',
} as const;
