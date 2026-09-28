/**
 * @file Ambient declarations.
 */

declare global {
    interface Window {
        adguard: unknown;
    }
}

declare module 'untyped-package' {
    export function run(): void;

    export const VERSION: string;
}

export {};
