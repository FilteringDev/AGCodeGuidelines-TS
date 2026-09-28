/**
 * @file Function, method, and constructor overloads.
 */

/**
 * Convert a value to its own type.
 * @param input Value to convert.
 * @returns The converted value.
 */
export function convert(input: string): string;

/**
 * Convert a value to its own type.
 * @param input Value to convert.
 * @returns The converted value.
 */
export function convert(input: number): number;

/**
 * Convert a value to its own type.
 * @param input Value to convert.
 * @returns The converted value.
 */
export function convert(input: string | number): string | number {
    return input;
}

export class Parser {
    private readonly prefix: string;

    public constructor(prefix: string);

    public constructor(prefix: number);

    public constructor(prefix: string | number) {
        this.prefix = String(prefix);
    }

    public parse(input: string): string;
    public parse(input: number): number;
    public parse(input: string | number): string | number {
        return typeof input === 'string' ? `${this.prefix}${input}` : input;
    }
}
