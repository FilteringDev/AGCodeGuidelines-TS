/**
 * @file Typed, versioned source of truth for the AdGuard rule policy.
 */
import snapshot from './catalog.json' with { type: 'json' };

export type RuleSetting = string | number | readonly unknown[];
export type RuleMap = Record<string, RuleSetting>;
export type Enforcement = 'native' | 'javascript' | 'custom' | 'compiler' | 'manual' | 'overridden';

export interface Clause {
    id: string;
    number: string;
    text: string;
    line: number;
    rules: string[];
    enforcement: Enforcement;
    reason: string;
}

export interface Mapping {
    source: string;
    target: string | null;
    setting: RuleSetting;
    implementation: 'native' | 'javascript' | 'custom' | 'disabled';
    origin: string;
}

export interface Catalog {
    sources: Record<string, string>;
    baseline: RuleMap;
    settings: Record<string, unknown>;
    env: Record<string, boolean>;
    mappings: Mapping[];
    clauses: Clause[];
    rules: RuleMap;
}

export const catalog = snapshot as Catalog;

/**
 * Resolve a rule's configured severity without discarding disabled settings.
 * @param setting - Rule setting from a source configuration.
 * @returns Normalized severity.
 */
export function severity(setting: RuleSetting): 0 | 1 | 2 {
    const value = Array.isArray(setting) ? setting[0] : setting;
    if (value === 'error' || value === 2) {
        return 2;
    }
    if (value === 'warn' || value === 1) {
        return 1;
    }
    return 0;
}
