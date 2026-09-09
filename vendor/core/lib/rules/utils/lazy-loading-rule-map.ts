/**
 * @file Read-only registry retaining the lazy lookup contract of ESLint's rule map.
 * @author Toru Nagashima
 */
import createDebug from 'debug';
import type { LegacyRule } from '../../../../types';

const debug = createDebug('eslint:rules');
type RuleLoader = () => LegacyRule;

/** Load rules on access while preventing callers from changing the registry. */
class LazyLoadingRuleMap implements ReadonlyMap<string, LegacyRule> {
    declare private readonly loaders: Map<string, RuleLoader>;

    declare readonly size: number;

    /**
     * Initialize the registry in the upstream rule order.
     * @param entries - Names and deferred rule lookups.
     */
    constructor(entries: readonly (readonly [string, RuleLoader])[]) {
        let remaining = entries.length;
        this.loaders = new Map(
            entries.map(([name, load]) => {
                let cached: LegacyRule | undefined;
                return [
                    name,
                    debug.enabled
                        ? () => {
                            if (!cached) {
                                remaining -= 1;
                                debug('Loading rule %o (remaining=%d)', name, remaining);
                                cached = load();
                            }
                            return cached;
                        }
                        : load,
                ];
            }),
        );
        this.size = this.loaders.size;
    }

    /**
     * Load a rule by name.
     * @param name - Upstream rule identifier.
     * @returns The rule, or undefined when no such rule exists.
     */
    get(name: string): LegacyRule | undefined {
        return this.loaders.get(name)?.();
    }

    /**
     * Check a name without loading its implementation.
     * @param name - Upstream rule identifier.
     * @returns Whether the registry contains the rule.
     */
    has(name: string): boolean {
        return this.loaders.has(name);
    }

    /**
     * Iterate the names in registration order.
     * @returns An iterator over rule identifiers.
     */
    keys(): MapIterator<string> {
        return this.loaders.keys();
    }

    /**
     * Load each rule as the iterator advances.
     * @yields An iterator over rule implementations.
     */
    * values(): MapIterator<LegacyRule> {
        const loaders = Array.from(this.loaders.values());
        for (let index = 0; index < loaders.length; index += 1) {
            yield loaders[index]!();
        }
    }

    /**
     * Load each rule as its named entry is requested.
     * @yields An iterator over rule names and implementations.
     */
    * entries(): MapIterator<[string, LegacyRule]> {
        const entries = Array.from(this.loaders);
        for (let index = 0; index < entries.length; index += 1) {
            const [name, load] = entries[index]!;
            yield [name, load()];
        }
    }

    /**
     * Visit each rule with the callback's requested receiver.
     * @param callback - Function called for every registry entry.
     * @param receiver - Optional callback receiver.
     */
    forEach(
        callback: (
            value: LegacyRule,
            key: string,
            map: ReadonlyMap<string, LegacyRule>,
        ) => void,
        receiver?: unknown,
    ): void {
        this.loaders.forEach((load, name) => callback.call(receiver, load(), name, this));
    }

    /**
     * Iterate the named rules.
     * @returns An iterator over rule names and implementations.
     */
    [Symbol.iterator](): MapIterator<[string, LegacyRule]> {
        return this.entries();
    }
}

export default { LazyLoadingRuleMap };
