/**
 * Memory cache implementation with LRU eviction
 */

import type { MemoryEntry } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';

interface CacheEntry {
  data: MemoryEntry;
  size: number;
  lastAccessed: number;
  dirty: boolean;
}

/**
 * LRU cache for memory entries
 */
export class MemoryCache {
  private cache = new Map<string, CacheEntry>();
  private currentSize = 0;
  private hits = 0;
  private misses = 0;

  constructor(
    private maxSize: number,
    private logger: ILogger,
  ) {}

  /**
   * Gets an entry from the cache
   */
  get(id: string): MemoryEntry | undefined {
    const entry = this.cache.get(id);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Move to end (MRU)
    this.cache.delete(id);
    this.cache.set(id, entry);

    // Update access time
    entry.lastAccessed = Date.now();
    this.hits++;

    return entry.data;
  }

  /**
   * Sets an entry in the cache
   */
  set(id: string, data: MemoryEntry, dirty = true): void {
    const size = this.calculateSize(data);

    // Update size if replacing existing entry
    const existing = this.cache.get(id);
    if (existing) {
      this.currentSize -= existing.size;
      // Remove existing to re-insert at end (MRU)
      this.cache.delete(id);
    }

    // Check if we need to evict entries
    if (this.currentSize + size > this.maxSize) {
      this.evict(size);
    }

    const entry: CacheEntry = {
      data,
      size,
      lastAccessed: Date.now(),
      dirty,
    };

    this.cache.set(id, entry);
    this.currentSize += size;
  }

  /**
   * Deletes an entry from the cache
   */
  delete(id: string): void {
    const entry = this.cache.get(id);
    if (entry) {
      this.currentSize -= entry.size;
      this.cache.delete(id);
    }
  }

  /**
   * Gets entries by prefix
   */
  getByPrefix(prefix: string): MemoryEntry[] {
    const results: MemoryEntry[] = [];

    for (const [id, entry] of this.cache) {
      if (id.startsWith(prefix)) {
        entry.lastAccessed = Date.now();
        results.push(entry.data);
      }
    }

    return results;
  }

  /**
   * Gets all dirty entries
   */
  getDirtyEntries(): MemoryEntry[] {
    const dirtyEntries: MemoryEntry[] = [];

    for (const entry of this.cache.values()) {
      if (entry.dirty) {
        dirtyEntries.push(entry.data);
      }
    }

    return dirtyEntries;
  }

  /**
   * Marks entries as clean
   */
  markClean(ids: string[]): void {
    for (const id of ids) {
      const entry = this.cache.get(id);
      if (entry) {
        entry.dirty = false;
      }
    }
  }

  /**
   * Gets all entries
   */
  getAllEntries(): MemoryEntry[] {
    return Array.from(this.cache.values()).map((entry) => entry.data);
  }

  /**
   * Gets cache metrics
   */
  getMetrics(): {
    size: number;
    entries: number;
    hitRate: number;
    maxSize: number;
  } {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;

    return {
      size: this.currentSize,
      entries: this.cache.size,
      hitRate,
      maxSize: this.maxSize,
    };
  }

  /**
   * Clears the cache
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Performs cache maintenance
   */
  performMaintenance(): void {
    // Remove expired entries if needed
    // For now, just log metrics
    const metrics = this.getMetrics();
    this.logger.debug('Cache maintenance', metrics);
  }

  private calculateSize(entry: MemoryEntry): number {
    // Rough estimate of memory size
    let size = 0;

    // String fields
    size += entry.id.length * 2; // UTF-16
    size += entry.agentId.length * 2;
    size += entry.sessionId.length * 2;
    size += entry.type.length * 2;
    size += entry.content.length * 2;

    // Tags
    size += entry.tags.reduce((sum, tag) => sum + tag.length * 2, 0);

    // Estimate object size without JSON.stringify
    size += this.estimateObjectSize(entry.context);
    if (entry.metadata) {
      size += this.estimateObjectSize(entry.metadata);
    }

    // Fixed size fields
    size += 8; // timestamp
    size += 4; // version
    size += 100; // overhead

    return size;
  }

  private estimateObjectSize(obj: any, depth = 0): number {
    if (depth > 5) return 0; // Limit depth to avoid stack overflow
    if (obj === null || obj === undefined) return 0;

    let size = 0;

    if (typeof obj === 'string') {
      return obj.length * 2;
    }
    if (typeof obj === 'number') {
      return 8;
    }
    if (typeof obj === 'boolean') {
      return 4;
    }

    if (typeof obj === 'object') {
      if (Array.isArray(obj)) {
        for (const item of obj) {
          size += this.estimateObjectSize(item, depth + 1);
        }
      } else {
        for (const key in obj) {
          size += key.length * 2;
          size += this.estimateObjectSize(obj[key], depth + 1);
        }
      }
    }

    return size;
  }

  private evict(requiredSpace: number): void {
    this.logger.debug('Cache eviction triggered', {
      requiredSpace,
      currentSize: this.currentSize,
    });

    let freedSpace = 0;
    const evicted: string[] = [];

    // Since we maintain insertion order as access order,
    // the first entries in the iterator are the LRU ones
    for (const [id, entry] of this.cache) {
      if (freedSpace >= requiredSpace) {
        break;
      }

      // Don't evict dirty entries if possible
      if (entry.dirty && evicted.length > 0) {
        continue;
      }

      this.cache.delete(id);
      this.currentSize -= entry.size;
      freedSpace += entry.size;
      evicted.push(id);
    }

    this.logger.debug('Cache entries evicted', {
      count: evicted.length,
      freedSpace,
    });
  }
}
