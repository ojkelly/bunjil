import * as NodeCache from "node-cache";

/**
 * This class standardises the cache implementation
 * in Bunjil, and implements a simple in memory cache.
 */
class Cache {
    private cache: any;

    constructor(maxTTL: number = 86000, checkperiod: number = 5) {
        this.cache = new NodeCache({
            stdTTL: maxTTL,
            errorOnMissing: false,
            checkperiod,
            useClones: true,
        });
    }

    public set(key: string, value: any, ttl: number): any {
        return this.cache.set(key, value, ttl);
    }

    // If return is undefined, cache missed
    public get(key: string): any | undefined {
        return this.cache.get(key);
    }
}

export { Cache };
