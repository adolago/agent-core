/**
 * Qdrant vector database client for memory storage.
 * Uses REST API - no additional dependencies required.
 *
 * Ported from zee to agent-core for unified memory layer.
 */

import type {
  EmbeddingProvider,
  MemoryConfig,
  MemoryCategory as TypesMemoryCategory,
  VectorStorage,
} from "./types";
import { Log } from "../../packages/agent-core/src/util/log";
import { QDRANT_URL, QDRANT_COLLECTION_MEMORY } from "../config/constants";

const log = Log.create({ service: "qdrant" });

// =============================================================================
// Qdrant Types
// =============================================================================

type QdrantCondition = {
  key?: string;
  match?: { value: string | number };
  range?: { lt?: number; gt?: number; lte?: number; gte?: number };
  is_null?: { key: string };
  should?: QdrantCondition[];
};

type QdrantFilter = {
  must?: QdrantCondition[];
};

type QdrantSearchResult = {
  id: string;
  score: number;
  payload: Record<string, unknown>;
  vector?: number[];
};

type QdrantScrollResult = {
  points: Array<{
    id: string;
    payload: Record<string, unknown>;
    vector?: number[];
  }>;
  next_page_offset?: string | number | null;
};

type QdrantPointResult = {
  id: string;
  payload: Record<string, unknown>;
  vector?: number[];
};

// =============================================================================
// Qdrant Vector Storage Implementation
// =============================================================================

/**
 * Qdrant-based vector storage implementation.
 * Implements the VectorStorage interface for use with the memory system.
 */
export class QdrantVectorStorage implements VectorStorage {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly defaultCollection: string;
  private currentCollection: string;

  constructor(config: MemoryConfig["qdrant"]) {
    this.baseUrl = (config.url ?? QDRANT_URL).replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.defaultCollection = config.collection ?? QDRANT_COLLECTION_MEMORY;
    this.currentCollection = this.defaultCollection;
  }

  /** Make a request to Qdrant REST API */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["api-key"] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Qdrant ${method} ${path} failed (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();
    return (data as { result?: T }).result ?? (data as T);
  }

  /** Check if collection exists */
  private async collectionExists(name: string): Promise<boolean> {
    try {
      await this.request("GET", `/collections/${name}`);
      return true;
    } catch (error) {
      // Expected for non-existent collections - log at debug level for tracing
      log.debug("Collection check returned false", {
        collection: name,
        reason: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async init(): Promise<void> {
    // No-op - collections are created on demand
  }

  async createCollection(name: string, dimension: number): Promise<void> {
    const exists = await this.collectionExists(name);
    if (exists) {
      // Still set currentCollection even if collection already exists
      this.currentCollection = name;
      return;
    }

    await this.request("PUT", `/collections/${name}`, {
      vectors: {
        size: dimension,
        distance: "Cosine",
      },
    });

    // Create payload indexes for common filtering patterns
    const indexConfigs: Array<{ field: string; schema: unknown }> = [
      { field: "category", schema: "keyword" },
      { field: "namespace", schema: "keyword" },
      { field: "sessionId", schema: "keyword" },
      { field: "agent", schema: "keyword" },
      {
        field: "createdAt",
        schema: { type: "integer", lookup: true, range: true },
      },
      {
        field: "accessedAt",
        schema: { type: "integer", lookup: true, range: true },
      },
    ];

    for (const { field, schema } of indexConfigs) {
      try {
        await this.request("PUT", `/collections/${name}/index`, {
          field_name: field,
          field_schema: schema,
        });
      } catch (error) {
        // Index might already exist - expected, log at debug
        log.debug("Index creation skipped (likely exists)", {
          collection: name,
          field,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.currentCollection = name;
  }

  async deleteCollection(name: string): Promise<void> {
    try {
      await this.request("DELETE", `/collections/${name}`);
    } catch (error) {
      // Collection might not exist - log at debug for tracing
      log.debug("Collection deletion skipped", {
        collection: name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async listCollections(): Promise<string[]> {
    const result = await this.request<{ collections: Array<{ name: string }> }>(
      "GET",
      "/collections"
    );
    return result.collections?.map((c) => c.name) ?? [];
  }

  async insert(
    entries: Array<{
      id: string;
      vector: number[];
      payload: Record<string, unknown>;
    }>
  ): Promise<void> {
    if (entries.length === 0) return;

    await this.request("PUT", `/collections/${this.currentCollection}/points`, {
      points: entries.map((e) => ({
        id: e.id,
        vector: e.vector,
        payload: e.payload,
      })),
    });
  }

  async search(
    vector: number[],
    options: {
      limit: number;
      threshold?: number;
      filter?: Record<string, unknown>;
    }
  ): Promise<
    Array<{
      id: string;
      score: number;
      payload: Record<string, unknown>;
    }>
  > {
    const filter = this.buildFilter(options.filter);

    const results = await this.request<QdrantSearchResult[]>(
      "POST",
      `/collections/${this.currentCollection}/points/search`,
      {
        vector,
        limit: options.limit,
        filter: filter.must?.length ? filter : undefined,
        with_payload: true,
        score_threshold: options.threshold,
      }
    );

    const resultsArray = Array.isArray(results) ? results : [];
    return resultsArray.map((r) => ({
      id: String(r.id),
      score: r.score,
      payload: r.payload,
    }));
  }

  async get(
    ids: string[]
  ): Promise<
    Array<{
      id: string;
      vector?: number[];
      payload: Record<string, unknown>;
    } | null>
  > {
    if (ids.length === 0) return [];

    try {
      const results = await this.request<QdrantPointResult[]>(
        "POST",
        `/collections/${this.currentCollection}/points`,
        {
          ids,
          with_payload: true,
          with_vector: true,
        }
      );

      const resultsMap = new Map(
        (Array.isArray(results) ? results : []).map((r) => [String(r.id), r])
      );

      return ids.map((id) => {
        const point = resultsMap.get(id);
        if (!point) return null;
        return {
          id: String(point.id),
          vector: point.vector,
          payload: point.payload,
        };
      });
    } catch (error) {
      // Log fetch failure for debugging - return nulls as fallback
      log.warn("Failed to fetch points by IDs", {
        collection: this.currentCollection,
        idCount: ids.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return ids.map(() => null);
    }
  }

  async update(id: string, payload: Record<string, unknown>): Promise<void> {
    await this.request(
      "POST",
      `/collections/${this.currentCollection}/points/payload`,
      {
        points: [id],
        payload,
      }
    );
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.request(
      "POST",
      `/collections/${this.currentCollection}/points/delete`,
      {
        points: ids,
      }
    );
  }

  async deleteWhere(filter: Record<string, unknown>): Promise<number> {
    const qdrantFilter = this.buildFilter(filter);
    if (!qdrantFilter.must?.length) return 0;

    // First count matching points
    const scrollResult = await this.request<QdrantScrollResult>(
      "POST",
      `/collections/${this.currentCollection}/points/scroll`,
      {
        filter: qdrantFilter,
        limit: 10000,
        with_payload: false,
      }
    );

    const count = scrollResult.points?.length ?? 0;
    if (count === 0) return 0;

    // Delete by filter
    await this.request(
      "POST",
      `/collections/${this.currentCollection}/points/delete`,
      {
        filter: qdrantFilter,
      }
    );

    return count;
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    const qdrantFilter = filter ? this.buildFilter(filter) : undefined;

    const result = await this.request<{ count: number }>(
      "POST",
      `/collections/${this.currentCollection}/points/count`,
      {
        filter: qdrantFilter?.must?.length ? qdrantFilter : undefined,
        exact: true,
      }
    );

    return result.count ?? 0;
  }

  /**
   * Build Qdrant filter from generic filter object
   */
  private buildFilter(filter?: Record<string, unknown>): QdrantFilter {
    if (!filter) return { must: [] };

    const must: QdrantCondition[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined || value === null) continue;

      if (typeof value === "object" && !Array.isArray(value)) {
        // Range filter
        const range = value as { lt?: number; gt?: number; lte?: number; gte?: number };
        if (range.lt !== undefined || range.gt !== undefined ||
            range.lte !== undefined || range.gte !== undefined) {
          must.push({ key, range });
        }
      } else {
        // Exact match
        must.push({ key, match: { value: value as string | number } });
      }
    }

    return { must };
  }

  /**
   * Set the current collection for operations
   */
  setCollection(name: string): void {
    this.currentCollection = name;
  }

  /**
   * Get current collection name
   */
  getCollection(): string {
    return this.currentCollection;
  }
}

// =============================================================================
// High-Level Memory Store
// =============================================================================

/**
 * Memory categories for organizing entries.
 * Extends the base MemoryCategory from types.ts with additional categories.
 */
export type QdrantMemoryCategory = TypesMemoryCategory | "contact" | "reminder" | "context";

/**
 * Memory source - how the memory was created
 */
export type MemorySource = "agent" | "auto" | "user";

/**
 * A single memory entry for Qdrant store
 */
export interface QdrantMemory {
  id: string;
  content: string;
  category: QdrantMemoryCategory;
  source: MemorySource;
  sessionId?: string;
  senderId: string;
  namespace?: string;
  confidence: number;
  createdAt: number;
  updatedAt: number;
  accessedAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Memory with similarity score from search
 */
export interface QdrantMemorySearchResult extends QdrantMemory {
  score: number;
}

/**
 * Options for searching memories
 */
export interface QdrantMemorySearchOptions {
  limit?: number;
  category?: QdrantMemoryCategory;
  senderId?: string;
  namespace?: string;
  minScore?: number;
}

/**
 * Options for listing memories
 */
export interface QdrantMemoryListOptions {
  senderId?: string;
  category?: QdrantMemoryCategory;
  namespace?: string;
  limit?: number;
  offset?: number;
}

/**
 * Input for saving a new memory
 */
export interface QdrantMemorySaveInput {
  content: string;
  category: QdrantMemoryCategory;
  source: MemorySource;
  sessionId?: string;
  senderId?: string;
  namespace?: string;
  confidence?: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Memory store interface for Qdrant-based storage
 */
export interface QdrantMemoryStoreInterface {
  init(): Promise<void>;
  save(input: QdrantMemorySaveInput): Promise<QdrantMemory>;
  search(query: string, opts?: QdrantMemorySearchOptions): Promise<QdrantMemorySearchResult[]>;
  get(id: string): Promise<QdrantMemory | null>;
  delete(id: string): Promise<boolean>;
  deleteExpired(): Promise<number>;
  list(opts?: QdrantMemoryListOptions): Promise<QdrantMemory[]>;
}

/**
 * High-level memory store using Qdrant for vector storage
 */
export class QdrantMemoryStore implements QdrantMemoryStoreInterface {
  private readonly storage: QdrantVectorStorage;
  private readonly embedder: EmbeddingProvider;
  private readonly collection: string;
  private initialized = false;

  constructor(
    config: MemoryConfig["qdrant"],
    embedder: EmbeddingProvider
  ) {
    this.storage = new QdrantVectorStorage(config);
    this.embedder = embedder;
    this.collection = config.collection ?? "agent_memories";
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.storage.createCollection(this.collection, this.embedder.dimension);
    this.storage.setCollection(this.collection);
    this.initialized = true;
  }

  async save(input: QdrantMemorySaveInput): Promise<QdrantMemory> {
    await this.init();

    const id = crypto.randomUUID();
    const now = Date.now();

    const memory: QdrantMemory = {
      id,
      content: input.content,
      category: input.category,
      source: input.source,
      sessionId: input.sessionId,
      senderId: input.senderId ?? "global",
      namespace: input.namespace,
      confidence: input.confidence ?? 1.0,
      createdAt: now,
      updatedAt: now,
      accessedAt: now,
      expiresAt: input.expiresAt,
      metadata: input.metadata,
    };

    const embedding = await this.embedder.embed(memory.content);

    await this.storage.insert([
      {
        id,
        vector: embedding,
        payload: memory as unknown as Record<string, unknown>,
      },
    ]);

    return memory;
  }

  async search(
    query: string,
    opts?: QdrantMemorySearchOptions
  ): Promise<QdrantMemorySearchResult[]> {
    await this.init();

    const embedding = await this.embedder.embed(query);
    const filter: Record<string, unknown> = {};

    if (opts?.category) filter.category = opts.category;
    if (opts?.senderId) filter.senderId = opts.senderId;
    if (opts?.namespace) filter.namespace = opts.namespace;

    const results = await this.storage.search(embedding, {
      limit: opts?.limit ?? 5,
      threshold: opts?.minScore,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    });

    return results.map((r) => ({
      ...(r.payload as unknown as QdrantMemory),
      score: r.score,
    }));
  }

  async get(id: string): Promise<QdrantMemory | null> {
    await this.init();

    const results = await this.storage.get([id]);
    const point = results[0];
    if (!point) return null;
    return point.payload as unknown as QdrantMemory;
  }

  async delete(id: string): Promise<boolean> {
    await this.init();

    try {
      await this.storage.delete([id]);
      return true;
    } catch (error) {
      log.warn("Failed to delete memory", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async deleteExpired(): Promise<number> {
    await this.init();

    const now = Date.now();
    return await this.storage.deleteWhere({
      expiresAt: { lt: now, gt: 0 },
    });
  }

  async list(opts?: QdrantMemoryListOptions): Promise<QdrantMemory[]> {
    await this.init();

    // Use scroll for listing with filters
    const filter: Record<string, unknown> = {};
    if (opts?.senderId) filter.senderId = opts.senderId;
    if (opts?.category) filter.category = opts.category;
    if (opts?.namespace) filter.namespace = opts.namespace;

    // For list, we need to use scroll endpoint
    const qdrantFilter = Object.keys(filter).length > 0 ? this.buildQdrantFilter(filter) : undefined;

    const response = await this.scrollPoints(
      qdrantFilter,
      opts?.limit ?? 20,
      opts?.offset
    );

    return response.map((p) => p.payload as unknown as QdrantMemory);
  }

  private buildQdrantFilter(filter: Record<string, unknown>): QdrantFilter {
    const must: QdrantCondition[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined || value === null) continue;
      must.push({ key, match: { value: value as string | number } });
    }

    return { must };
  }

  private async scrollPoints(
    filter?: QdrantFilter,
    limit = 20,
    offset?: number
  ): Promise<Array<{ id: string; payload: Record<string, unknown> }>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Access private members through storage - this is a bit hacky but works
    const storage = this.storage as unknown as {
      baseUrl: string;
      apiKey?: string;
      currentCollection: string;
    };

    if (storage.apiKey) {
      headers["api-key"] = storage.apiKey;
    }

    const response = await fetch(
      `${storage.baseUrl}/collections/${storage.currentCollection}/points/scroll`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          filter: filter?.must?.length ? filter : undefined,
          limit,
          offset,
          with_payload: true,
          order_by: {
            key: "createdAt",
            direction: "desc",
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Qdrant scroll failed: ${response.status}`);
    }

    const data = (await response.json()) as { result?: QdrantScrollResult };
    return data.result?.points ?? [];
  }
}
