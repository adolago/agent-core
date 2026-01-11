/**
 * Embedding client for generating vector representations of text.
 * Supports OpenAI, Ollama, vLLM, and local (OpenAI-compatible) providers.
 *
 * Includes LRU caching to avoid redundant API calls.
 *
 * Ported from zee to agent-core for unified memory layer.
 */

import * as crypto from "node:crypto";
import type { EmbeddingProvider, EmbeddingProviderType } from "./types";

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for embedding providers
 */
export interface EmbeddingConfig {
  /** Embedding provider type */
  provider?: EmbeddingProviderType;
  /** API key for the provider */
  apiKey?: string;
  /** Model name for embeddings */
  model?: string;
  /** Embedding dimensions */
  dimensions?: number;
  /** Base URL for the embedding API */
  baseUrl?: string;
}

// =============================================================================
// LRU Cache
// =============================================================================

/**
 * Simple LRU cache for embeddings
 */
class EmbeddingCache {
  private readonly cache = new Map<string, number[]>();
  private readonly maxSize: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  /** Hash text to create cache key */
  private hash(text: string): string {
    return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
  }

  get(text: string): number[] | undefined {
    const key = this.hash(text);
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      this.hits++;
      return value;
    }
    this.misses++;
    return undefined;
  }

  set(text: string, embedding: number[]): void {
    const key = this.hash(text);
    // Delete first to update insertion order
    this.cache.delete(key);
    this.cache.set(key, embedding);

    // Evict oldest entries if over capacity
    while (this.cache.size > this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hits, misses: this.misses, size: this.cache.size };
  }
}

// =============================================================================
// Provider Implementations
// =============================================================================

/**
 * OpenAI embedding client using REST API
 */
class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id = "openai";
  readonly model: string;
  readonly dimension: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: EmbeddingConfig) {
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.model = config.model ?? "text-embedding-3-small";
    this.dimension = config.dimensions ?? 1536;
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";

    if (!this.apiKey) {
      throw new Error(
        "OpenAI API key required: set embedding.apiKey or OPENAI_API_KEY env"
      );
    }
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.embedBatch([text]);
    return result[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimension,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI embedding failed (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to maintain order
    const sorted = data.data.sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }
}

/**
 * vLLM embedding client using OpenAI-compatible API
 */
class VLLMEmbeddingProvider implements EmbeddingProvider {
  readonly id = "vllm";
  readonly model: string;
  readonly dimension: number;
  private readonly baseUrl: string;

  constructor(config: EmbeddingConfig) {
    this.model = config.model ?? "BAAI/bge-base-en-v1.5";
    this.dimension = config.dimensions ?? 768;
    this.baseUrl = config.baseUrl ?? "http://localhost:8000/v1";
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.embedBatch([text]);
    return result[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `vLLM embedding failed (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    const sorted = data.data.sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }
}

/**
 * Ollama embedding client for local models
 */
class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly id = "ollama";
  readonly model: string;
  readonly dimension: number;
  private readonly baseUrl: string;

  constructor(config: EmbeddingConfig) {
    this.model = config.model ?? "nomic-embed-text";
    this.dimension = config.dimensions ?? 768;
    this.baseUrl = config.baseUrl ?? "http://localhost:11434";
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Ollama embedding failed (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as { embedding: number[] };
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    // Ollama doesn't support batch - parallelize with concurrency limit
    const concurrency = 5;
    const results: number[][] = new Array(texts.length);

    for (let i = 0; i < texts.length; i += concurrency) {
      const batch = texts.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map((t) => this.embed(t)));
      for (let j = 0; j < batchResults.length; j++) {
        results[i + j] = batchResults[j];
      }
    }
    return results;
  }
}

/**
 * Local embedding provider using OpenAI-compatible API
 * Works with TEI, sentence-transformers server, etc.
 */
class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id = "local";
  readonly model: string;
  readonly dimension: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: EmbeddingConfig) {
    this.apiKey = config.apiKey ?? "local";
    this.model = config.model ?? "all-MiniLM-L6-v2";
    this.dimension = config.dimensions ?? 384;
    this.baseUrl = config.baseUrl ?? "http://localhost:8080";
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.embedBatch([text]);
    return result[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // Support both /v1/embeddings (OpenAI-compatible) and /embeddings (TEI)
    const endpoint = this.baseUrl.includes("/v1")
      ? `${this.baseUrl}/embeddings`
      : `${this.baseUrl}/v1/embeddings`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Local embedding failed (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    const sorted = data.data.sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }
}

/**
 * Voyage AI embedding client
 * #1 on MTEB, 200M free tokens, supports query/document input types
 */
class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly id = "voyage";
  readonly model: string;
  readonly dimension: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: EmbeddingConfig) {
    this.apiKey = config.apiKey ?? process.env.VOYAGE_API_KEY ?? "";
    this.model = config.model ?? "voyage-3-large";
    this.dimension = config.dimensions ?? 1024;
    this.baseUrl = config.baseUrl ?? "https://api.voyageai.com/v1";

    if (!this.apiKey) {
      throw new Error(
        "Voyage API key required: set embedding.apiKey or VOYAGE_API_KEY env"
      );
    }
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.embedBatch([text]);
    return result[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        output_dimension: this.dimension,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Voyage embedding failed (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    const sorted = data.data.sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }
}

// =============================================================================
// Caching Wrapper
// =============================================================================

/**
 * Caching wrapper for any embedding provider
 */
class CachedEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimension: number;
  private readonly inner: EmbeddingProvider;
  private readonly cache: EmbeddingCache;

  constructor(inner: EmbeddingProvider, cacheSize = 1000) {
    this.inner = inner;
    this.cache = new EmbeddingCache(cacheSize);
    this.id = inner.id;
    this.model = inner.model;
    this.dimension = inner.dimension;
  }

  async embed(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached !== undefined) return cached;

    const embedding = await this.inner.embed(text);
    this.cache.set(text, embedding);
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // Check cache for each text
    const results: (number[] | null)[] = texts.map(
      (t) => this.cache.get(t) ?? null
    );
    const uncachedIndices = results
      .map((r, i) => (r === null ? i : -1))
      .filter((i) => i >= 0);

    if (uncachedIndices.length === 0) {
      // All cached
      return results as number[][];
    }

    // Fetch uncached embeddings
    const uncachedTexts = uncachedIndices.map((i) => texts[i]);
    const fetched = await this.inner.embedBatch(uncachedTexts);

    // Merge results and update cache
    for (let j = 0; j < uncachedIndices.length; j++) {
      const i = uncachedIndices[j];
      results[i] = fetched[j];
      this.cache.set(texts[i], fetched[j]);
    }

    return results as number[][];
  }

  clearCache(): void {
    this.cache.clear();
  }

  cacheStats(): { hits: number; misses: number; size: number } {
    return this.cache.stats();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an embedding provider based on configuration.
 * Defaults to OpenAI if provider not specified.
 * Includes LRU caching to avoid redundant API calls.
 */
export function createEmbeddingProvider(
  config: EmbeddingConfig,
  options?: { cacheSize?: number; noCache?: boolean }
): EmbeddingProvider {
  const providerType = config.provider ?? "openai";

  let provider: EmbeddingProvider;
  switch (providerType) {
    case "openai":
      provider = new OpenAIEmbeddingProvider(config);
      break;
    case "voyage":
      provider = new VoyageEmbeddingProvider(config);
      break;
    case "vllm":
      provider = new VLLMEmbeddingProvider(config);
      break;
    case "ollama":
      provider = new OllamaEmbeddingProvider(config);
      break;
    case "local":
      provider = new LocalEmbeddingProvider(config);
      break;
    default:
      throw new Error(`Unknown embedding provider: ${providerType}`);
  }

  // Wrap with cache unless disabled
  if (options?.noCache) {
    return provider;
  }
  return new CachedEmbeddingProvider(provider, options?.cacheSize ?? 1000);
}

// =============================================================================
// Exports
// =============================================================================

export {
  EmbeddingCache,
  OpenAIEmbeddingProvider,
  VoyageEmbeddingProvider,
  VLLMEmbeddingProvider,
  OllamaEmbeddingProvider,
  LocalEmbeddingProvider,
  CachedEmbeddingProvider,
};
