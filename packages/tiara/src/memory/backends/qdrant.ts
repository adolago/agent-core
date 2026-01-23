/**
 * Qdrant backend placeholder for memory storage.
 *
 * This implementation uses in-memory storage to satisfy the IMemoryBackend
 * interface until a native Qdrant adapter is wired for the memory manager.
 */

import type { IMemoryBackend } from './base.js';
import type { MemoryEntry, MemoryQuery } from '../../utils/types.js';
import type { ILogger } from '../../core/logger.js';

type QdrantBackendConfig = {
  url?: string;
  apiKey?: string;
  collection?: string;
  namespace?: string;
};

export class QdrantBackend implements IMemoryBackend {
  private entries = new Map<string, MemoryEntry>();

  constructor(
    private config: QdrantBackendConfig,
    private logger: ILogger,
  ) {}

  async initialize(): Promise<void> {
    this.logger.info('Qdrant backend initialized', {
      collection: this.config.collection,
      namespace: this.config.namespace,
    });
  }

  async shutdown(): Promise<void> {
    this.entries.clear();
  }

  async store(entry: MemoryEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async retrieve(id: string): Promise<MemoryEntry | undefined> {
    return this.entries.get(id);
  }

  async update(id: string, entry: MemoryEntry): Promise<void> {
    this.entries.set(id, entry);
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    let results = Array.from(this.entries.values());

    if (query.agentId) {
      results = results.filter((entry) => entry.agentId === query.agentId);
    }
    if (query.sessionId) {
      results = results.filter((entry) => entry.sessionId === query.sessionId);
    }
    if (query.type) {
      results = results.filter((entry) => entry.type === query.type);
    }
    if (query.tags?.length) {
      results = results.filter((entry) => query.tags?.every((tag) => entry.tags.includes(tag)));
    }
    if (query.startTime) {
      results = results.filter((entry) => entry.timestamp >= query.startTime!);
    }
    if (query.endTime) {
      results = results.filter((entry) => entry.timestamp <= query.endTime!);
    }
    if (query.search) {
      const needle = query.search.toLowerCase();
      results = results.filter((entry) => entry.content.toLowerCase().includes(needle));
    }

    if (query.offset) {
      results = results.slice(query.offset);
    }
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  async getAllEntries(): Promise<MemoryEntry[]> {
    return Array.from(this.entries.values());
  }

  async getHealthStatus(): Promise<{ healthy: boolean; error?: string; metrics?: Record<string, number> }> {
    return {
      healthy: true,
      metrics: {
        entries: this.entries.size,
      },
    };
  }
}
