/**
 * Memory Operations Statistics
 *
 * Tracks embedding and reranking operations for visibility in the TUI.
 * Uses a simple event bus to publish stats updates.
 */

import { Bus } from "../../packages/agent-core/src/bus";
import { BusEvent } from "../../packages/agent-core/src/bus/bus-event";
import z from "zod";

// =============================================================================
// Types
// =============================================================================

export interface MemoryOpStats {
  /** Embedding operations */
  embedding: {
    /** Total embedding calls this session */
    calls: number;
    /** Estimated tokens (chars / 4) */
    estimatedTokens: number;
    /** Last operation timestamp */
    lastCallAt?: number;
    /** Provider ID (google, openai, voyage, etc.) */
    provider?: string;
  };
  /** Reranking operations */
  reranking: {
    /** Total rerank calls this session */
    calls: number;
    /** Last operation timestamp */
    lastCallAt?: number;
    /** Provider ID (voyage, vllm) */
    provider?: string;
  };
}

// =============================================================================
// State
// =============================================================================

const stats: MemoryOpStats = {
  embedding: {
    calls: 0,
    estimatedTokens: 0,
  },
  reranking: {
    calls: 0,
  },
};

// =============================================================================
// Events
// =============================================================================

export const MemoryStatsEvent = {
  Updated: BusEvent.define(
    "memory.stats.updated",
    z.object({
      embedding: z.object({
        calls: z.number(),
        estimatedTokens: z.number(),
        lastCallAt: z.number().optional(),
        provider: z.string().optional(),
      }),
      reranking: z.object({
        calls: z.number(),
        lastCallAt: z.number().optional(),
        provider: z.string().optional(),
      }),
    })
  ),
};

// =============================================================================
// Recording Functions
// =============================================================================

/**
 * Record an embedding operation
 */
export function recordEmbedding(input: {
  texts: string[];
  provider?: string;
}): void {
  const charCount = input.texts.reduce((sum, t) => sum + t.length, 0);
  const estimatedTokens = Math.ceil(charCount / 4);

  stats.embedding.calls += 1;
  stats.embedding.estimatedTokens += estimatedTokens;
  stats.embedding.lastCallAt = Date.now();
  if (input.provider) {
    stats.embedding.provider = input.provider;
  }

  publishStats();
}

/**
 * Record a single embedding operation
 */
export function recordSingleEmbedding(input: {
  text: string;
  provider?: string;
}): void {
  recordEmbedding({ texts: [input.text], provider: input.provider });
}

/**
 * Record a reranking operation
 */
export function recordReranking(input: {
  provider?: string;
}): void {
  stats.reranking.calls += 1;
  stats.reranking.lastCallAt = Date.now();
  if (input.provider) {
    stats.reranking.provider = input.provider;
  }

  publishStats();
}

/**
 * Get current stats (read-only copy)
 */
export function getStats(): MemoryOpStats {
  return {
    embedding: { ...stats.embedding },
    reranking: { ...stats.reranking },
  };
}

/**
 * Reset stats (for testing or session boundaries)
 */
export function resetStats(): void {
  stats.embedding = {
    calls: 0,
    estimatedTokens: 0,
  };
  stats.reranking = {
    calls: 0,
  };
  publishStats();
}

/**
 * Format stats for display
 */
export function formatStats(): string {
  const parts: string[] = [];

  if (stats.embedding.calls > 0) {
    parts.push(`emb: ${stats.embedding.estimatedTokens}tok`);
  }

  if (stats.reranking.calls > 0) {
    parts.push(`rerank: ${stats.reranking.calls}`);
  }

  return parts.join(" | ") || "no memory ops";
}

/**
 * Format stats for compact display (status bar)
 */
export function formatStatsCompact(): string | null {
  const parts: string[] = [];

  if (stats.embedding.estimatedTokens > 0) {
    const tokens = stats.embedding.estimatedTokens;
    const display = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
    parts.push(`E:${display}`);
  }

  if (stats.reranking.calls > 0) {
    parts.push(`R:${stats.reranking.calls}`);
  }

  return parts.length > 0 ? parts.join("/") : null;
}

// =============================================================================
// Internal
// =============================================================================

function publishStats(): void {
  // Defer the publish to avoid errors when Bus/Instance is not initialized
  // This is safe because stats are read synchronously when needed
  queueMicrotask(() => {
    try {
      Bus.publish(MemoryStatsEvent.Updated, {
        embedding: { ...stats.embedding },
        reranking: { ...stats.reranking },
      }).catch(() => {
        // Promise rejection (async)
      });
    } catch {
      // Synchronous error (Instance context not available)
    }
  });
}
