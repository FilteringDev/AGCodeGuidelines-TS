/**
 * @file Abstract classes, parameter properties, and typed members.
 */

export abstract class Shape {
    protected constructor(protected readonly name: string) {}

    public abstract area(): number;

    public describe(): string {
        return `${this.name}: ${this.area()}`;
    }
}

export const SHAPE_KINDS = ['square'] as const;
