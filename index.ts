/**
 * Represents an entry stored in the cache, including its value and expiry time.
 * @internal
 */
interface CacheEntry<Value> {
  value: Value;
  expiresAt: number | null; // Timestamp for expiry, or null if no TTL
}

/**
 * A Least Recently Used (LRU) Cache implementation
 * @template Key - The type of keys (must be a valid property key)
 * @template Value - The type of values stored (defaults to unknown)
 */
class LruCache<Key extends PropertyKey, Value = unknown> {
  /** Maximum number of items the cache can hold */
  private readonly capacity: number;
  /** Internal cache storage using Map to preserve insertion order */
  private readonly cache: Map<Key, CacheEntry<Value>>;
  /** Event emitter for cache events */
  private readonly events: LruCacheEvents<Key, Value>;
  /** Default TTL for cache items in milliseconds */
  private readonly defaultTtl: number | null;
  /** Cache statistics */
  #hits: number;
  #misses: number;
  #evictions: number;
  /** Whether to track statistics */
  readonly #trackStats: boolean;

  /**
   * Creates a new LRU Cache
   * @param capacity - Maximum number of items the cache can hold
   * @param options - Optional configuration options
   * @throws {Error} If capacity is invalid
   */
  constructor(capacity: number, options?: LruCacheOptions<Key, Value>) {
      if (!Number.isInteger(capacity) || capacity <= 0) {
          throw new Error('Capacity must be a positive integer');
      }
      if (options?.ttl !== undefined && options.ttl !== null && (!Number.isInteger(options.ttl) || options.ttl <= 0)) {
          throw new Error('TTL must be a positive integer if specified');
      }
      
      this.capacity = capacity;
      this.cache = new Map<Key, CacheEntry<Value>>();
      this.events = new LruCacheEvents<Key, Value>(options?.onEvict);
      this.defaultTtl = options?.ttl ?? null;
      this.#hits = 0;
      this.#misses = 0;
      this.#evictions = 0;
      this.#trackStats = options?.trackStats ?? false;
  }

  /**
   * Checks if a cache entry is expired.
   * @param entry The cache entry to check.
   * @returns True if the entry is expired, false otherwise.
   * @private
   */
  #isExpired(entry: CacheEntry<Value> | undefined): boolean {
      if (!entry || entry.expiresAt === null) {
          return false; // Not expired if no entry or no TTL set
      }
      return Date.now() > entry.expiresAt;
  }

  /**
   * Checks if a key is expired, and if so, deletes it and notifies.
   * @param key The key to check.
   * @returns True if the key was expired and removed, false otherwise.
   * @private
   */
  #deleteAndNotifyIfKeyExpired(key: Key): boolean {
    const entry = this.cache.get(key);
    if (this.#isExpired(entry)) {
        if (entry) { // Should always be true if #isExpired(entry) is true
            this.cache.delete(key);
            this.events.emitEviction(key, entry.value); // Use entry.value
            if (this.#trackStats) this.#evictions++;
        }
        return true;
    }
    return false;
  }

  /**
   * Updates an item's position in the cache to mark it as most recently used
   * @param key - The key to update
   * @param value - The value to set
   * @param expiresAt - The expiry time for the item
   * @private
   */
  private setMostRecentlyUsed(key: Key, value: Value, expiresAt: number | null): void {
      this.cache.delete(key);
      this.cache.set(key, { value, expiresAt });
  }

  /**
   * Retrieves a value from the cache
   * @param key - The key to look up
   * @returns The value if found, undefined otherwise
   */
  public get(key: Key): Value | undefined {
      if (this.#deleteAndNotifyIfKeyExpired(key)) {
          if (this.#trackStats) this.#misses++; // Count as miss if expired
          return undefined;
      }

      const entry = this.cache.get(key);

      if (entry === undefined) { // Should not happen if not expired and key existed, but as safeguard
          if (this.#trackStats) this.#misses++;
          return undefined;
      }

      // Move to the end of the Map to mark as recently used
      this.setMostRecentlyUsed(key, entry.value, entry.expiresAt);
      if (this.#trackStats) this.#hits++;

      return entry.value;
  }

  /**
   * Retrieves a value from the cache without updating its recency.
   * @param key - The key to look up
   * @returns The value if found, undefined otherwise
   */
  public peek(key: Key): Value | undefined {
      if (this.#deleteAndNotifyIfKeyExpired(key)) {
        // No stat update for peek on miss, consistent with non-TTL peek
        return undefined;
      }
      const entry = this.cache.get(key);
      return entry?.value;
  }

  /**
   * Adds or updates a value in the cache
   * @param key - The key to set
   * @param value - The value to store
   * @param itemTtlMs - Optional TTL for this specific item in milliseconds. Overrides default TTL.
   *                    Pass `null` for no TTL, `undefined` to use default TTL.
   * @returns The cache instance for method chaining
   */
  public set(key: Key, value: Value, itemTtlMs?: number | null): this {
      if (!this.has(key) && this.size() >= this.capacity) {
          this.evictOldest();
      }
      
      let expiresAt: number | null;
      if (itemTtlMs === null) { // Explicitly no TTL for this item
          expiresAt = null;
      } else if (typeof itemTtlMs === 'number' && itemTtlMs > 0) { // Specific TTL for this item
          if (!Number.isInteger(itemTtlMs)) {
            throw new Error('Item TTL must be a positive integer if specified');
          }
          expiresAt = Date.now() + itemTtlMs;
      } else if (this.defaultTtl && this.defaultTtl > 0) { // Default TTL
          expiresAt = Date.now() + this.defaultTtl;
      } else { // No specific TTL and no default TTL, or invalid specific TTL was passed (undefined)
          expiresAt = null;
      }

      this.setMostRecentlyUsed(key, value, expiresAt);
      return this;
  }

  /**
   * Removes an item from the cache
   * @param key - The key to remove
   * @returns True if the item was removed, false if it didn't exist
   */
  public delete(key: Key): boolean {
      return this.cache.delete(key);
  }

  /**
   * Evicts the least recently used item from the cache
   * @returns The key that was evicted, or undefined if cache was empty
   * @private
   */
  private evictOldest(): Key | undefined {
      const oldestEntry = this.cache.entries().next().value;
      
      if (oldestEntry === undefined) {
          return undefined;
      }
      
      const [oldestKey, oldestValue] = oldestEntry;
      this.cache.delete(oldestKey);
      this.events.emitEviction(oldestKey, oldestValue.value);
      if (this.#trackStats) this.#evictions++;
      
      return oldestKey;
  }

  /**
   * Checks if a key exists in the cache
   * @param key - The key to check
   * @returns True if the key exists, false otherwise
   */
  public has(key: Key): boolean {
      if (this.#deleteAndNotifyIfKeyExpired(key)) {
          return false; // Expired, so it effectively doesn't exist
      }
      return this.cache.has(key);
  }

  /**
   * Gets the current number of items in the cache
   * @returns The number of items
   */
  public size(): number {
      return this.cache.size;
  }

  /**
   * Checks if the cache is empty
   * @returns True if the cache is empty, false otherwise
   */
  public isEmpty(): boolean {
      return this.cache.size === 0;
  }

  /**
   * Gets the maximum capacity of the cache
   * @returns The capacity
   */
  public getCapacity(): number {
      return this.capacity;
  }

  /**
   * Removes all items from the cache
   * @returns The cache instance for method chaining
   */
  public clear(): this {
      this.cache.clear();
      return this;
  }

  /**
   * Returns all keys in the cache ordered from least to most recently used.
   * Note: May include keys for items that are logically expired but not yet purged.
   * @returns Array of keys
   */
  public keys(): Key[] {
      return Array.from(this.cache.keys());
  }

  /**
   * Returns all values in the cache ordered from least to most recently used.
   * Note: May include values for items that are logically expired but not yet purged.
   * @returns Array of values
   */
  public values(): Value[] {
      return Array.from(this.cache.values()).map(entry => entry.value);
  }

  /**
   * Returns all entries in the cache ordered from least to most recently used.
   * Note: May include entries for items that are logically expired but not yet purged.
   * @returns Array of [key, value] pairs
   */
  public entries(): [Key, Value][] {
      return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.value]);
  }

  /**
   * Returns all entries in the cache ordered from most to least recently used.
   * Note: May include entries for items that are logically expired but not yet purged.
   * @returns Array of [key, value] pairs
   */
  public entriesNewestFirst(): [Key, Value][] {
      return Array.from(this.cache.entries()).reverse().map(([key, entry]) => [key, entry.value]);
  }

  /**
   * Performs the specified action for each element in the cache.
   * Note: May process items that are logically expired but not yet purged.
   * @param callback - Function to execute for each element
   * @param thisArg - Value to use as this when executing callback
   */
  public forEach(callback: (value: Value, key: Key, cache: this) => void, thisArg?: any): void {
      this.cache.forEach((entry, key) => {
          callback.call(thisArg, entry.value, key, this);
      });
  }

  /**
   * Returns the current cache statistics.
   * @returns An object containing hits, misses, and evictions counts.
   */
  public stats(): { hits: number; misses: number; evictions: number } {
      return {
          hits: this.#hits,
          misses: this.#misses,
          evictions: this.#evictions,
      };
  }

  /**
   * Resets the cache statistics to zero.
   * (No-op if statistics tracking is disabled)
   */
  public resetStats(): void {
      if (this.#trackStats) {
          this.#hits = 0;
          this.#misses = 0;
          this.#evictions = 0;
      }
  }

  /**
   * Removes all logically expired items from the cache.
   * This method iterates through the cache to find and remove items whose TTL has passed.
   * Triggers `onEvict` for each removed item and updates eviction statistics if enabled.
   * @returns The number of items purged from the cache.
   */
  public purgeExpired(): number {
      let purgedCount = 0;
      // Iterate over a copy of keys to avoid issues with deleting from map while iterating
      const keys = Array.from(this.cache.keys()); 
      for (const key of keys) {
          // We use #deleteAndNotifyIfKeyExpired as it contains all the necessary logic
          // including checking the entry, deleting, emitting event, and updating stats.
          if (this.#deleteAndNotifyIfKeyExpired(key)) {
              purgedCount++;
          }
      }
      return purgedCount;
  }
}

/**
* Configuration options for the LRU Cache
*/
interface LruCacheOptions<Key, Value> {
  /**
   * Callback function invoked when an item is evicted from the cache
   */
  onEvict?: (key: Key, value: Value) => void;
  /**
   * Whether to track cache statistics (hits, misses, evictions).
   * Defaults to false.
   */
  trackStats?: boolean;
  /**
   * Default Time-To-Live for cache items in milliseconds.
   * If set, items will expire after this duration.
   * Defaults to null (no TTL).
   */
  ttl?: number | null;
}

/**
* Internal event handling for the LRU Cache
* @private
*/
class LruCacheEvents<Key, Value> {
  private readonly onEvict?: (key: Key, value: Value) => void;

  constructor(onEvict?: (key: Key, value: Value) => void) {
      this.onEvict = onEvict;
  }

  /**
   * Emits an eviction event
   * @param key - The key that was evicted
   * @param value - The value that was evicted
   */
  public emitEviction(key: Key, value: Value): void {
      if (this.onEvict) {
          try {
              this.onEvict(key, value);
          } catch (error) {
              // Prevent callback errors from disrupting cache operation
              console.error('Error in onEvict callback:', error);
          }
      }
  }
}

export { LruCache, LruCacheOptions };