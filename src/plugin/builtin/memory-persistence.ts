/**
 * Memory Persistence Plugin
 *
 * Provides persistent memory storage using various backends:
 * - File system (JSON/SQLite)
 * - Redis
 * - Vector databases (Qdrant)
 *
 * Integrates with session lifecycle for automatic state management.
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import type {
  PluginFactory,
  PluginContext,
  PluginInstance,
  MemoryAccessor,
} from '../plugin';

export interface MemoryPersistenceConfig {
  /** Storage backend type */
  backend?: 'file' | 'redis' | 'qdrant';
  /** Storage path for file backend */
  storagePath?: string;
  /** Redis URL for redis backend */
  redisUrl?: string;
  /** Qdrant URL for vector backend */
  qdrantUrl?: string;
  /** Default TTL in seconds (0 = no expiry) */
  defaultTtl?: number;
  /** Auto-save interval in milliseconds */
  autoSaveInterval?: number;
  /** Enable compression */
  compression?: boolean;
  /** Namespace prefix */
  namespace?: string;
}

interface MemoryEntry {
  value: unknown;
  ttl?: number;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface MemoryStore {
  version: number;
  entries: Record<string, MemoryEntry>;
  metadata: {
    lastSaved: number;
    entryCount: number;
  };
}

/**
 * Memory Persistence Plugin Factory
 */
export const MemoryPersistencePlugin: PluginFactory = async (
  ctx: PluginContext
): Promise<PluginInstance> => {
  const config: MemoryPersistenceConfig = {
    backend: ctx.config.get('memory.backend') || 'file',
    storagePath: ctx.config.get('memory.storagePath') || join(ctx.projectRoot, '.agent-memory'),
    redisUrl: ctx.config.get('memory.redisUrl'),
    qdrantUrl: ctx.config.get('memory.qdrantUrl'),
    defaultTtl: ctx.config.get('memory.defaultTtl') || 0,
    autoSaveInterval: ctx.config.get('memory.autoSaveInterval') || 30000,
    compression: ctx.config.get('memory.compression') || false,
    namespace: ctx.config.get('memory.namespace') || 'default',
  };

  // In-memory cache
  const cache: Map<string, MemoryEntry> = new Map();
  let isDirty = false;
  let autoSaveTimer: NodeJS.Timer | null = null;

  /**
   * Load memory from persistent storage
   */
  async function loadFromStorage(): Promise<void> {
    if (config.backend !== 'file') {
      // TODO: Implement Redis/Qdrant loading
      return;
    }

    const filePath = join(config.storagePath!, `${config.namespace}.json`);

    if (!existsSync(filePath)) {
      return;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const store: MemoryStore = JSON.parse(content);

      // Load entries into cache
      for (const [key, entry] of Object.entries(store.entries)) {
        // Skip expired entries
        if (entry.expiresAt && entry.expiresAt < Date.now()) {
          continue;
        }
        cache.set(key, entry);
      }

      ctx.logger.debug('Loaded memory from storage', {
        entries: cache.size,
        path: filePath,
      });
    } catch (error) {
      ctx.logger.warn('Failed to load memory from storage', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Save memory to persistent storage
   */
  async function saveToStorage(): Promise<void> {
    if (!isDirty || config.backend !== 'file') {
      return;
    }

    const filePath = join(config.storagePath!, `${config.namespace}.json`);

    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });

    // Build store object
    const store: MemoryStore = {
      version: 1,
      entries: Object.fromEntries(cache),
      metadata: {
        lastSaved: Date.now(),
        entryCount: cache.size,
      },
    };

    try {
      await writeFile(filePath, JSON.stringify(store, null, 2));
      isDirty = false;
      ctx.logger.debug('Saved memory to storage', {
        entries: cache.size,
        path: filePath,
      });
    } catch (error) {
      ctx.logger.error('Failed to save memory to storage', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clean up expired entries
   */
  function cleanupExpired(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, entry] of cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        cache.delete(key);
        removed++;
        isDirty = true;
      }
    }

    return removed;
  }

  /**
   * Create a namespaced memory accessor
   */
  function createAccessor(ns: string): MemoryAccessor {
    const prefix = ns ? `${ns}:` : '';

    return {
      async get<T>(key: string): Promise<T | undefined> {
        const fullKey = `${prefix}${key}`;
        const entry = cache.get(fullKey);

        if (!entry) {
          return undefined;
        }

        // Check expiration
        if (entry.expiresAt && entry.expiresAt < Date.now()) {
          cache.delete(fullKey);
          isDirty = true;
          return undefined;
        }

        return entry.value as T;
      },

      async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        const fullKey = `${prefix}${key}`;
        const effectiveTtl = ttl ?? config.defaultTtl;
        const now = Date.now();

        const entry: MemoryEntry = {
          value,
          ttl: effectiveTtl,
          expiresAt: effectiveTtl ? now + effectiveTtl * 1000 : undefined,
          createdAt: cache.get(fullKey)?.createdAt || now,
          updatedAt: now,
        };

        cache.set(fullKey, entry);
        isDirty = true;
      },

      async delete(key: string): Promise<boolean> {
        const fullKey = `${prefix}${key}`;
        const existed = cache.has(fullKey);
        cache.delete(fullKey);
        if (existed) {
          isDirty = true;
        }
        return existed;
      },

      async search(pattern: string): Promise<Array<{ key: string; value: unknown }>> {
        const results: Array<{ key: string; value: unknown }> = [];
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));

        for (const [key, entry] of cache.entries()) {
          if (!key.startsWith(prefix)) continue;

          const localKey = key.slice(prefix.length);
          if (regex.test(localKey)) {
            // Skip expired
            if (entry.expiresAt && entry.expiresAt < Date.now()) {
              continue;
            }
            results.push({ key: localKey, value: entry.value });
          }
        }

        return results;
      },

      namespace(subNs: string): MemoryAccessor {
        return createAccessor(ns ? `${ns}:${subNs}` : subNs);
      },
    };
  }

  // Root memory accessor
  const rootAccessor = createAccessor('');

  return {
    metadata: {
      name: 'memory-persistence',
      version: '1.0.0',
      description: 'Persistent memory storage for agents',
      tags: ['memory', 'persistence', 'storage'],
    },

    lifecycle: {
      async init() {
        // Load existing memory
        await loadFromStorage();

        // Start auto-save timer
        if (config.autoSaveInterval && config.autoSaveInterval > 0) {
          autoSaveTimer = setInterval(async () => {
            cleanupExpired();
            await saveToStorage();
          }, config.autoSaveInterval);
        }

        ctx.logger.info('Memory persistence plugin initialized', {
          backend: config.backend,
          entries: cache.size,
        });
      },

      async destroy() {
        // Stop auto-save timer
        if (autoSaveTimer) {
          clearInterval(autoSaveTimer);
          autoSaveTimer = null;
        }

        // Final save
        await saveToStorage();

        ctx.logger.info('Memory persistence plugin destroyed');
      },

      async suspend() {
        // Save before suspend
        await saveToStorage();
      },

      async resume() {
        // Reload on resume
        await loadFromStorage();
      },
    },

    hooks: {
      'session.start': async (input, output) => {
        // Create session-specific namespace
        const sessionMemory = rootAccessor.namespace(`session:${input.sessionId}`);

        // Store session start
        await sessionMemory.set('startedAt', Date.now());

        return {
          ...output,
          context: {
            ...output.context,
            memory: sessionMemory,
          },
        };
      },

      'session.end': async (input, output) => {
        // Store session metrics
        const sessionMemory = rootAccessor.namespace(`session:${input.sessionId}`);
        await sessionMemory.set('endedAt', Date.now());
        await sessionMemory.set('duration', input.duration);

        // Force save
        await saveToStorage();

        return output;
      },

      'memory.update': async (input, output) => {
        const accessor = input.namespace
          ? rootAccessor.namespace(input.namespace)
          : rootAccessor;

        await accessor.set(input.key, output.value, output.ttl);

        return output;
      },

      'memory.retrieve': async (input, output) => {
        const accessor = input.namespace
          ? rootAccessor.namespace(input.namespace)
          : rootAccessor;

        const value = await accessor.get(input.key);

        return {
          ...output,
          value: value ?? output.value,
        };
      },
    },

    // Expose memory accessor as tool
    tools: {
      memory_get: {
        description: 'Get a value from persistent memory',
        args: {
          key: { type: 'string', description: 'Memory key' } as any,
          namespace: { type: 'string', description: 'Optional namespace' } as any,
        },
        async execute(args) {
          const accessor = args.namespace
            ? rootAccessor.namespace(args.namespace)
            : rootAccessor;
          const value = await accessor.get(args.key);
          return value !== undefined ? JSON.stringify(value) : 'null';
        },
      },
      memory_set: {
        description: 'Set a value in persistent memory',
        args: {
          key: { type: 'string', description: 'Memory key' } as any,
          value: { type: 'string', description: 'Value to store (JSON)' } as any,
          namespace: { type: 'string', description: 'Optional namespace' } as any,
          ttl: { type: 'number', description: 'TTL in seconds' } as any,
        },
        async execute(args) {
          const accessor = args.namespace
            ? rootAccessor.namespace(args.namespace)
            : rootAccessor;
          const value = JSON.parse(args.value);
          await accessor.set(args.key, value, args.ttl);
          return 'Value stored successfully';
        },
      },
      memory_search: {
        description: 'Search memory by pattern',
        args: {
          pattern: { type: 'string', description: 'Search pattern (supports *)' } as any,
          namespace: { type: 'string', description: 'Optional namespace' } as any,
        },
        async execute(args) {
          const accessor = args.namespace
            ? rootAccessor.namespace(args.namespace)
            : rootAccessor;
          const results = await accessor.search(args.pattern);
          return JSON.stringify(results, null, 2);
        },
      },
    },
  };
};

export default MemoryPersistencePlugin;
