/**
 * @file Generic, tuple, mapped, and conditional types with runtime helpers.
 */

export type Pair = [
    string,
    number,
];

export type Mapped<Value> = { [Key in keyof Value]?: Value[Key] };

export type Conditional<Value> = Value extends string ? 'text' : 'other';

export interface Dictionary {
    readonly name: string;
    [key: string]: unknown;
}

export const THEME = { mode: 'light' } as const satisfies Record<string, string>;

/**
 * Read the first value of a list.
 * @param values Values to read.
 * @returns The first value, if any.
 */
export function first<Value extends object = object>(values: Value[]): Value | undefined {
    return values[0];
}

/**
 * Check whether a value is text.
 * @param value Value to check.
 * @returns Whether the value is text.
 */
export function isText(value: unknown): value is string {
    return typeof value === 'string';
}

/**
 * Assert that a value is text.
 * @param value Value to check.
 * @throws {TypeError} When the value is not text.
 */
export function assertText(value: unknown): asserts value is string {
    if (!isText(value)) {
        throw new TypeError('Not text');
    }
}

/**
 * Greet a user.
 * @param greeting Greeting to use.
 * @param name Optional user name.
 * @returns The greeting.
 */
export function greet(greeting = 'hi', name?: string): string {
    return `${greeting} ${name ?? ''}`;
}

/**
 * Describe the event target.
 * @param this Window that receives the event.
 * @param event Handled event.
 * @returns The event type.
 */
export function describe(this: Window, event: Event): string {
    return `${this.name}:${event.type}`;
}

/**
 * Pick an element that must exist.
 * @returns The element.
 */
export function root(): Element {
    return document.querySelector('main')!;
}

export const EMPTY = new Array<string>();
