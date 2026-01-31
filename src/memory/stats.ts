/**
 * Embedding Model Configuration
 *
 * Provides embedding model limits and configuration.
 * Max context is determined by the embedding model being used.
 */

// =============================================================================
// Embedding Model Limits
// =============================================================================

/**
 * Max input tokens for known embedding models.
 * Source: Model documentation and API specifications.
 */
export const EMBEDDING_MODEL_LIMITS: Record<string, number> = {
  // Google
  "gemini-embedding-001": 2048,
  "text-embedding-004": 2048,
  // OpenAI
  "text-embedding-3-large": 8191,
  "text-embedding-3-small": 8191,
  "text-embedding-ada-002": 8191,
  // Voyage
  "voyage-3-large": 32000,
  "voyage-3": 32000,
  "voyage-3-lite": 32000,
  // Cohere
  "embed-english-v3.0": 512,
  "embed-multilingual-v3.0": 512,
};

/** Default max context when model is unknown */
export const DEFAULT_EMBEDDING_MAX_CONTEXT = 2048;

/**
 * Get the max input tokens for an embedding model.
 */
export function getEmbeddingMaxContext(model?: string): number {
  if (!model) return DEFAULT_EMBEDDING_MAX_CONTEXT;
  return EMBEDDING_MODEL_LIMITS[model] ?? DEFAULT_EMBEDDING_MAX_CONTEXT;
}

// =============================================================================
// Current Embedding Model State
// =============================================================================

let currentEmbeddingModel: string | undefined;

/**
 * Set the current embedding model being used.
 * Called by the embedding provider when initialized.
 */
export function setCurrentEmbeddingModel(model: string): void {
  currentEmbeddingModel = model;
}

/**
 * Get the current embedding model.
 */
export function getCurrentEmbeddingModel(): string | undefined {
  return currentEmbeddingModel;
}

/**
 * Get the max context for the current embedding model.
 */
export function getCurrentEmbeddingMaxContext(): number {
  return getEmbeddingMaxContext(currentEmbeddingModel);
}
