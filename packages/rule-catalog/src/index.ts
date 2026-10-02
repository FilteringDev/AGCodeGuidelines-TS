/**
 * @file Typed, versioned source of truth for the AdGuard rule policy.
 */
import Ajv from 'ajv';
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
    compatibility: Record<string, CompatibilityRule>;
}

export interface CompatibilityRule {
    canonicalSource: string;
    target: string;
    implementation: Implementation;
    requiresTypeInfo: boolean;
    language?: 'typescript';
    schema: object;
    origin: string;
}

export const catalog = snapshot as Catalog;

export interface RuleResolutionOptions {
    language?: 'javascript' | 'typescript';
    policy?: Policy;
    profile?: Profile;
    setting?: RuleSetting;
}

export type RuleResolution = {
    status: 'resolved' | 'disabled' | 'compiler';
    source: string;
    canonicalSource: string;
    target: string | null;
    setting: RuleSetting;
    implementation: Implementation;
    requiresTypeInfo: boolean;
    provider: string | null;
    reason?: string;
} | {
    status: 'unsupported';
    source: string;
    reason: string;
};

const VALIDATOR = new Ajv({ allErrors: true, strictKeywords: false, validateSchema: false });

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

/**
 * Resolve a source identifier without activating a rule in any preset.
 * @param source - Rule identifier from a legacy configuration.
 * @param options - Language and policy layers used to select an implementation.
 * @returns An independent mapping or an explicit unsupported result.
 */
export function resolveRule(source: string, options: RuleResolutionOptions = {}): RuleResolution {
    const {
        language = source.startsWith('@typescript-eslint/') ? 'typescript' : 'javascript',
        policy = 'compatibility',
        profile = 'guide',
    } = options;
    const compatibility = Object.hasOwn(catalog.compatibility ?? {}, source)
        ? catalog.compatibility[source] : undefined;
    const canonicalSource = compatibility?.canonicalSource ?? source;
    const candidates = catalog.mappings.filter((mapping) => mapping.source === canonicalSource);
    const selected = candidates.filter((mapping) => (
        (!mapping.language || mapping.language === language)
        && (!mapping.scope || mapping.scope === policy || mapping.scope === profile)
    )).at(-1) ?? candidates.at(-1);
    if (!selected && !compatibility) {
        return { status: 'unsupported', source, reason: `No implementation for rule ${source}.` };
    }
    if ((compatibility?.language ?? selected?.language) === 'typescript' && language !== 'typescript') {
        return { status: 'unsupported', source, reason: `${source} requires TypeScript source files.` };
    }
    const equivalent = !compatibility && language === 'typescript' ? selected?.typescript : undefined;
    const target = compatibility?.target ?? (equivalent ? equivalent.target : selected!.target);
    const setting = options.setting ?? (equivalent ? equivalent.setting : selected?.setting) ?? 'error';
    const level = Array.isArray(setting) ? setting[0] : setting;
    if (![0, 1, 2, 'off', 'warn', 'error'].includes(level)) {
        return { status: 'unsupported', source, reason: `Invalid severity for ${source}.` };
    }
    if ((options.setting !== undefined || compatibility) && severity(setting) > 0) {
        const schema = compatibility?.schema;
        if (!schema) {
            return { status: 'unsupported', source, reason: `Custom options for ${source} are not verified.` };
        }
        const validate = VALIDATOR.compile(schema);
        if (!validate(Array.isArray(setting) ? setting.slice(1) : [])) {
            return { status: 'unsupported', source, reason: `Unsupported options for ${source}: ${VALIDATOR.errorsText(validate.errors)}.` };
        }
        if (compatibility?.target === 'ag-ts/naming-convention' && Array.isArray(setting)) {
            const selectors = setting.slice(1).map((option: { selector: string }) => option.selector);
            if (new Set(selectors).size !== selectors.length) {
                return { status: 'unsupported', source, reason: 'Repeated naming selectors are not supported.' };
            }
        }
    }
    return {
        status: equivalent?.target === null && severity(selected!.setting) > 0 && options.setting === undefined
            ? 'compiler' : severity(setting) === 0 ? 'disabled' : 'resolved',
        source,
        canonicalSource,
        target,
        setting: structuredClone(setting),
        implementation: severity(setting) === 0 ? 'disabled'
            : compatibility?.implementation ?? (equivalent ? equivalent.implementation : selected!.implementation),
        requiresTypeInfo: compatibility?.requiresTypeInfo ?? selected?.requiresTypeInfo ?? false,
        provider: target?.split('/')[0] ?? null,
        ...(equivalent ? { reason: equivalent.reason } : {}),
    };
}
