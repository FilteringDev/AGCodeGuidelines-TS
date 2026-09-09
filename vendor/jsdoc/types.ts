/** @file Configuration contracts at the validated JSDoc rule boundary. */
import type { Rule as ESLintRule } from 'eslint';
import type { Settings } from './src/iterateJsdoc';

export type Context = Omit<ESLintRule.RuleContext, 'options' | 'settings'> & {
    options: readonly unknown[];
    settings: { jsdoc?: Partial<Settings>; [name: string]: unknown };
};
export type Rule = Omit<ESLintRule.RuleModule, 'create'> & {
    create(context: Context): ESLintRule.RuleListener;
};
export interface SharedOptions {
    contexts?: import('./src/iterateJsdoc').Context[];
    match?: import('./src/iterateJsdoc').Context[];
    exemptedBy?: string[];
    tags?: string[];
    [name: string]: unknown;
}
