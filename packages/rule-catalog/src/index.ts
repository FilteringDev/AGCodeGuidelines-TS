/**
 * @file Typed, versioned source of truth for the AdGuard rule policy.
 */
import snapshot from './catalog.json' with { type: 'json' };

export type RuleSetting = string | number | readonly unknown[];
export type RuleMap = Record<string, RuleSetting>;
export type Enforcement = 'native' | 'javascript' | 'custom' | 'compiler' | 'partial' | 'manual' | 'overridden';
export type Policy = 'compatibility' | 'guideline';
export type Profile = 'guide' | 'adguard-projects';
export type ImportGroups = 'example' | 'prose';
export type Implementation = 'native' | 'javascript' | 'custom' | 'disabled';

/** How one policy enforces a guideline clause. */
export interface Disposition {
    rules: string[];
    enforcement: Enforcement;
    reason: string;
}

/** A numbered guideline clause; top-level fields describe the compatibility policy. */
export interface Clause extends Disposition {
    id: string;
    number: string;
    text: string;
    line: number;
    guideline: Disposition;
}

/** The TypeScript-aware implementation used for a rule in TypeScript files. */
export interface TypeScriptEquivalent {
    target: string | null;
    setting: RuleSetting;
    implementation: Implementation;
    reason: string;
}

export interface Mapping {
    source: string;
    target: string | null;
    setting: RuleSetting;
    implementation: Implementation;
    origin: string;
    /** Absent for the base preset. */
    scope?: 'guideline' | 'adguard-projects';
    /** Rules that only apply to TypeScript files. */
    language?: 'typescript';
    requiresTypeInfo?: boolean;
    typescript?: TypeScriptEquivalent;
}

/** Rules and settings layered over the base preset. */
export interface Overlay {
    rules: RuleMap;
    typescriptRules: RuleMap;
    settings: Record<string, unknown>;
}

export interface Catalog {
    sources: Record<string, string>;
    baseline: RuleMap;
    settings: Record<string, unknown>;
    env: Record<string, boolean>;
    mappings: Mapping[];
    clauses: Clause[];
    rules: RuleMap;
    typescriptRules: RuleMap;
    policies: { guideline: Overlay & { importGroups: Record<ImportGroups, RuleSetting> } };
    profiles: { 'adguard-projects': Overlay };
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
