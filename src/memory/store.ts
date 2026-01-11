/**
 * MemoryStore - High-level memory service for Zee
 *
 * Combines Qdrant vector storage with embedding generation
 * to provide a simple store/search API for the memory tools.
 */

import { randomUUID } from "node:crypto";
import { QdrantVectorStorage } from "./qdrant";
import { createEmbeddingProvider, type EmbeddingConfig } from "./embedding";
import type {
  MemoryEntry,
  MemoryInput,
  MemorySearchParams,
  MemorySearchResult,
  MemoryCategory,
  EmbeddingProvider,
} from "./types";

// =============================================================================
// Configuration
// =============================================================================

export interface MemoryStoreConfig {
  qdrant: {
    url?: string;
    apiKey?: string;
    collection?: string;
  };
  embedding: EmbeddingConfig;
  namespace?: string;
}

const DEFAULT_CONFIG: MemoryStoreConfig = {
  qdrant: {
    url: process.env.QDRANT_URL ?? "http://localhost:6333",
    collection: process.env.QDRANT_COLLECTION ?? "zee_memories",
  },
  embedding: {
    // Use Qwen3-Embedding-8B via Nebius - #1 honest model on MTEB (70.58, 99% zero-shot)
    provider: (process.env.EMBEDDING_PROVIDER as any) ?? "local",
    model: process.env.EMBEDDING_MODEL ?? "Qwen/Qwen3-Embedding-8B",
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS ?? "4096", 10),
    baseUrl: process.env.EMBEDDING_URL ?? "https://api.tokenfactory.nebius.com/v1",
    apiKey: process.env.NEBIUS_API_KEY,
  },
  namespace: "zee",
};

// =============================================================================
// MemoryStore Class
// =============================================================================

export class MemoryStore {
  private readonly storage: QdrantVectorStorage;
  private readonly embedding: EmbeddingProvider;
  private readonly namespace: string;
  private readonly dimension: number;
  private initialized = false;

  constructor(config: Partial<MemoryStoreConfig> = {}) {
    const merged = {
      ...DEFAULT_CONFIG,
      ...config,
      qdrant: { ...DEFAULT_CONFIG.qdrant, ...config.qdrant },
      embedding: { ...DEFAULT_CONFIG.embedding, ...config.embedding },
    };

    // Ensure required fields have default values
    const qdrantConfig = {
      url: merged.qdrant.url ?? "http://localhost:6333",
      apiKey: merged.qdrant.apiKey,
      collection: merged.qdrant.collection ?? "zee_memories",
    };

    this.storage = new QdrantVectorStorage(qdrantConfig);
    this.embedding = createEmbeddingProvider(merged.embedding);
    this.namespace = merged.namespace ?? "zee";
    this.dimension = merged.embedding.dimensions ?? 1536;
  }

  /** Initialize the store (create collection if needed) */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.storage.createCollection(
      `${this.namespace}_memories`,
      this.dimension
    );
    this.initialized = true;
  }

  /**
   * Store a memory
   */
  async save(input: MemoryInput): Promise<MemoryEntry> {
    await this.init();

    const id = randomUUID();
    const now = Date.now();

    // Generate embedding
    const vector = await this.embedding.embed(input.content);

    const entry: MemoryEntry = {
      id,
      category: input.category,
      content: input.content,
      summary: input.summary,
      embedding: vector,
      metadata: input.metadata ?? {},
      createdAt: now,
      accessedAt: now,
      ttl: input.ttl,
      namespace: input.namespace ?? this.namespace,
    };

    // Store in Qdrant
    await this.storage.insert([
      {
        id,
        vector,
        payload: {
          category: entry.category,
          content: entry.content,
          summary: entry.summary,
          metadata: entry.metadata,
          createdAt: entry.createdAt,
          accessedAt: entry.accessedAt,
          ttl: entry.ttl,
          namespace: entry.namespace,
        },
      },
    ]);

    return entry;
  }

  /**
   * Search memories semantically
   */
  async search(params: MemorySearchParams): Promise<MemorySearchResult[]> {
    await this.init();

    // Generate query embedding
    const queryVector = await this.embedding.embed(params.query);

    // Build filter
    const filter: Record<string, unknown> = {};
    if (params.namespace) {
      filter.namespace = params.namespace;
    } else {
      filter.namespace = this.namespace;
    }
    if (params.category) {
      if (Array.isArray(params.category)) {
        filter.category = { $in: params.category };
      } else {
        filter.category = params.category;
      }
    }
    if (params.tags?.length) {
      filter["metadata.tags"] = { $in: params.tags };
    }
    if (params.timeRange) {
      if (params.timeRange.start) {
        filter.createdAt = { ...(filter.createdAt as object ?? {}), $gte: params.timeRange.start };
      }
      if (params.timeRange.end) {
        filter.createdAt = { ...(filter.createdAt as object ?? {}), $lte: params.timeRange.end };
      }
    }

    // Search in Qdrant
    const results = await this.storage.search(queryVector, {
      limit: params.limit ?? 10,
      threshold: params.threshold ?? 0.5,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    });

    // Map results to MemorySearchResult
    return results.map((r) => ({
      entry: {
        id: r.id,
        category: r.payload.category as MemoryCategory,
        content: r.payload.content as string,
        summary: r.payload.summary as string | undefined,
        metadata: r.payload.metadata as MemoryEntry["metadata"],
        createdAt: r.payload.createdAt as number,
        accessedAt: r.payload.accessedAt as number,
        ttl: r.payload.ttl as number | undefined,
        namespace: r.payload.namespace as string | undefined,
      },
      score: r.score,
    }));
  }

  /**
   * Get a specific memory by ID
   */
  async get(id: string): Promise<MemoryEntry | null> {
    await this.init();

    const results = await this.storage.get([id]);
    const point = results[0];
    if (!point) return null;

    return {
      id: point.id,
      category: point.payload.category as MemoryCategory,
      content: point.payload.content as string,
      summary: point.payload.summary as string | undefined,
      embedding: point.vector,
      metadata: point.payload.metadata as MemoryEntry["metadata"],
      createdAt: point.payload.createdAt as number,
      accessedAt: point.payload.accessedAt as number,
      ttl: point.payload.ttl as number | undefined,
      namespace: point.payload.namespace as string | undefined,
    };
  }

  /**
   * List memories with optional filters
   */
  async list(options: {
    category?: MemoryCategory;
    namespace?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<MemoryEntry[]> {
    await this.init();

    // Build filter
    const filter: Record<string, unknown> = {
      namespace: options.namespace ?? this.namespace,
    };
    if (options.category) {
      filter.category = options.category;
    }

    // Use scroll to list
    const count = await this.storage.count(filter);
    if (count === 0) return [];

    // Search with a dummy vector to get all matching entries
    // This is a workaround - ideally we'd have a scroll/list method
    const dummyVector = new Array(this.dimension).fill(0);
    const results = await this.storage.search(dummyVector, {
      limit: options.limit ?? 100,
      filter,
    });

    return results.map((r) => ({
      id: r.id,
      category: r.payload.category as MemoryCategory,
      content: r.payload.content as string,
      summary: r.payload.summary as string | undefined,
      metadata: r.payload.metadata as MemoryEntry["metadata"],
      createdAt: r.payload.createdAt as number,
      accessedAt: r.payload.accessedAt as number,
      ttl: r.payload.ttl as number | undefined,
      namespace: r.payload.namespace as string | undefined,
    }));
  }

  /**
   * Delete a memory by ID
   */
  async delete(id: string): Promise<void> {
    await this.init();
    await this.storage.delete([id]);
  }

  /**
   * Delete memories matching a filter
   */
  async deleteWhere(filter: {
    category?: MemoryCategory;
    namespace?: string;
    olderThan?: number;
  }): Promise<number> {
    await this.init();

    const qdrantFilter: Record<string, unknown> = {};
    if (filter.category) qdrantFilter.category = filter.category;
    if (filter.namespace) qdrantFilter.namespace = filter.namespace;
    if (filter.olderThan) qdrantFilter.createdAt = { $lt: filter.olderThan };

    return this.storage.deleteWhere(qdrantFilter);
  }

  /**
   * Get statistics about the memory store
   */
  async stats(): Promise<{
    total: number;
    byCategory: Record<string, number>;
  }> {
    await this.init();

    const total = await this.storage.count({ namespace: this.namespace });
    const categories: MemoryCategory[] = [
      "conversation",
      "fact",
      "preference",
      "task",
      "decision",
      "relationship",
      "note",
      "pattern",
    ];

    const byCategory: Record<string, number> = {};
    for (const cat of categories) {
      byCategory[cat] = await this.storage.count({
        namespace: this.namespace,
        category: cat,
      });
    }

    return { total, byCategory };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let _instance: MemoryStore | null = null;

/**
 * Get the shared MemoryStore instance
 */
export function getMemoryStore(config?: Partial<MemoryStoreConfig>): MemoryStore {
  if (!_instance) {
    _instance = new MemoryStore(config);
  }
  return _instance;
}

/**
 * Reset the shared instance (for testing)
 */
export function resetMemoryStore(): void {
  _instance = null;
}
