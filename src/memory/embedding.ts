/**
 * Embedding client for generating vector representations of text.
 * Supports OpenAI, Google, Voyage, Ollama, vLLM, and local (OpenAI-compatible) providers.
 *
 * Includes LRU caching to avoid redundant API calls.
 *
 * Ported from zee to agent-core for unified memory layer.
 */

import * as crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
// Provider Auth Lookup
// =============================================================================

type StoredAuthEntry = {
  type?: string;
  key?: string;
  access?: string;
};

function readAuthStoreApiKey(providerId: string): string | undefined {
  const dataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  const authPath = path.join(dataHome, "agent-core", "auth.json");

  try {
    const raw = fs.readFileSync(authPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, StoredAuthEntry>;
    const entry = parsed?.[providerId];
    if (!entry) return undefined;
    if (entry.type === "api" && typeof entry.key === "string" && entry.key.trim()) {
      return entry.key.trim();
    }
    if (entry.type === "oauth" && typeof entry.access === "string" && entry.access.trim()) {
      return entry.access.trim();
    }
  } catch {
    return undefined;
  }

  return undefined;
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
  dimension: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly dimensionsParam?: number;

  constructor(config: EmbeddingConfig) {
    const resolvedBaseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(
      /\/$/,
      ""
    );
    const isNebius = resolvedBaseUrl.includes("nebius.com");
    const nebiusAuthKey = isNebius ? readAuthStoreApiKey("nebius") : undefined;
    this.apiKey = isNebius
      ? nebiusAuthKey ?? ""
      : config.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.model = config.model ?? "text-embedding-3-small";
    this.dimensionsParam =
      typeof config.dimensions === "number" ? config.dimensions : undefined;
    this.dimension = this.dimensionsParam ?? 1536;
    this.baseUrl = resolvedBaseUrl;

    if (!this.apiKey) {
      if (isNebius) {
        throw new Error(
          "Nebius API key required: run `agent-core auth login` and select nebius."
        );
      }
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

    const body: {
      model: string;
      input: string[];
      dimensions?: number;
    } = {
      model: this.model,
      input: texts,
    };

    if (this.dimensionsParam) {
      body.dimensions = this.dimensionsParam;
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
    if (!this.dimensionsParam && sorted.length > 0) {
      const length = sorted[0]?.embedding.length ?? 0;
      if (length > 0) this.dimension = length;
    }
    return sorted.map((item) => item.embedding);
  }
}

/**
 * Google embedding client using Generative Language API
 */
class GoogleEmbeddingProvider implements EmbeddingProvider {
  readonly id = "google";
  readonly model: string;
  dimension: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly outputDimensionality?: number;

  constructor(config: EmbeddingConfig) {
    this.apiKey =
      config.apiKey ??
      process.env.GOOGLE_API_KEY ??
      process.env.GEMINI_API_KEY ??
      "";
    this.model = config.model ?? "text-embedding-004";
    this.outputDimensionality =
      typeof config.dimensions === "number" ? config.dimensions : undefined;
    this.dimension = this.outputDimensionality ?? 768;
    this.baseUrl = (config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(
      /\/$/,
      ""
    );

    if (!this.apiKey) {
      throw new Error(
        "Google API key required: set embedding.apiKey or GOOGLE_API_KEY/GEMINI_API_KEY env"
      );
    }
  }

  private resolveModel(): string {
    return this.model.startsWith("models/") ? this.model : `models/${this.model}`;
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.embedBatch([text]);
    return result[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const model = this.resolveModel();
    const requests = texts.map((text) => {
      const request: {
        model: string;
        content: { parts: Array<{ text: string }> };
        outputDimensionality?: number;
      } = {
        model,
        content: { parts: [{ text }] },
      };
      if (this.outputDimensionality) {
        request.outputDimensionality = this.outputDimensionality;
      }
      return request;
    });

    const response = await fetch(
      `${this.baseUrl}/${model}:batchEmbedContents?key=${encodeURIComponent(
        this.apiKey
      )}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Google embedding failed (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as {
      embeddings?: Array<{ values?: number[] }>;
    };

    const vectors = (data.embeddings ?? []).map((item) => item.values ?? []);
    if (vectors.length === 0) {
      throw new Error("Google embedding returned no vectors");
    }
    if (!this.outputDimensionality && vectors.length > 0) {
      const length = vectors[0]?.length ?? 0;
      if (length > 0) this.dimension = length;
    }
    return vectors;
  }
}

/**
 * vLLM embedding client using OpenAI-compatible API
 */
class VLLMEmbeddingProvider implements EmbeddingProvider {
  readonly id = "vllm";
  readonly model: string;
  dimension: number;
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
  dimension: number;
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
  dimension: number;
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
  dimension: number;
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
    case "google":
      provider = new GoogleEmbeddingProvider(config);
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
  GoogleEmbeddingProvider,
  VoyageEmbeddingProvider,
  VLLMEmbeddingProvider,
  OllamaEmbeddingProvider,
  LocalEmbeddingProvider,
  CachedEmbeddingProvider,
};
