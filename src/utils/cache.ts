interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();

  /**
   * Retrieves a value from the cache if it exists and has not expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Stores a value in the cache with a specified TTL in seconds.
   */
  set<T>(key: string, value: T, ttlSeconds: number): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Checks if a non-expired key exists in the cache.
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Removes a specific key from the cache.
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clears all entries from the cache.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Returns the current count of unexpired entries.
   */
  get size(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now <= entry.expiresAt) {
        count++;
      } else {
        this.store.delete(key);
      }
    }
    return count;
  }
}

// Global singleton cache instance for application-wide reuse
export const globalCache = new MemoryCache();
