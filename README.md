# FeatureRich LRU Cache

A lightweight, zero-dependency, and feature-rich Least Recently Used (LRU) cache implementation in TypeScript. Designed for performance, flexibility, and ease of use in both Node.js and browser environments.

This LRU cache stands out with its comprehensive feature set, offering capabilities often found spread across multiple libraries or requiring custom implementations:

*   **Per-Entry TTL Overrides**: Set a global Time-To-Live (TTL) for all cache entries, or override it on a per-entry basis during `set` operations. You can even specify `null` for an entry to prevent it from expiring, regardless of the default TTL.
*   **Built-In Expired-Purge Utility**: Includes a `purgeExpired()` method to proactively find and remove all expired items from the cache. Entries are also automatically checked and removed upon access if expired.
*   **First-Class Stats & Events**:
    *   Track cache performance with built-in statistics for `hits`, `misses`, and `evictions` via the `stats()` method. Statistics can be reset using `resetStats()`.
    *   Subscribe to eviction events using the `onEvict(key, value)` callback in the cache options, which fires whenever an item is removed due to capacity limits, explicit deletion, or TTL expiry.
*   **Zero Dependencies & Tiny Footprint**: Crafted with no runtime dependencies, ensuring a minimal impact on your project's bundle size and simplifying integration.

## Features

*   **LRU Eviction Policy**: Automatically evicts the least recently used items when cache capacity is reached.
*   **Capacity Limit**: Fixed maximum number of items the cache can hold.
*   **Time-To-Live (TTL)**:
    *   Optional default TTL for all entries.
    *   Per-entry TTL that can override the default or disable expiration.
*   **Explicit Expiry Purge**: `purgeExpired()` method to manually clear out all expired items.
*   **Cache Statistics**: `stats()` method to retrieve hits, misses, and evictions. `resetStats()` to clear them. (Opt-in via `trackStats` option).
*   **Eviction Callback**: `onEvict(key, value)` called when an item is removed.
*   **Standard Cache Operations**: `get`, `set`, `peek`, `has`, `delete`, `clear`.
*   **Iteration & Introspection**: `keys()`, `values()`, `entries()`, `entriesNewestFirst()`, `forEach()`, `size()`, `isEmpty()`, `getCapacity()`.
*   **TypeScript Native**: Written in TypeScript for strong typing and better developer experience.

## Installation

This module is self-contained in `index.ts`. You can integrate it into your project by copying the file or importing it directly if your setup supports it.

```bash
# If you publish it as a package, example:
# npm install lru-cache-x
# yarn add lru-cache-x
```

## Basic Usage

```typescript
import { LruCache, LruCacheOptions } from './index'; // Adjust path as needed

// Optional: Configure cache options
const options: LruCacheOptions<string, number> = {
  onEvict: (key, value) => {
    console.log(`Evicted: key=${key}, value=${value}`);
  },
  ttl: 1000 * 60 * 5, // Default TTL: 5 minutes
  trackStats: true,   // Enable statistics tracking
};

// Create a cache with a capacity of 3
const cache = new LruCache<string, number>(3, options);

// Set items
cache.set('a', 1);
cache.set('b', 2);
cache.set('c', 3);

console.log(cache.get('a')); // Output: 1. 'a' is now the most recently used.

// Add another item, 'd'. 'b' will be evicted as it's the least recently used.
cache.set('d', 4);
// onEvict callback will be called for key 'b'

console.log(cache.has('b')); // Output: false

// Set an item with a specific TTL (1 second)
cache.set('e', 5, 1000);

// Set an item with no TTL (will not expire based on default TTL)
cache.set('f', 6, null);


setTimeout(() => {
  console.log(cache.get('e')); // Output: undefined (if more than 1 second has passed)
  console.log(cache.get('f')); // Output: 6 (still there)
  
  // Purge any other expired items
  const purgedCount = cache.purgeExpired();
  console.log(`Purged ${purgedCount} expired items.`);

  // Get statistics
  console.log(cache.stats());
  // Example Output: { hits: X, misses: Y, evictions: Z }

}, 2000);

console.log(cache.keys()); // Output: ['c', 'a', 'd'] (or similar, depending on exact timing of get('a'))
```

## API Reference

### `new LruCache<Key, Value>(capacity: number, options?: LruCacheOptions<Key, Value>)`

Creates a new LRU Cache instance.

*   `capacity`: Maximum number of items the cache can hold. Must be a positive integer.
*   `options` (optional):
    *   `onEvict?: (key: Key, value: Value) => void`: Callback function invoked when an item is evicted.
    *   `trackStats?: boolean`: Whether to track cache statistics. Defaults to `false`.
    *   `ttl?: number | null`: Default Time-To-Live for cache items in milliseconds. If `null` or not set, items do not expire by default. Must be a positive integer if specified.

### Methods

*   **`get(key: Key): Value | undefined`**: Retrieves an item. Marks it as most recently used. Returns `undefined` if not found or expired (and removes it).
*   **`peek(key: Key): Value | undefined`**: Retrieves an item without updating its recency. Returns `undefined` if not found or expired (and removes it).
*   **`set(key: Key, value: Value, itemTtlMs?: number | null): this`**: Adds or updates an item. Marks it as most recently used.
    *   `itemTtlMs`: Optional TTL for this specific item in milliseconds.
        *   `number`: Specific TTL for this item.
        *   `null`: This item will not expire based on TTL.
        *   `undefined` (or not provided): Uses the cache's `defaultTtl`.
*   **`delete(key: Key): boolean`**: Removes an item. Returns `true` if removed, `false` otherwise.
*   **`has(key: Key): boolean`**: Checks if an item exists and is not expired. Returns `true` if present and not expired (removes if expired), `false` otherwise.
*   **`clear(): this`**: Removes all items from the cache.
*   **`size(): number`**: Returns the current number of items in the cache.
*   **`isEmpty(): boolean`**: Returns `true` if the cache is empty.
*   **`getCapacity(): number`**: Returns the maximum capacity of the cache.
*   **`keys(): Key[]`**: Returns an array of keys from least to most recently used. May include expired keys not yet purged.
*   **`values(): Value[]`**: Returns an array of values from least to most recently used. May include expired values not yet purged.
*   **`entries(): [Key, Value][]`**: Returns an array of `[key, value]` pairs from least to most recently used. May include expired entries not yet purged.
*   **`entriesNewestFirst(): [Key, Value][]`**: Returns an array of `[key, value]` pairs from most to least recently used. May include expired entries not yet purged.
*   **`forEach(callback: (value: Value, key: Key, cache: this) => void, thisArg?: any): void`**: Executes a callback for each item. May include expired items not yet purged.
*   **`stats(): { hits: number; misses: number; evictions: number }`**: Returns cache statistics (if `trackStats` is `true`).
*   **`resetStats(): void`**: Resets cache statistics to zero (if `trackStats` is `true`).
*   **`purgeExpired(): number`**: Iterates through the cache, removing all items whose TTL has passed. Triggers `onEvict` for each. Returns the number of items purged.

## Contributing

Contributions, issues, and feature requests are welcome!

## License

MIT