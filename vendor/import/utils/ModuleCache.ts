import debug from 'debug';
import type { CacheSettings, ImportSettings } from '../types';

const log = debug('eslint-module-utils:ModuleCache');

interface CacheEntry<Value> {
    result: Value;
    lastSeen: [number, number];
}
class ModuleCache<Value = unknown, Key = string> {
    map: Map<Key, CacheEntry<Value>>;

    /**
     * @param map The map value.
     */
    constructor(map?: Map<Key, CacheEntry<Value>>) {
        this.map = map || new Map();
    }

    set(cacheKey: Key, result: Value) {
        this.map.set(cacheKey, { result, lastSeen: process.hrtime() });
        log('setting entry for', cacheKey);
        return result;
    }

    get(cacheKey: Key, settings: CacheSettings) {
        if (this.map.has(cacheKey)) {
            const f = this.map.get(cacheKey);
            // check freshness

            if (process.hrtime(f!.lastSeen)[0] < settings.lifetime) {
                return f!.result;
            }
        } else {
            log('cache miss for', cacheKey);
        }
        // cache miss
        return undefined;
    }

    static getSettings(settings: ImportSettings) {
        const cacheSettings: { lifetime: number | string } = {
            lifetime: 30, // seconds

            ...settings['import/cache'],
        };

        // parse infinity

        if (cacheSettings.lifetime === '∞' || cacheSettings.lifetime === 'Infinity') {
            cacheSettings.lifetime = Infinity;
        }

        return cacheSettings as CacheSettings;
    }
}

export default ModuleCache;
