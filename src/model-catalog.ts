/**
 * Model Catalog - Available LLM models for council deliberation
 *
 * This module provides a catalog of available models that can participate
 * in LLM Council sessions. Models are loaded from environment config and
 * available API keys.
 */

// Provider types matching council-types.ts
export type CouncilProviderType = "anthropic" | "openai" | "openrouter";

/**
 * A model entry in the catalog.
 */
export interface ModelCatalogEntry {
  /** Unique identifier (e.g., "claude-3-opus") */
  id: string;
  /** Provider type */
  provider: CouncilProviderType;
  /** Model ID for the provider API */
  model: string;
  /** OpenRouter-specific model route */
  modelRoute?: string;
  /** Human-readable display name */
  displayName: string;
  /** Model capabilities/specializations */
  capabilities?: string[];
  /** Whether model is available (has API key) */
  available: boolean;
}

/**
 * Load the model catalog based on available API keys.
 * Returns models that have valid credentials configured.
 */
export async function loadModelCatalog(): Promise<ModelCatalogEntry[]> {
  const catalog: ModelCatalogEntry[] = [];

  // Anthropic models (if API key available)
  if (process.env.ANTHROPIC_API_KEY) {
    catalog.push({
      id: "claude-opus-4",
      provider: "anthropic",
      model: "claude-opus-4-20250514",
      displayName: "Claude Opus 4",
      capabilities: ["reasoning", "analysis", "coding"],
      available: true,
    });
    catalog.push({
      id: "claude-sonnet-4",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      displayName: "Claude Sonnet 4",
      capabilities: ["balanced", "coding", "fast"],
      available: true,
    });
  }

  // OpenAI models (if API key available)
  if (process.env.OPENAI_API_KEY) {
    catalog.push({
      id: "gpt-4-turbo",
      provider: "openai",
      model: "gpt-4-turbo-preview",
      displayName: "GPT-4 Turbo",
      capabilities: ["reasoning", "coding"],
      available: true,
    });
    catalog.push({
      id: "gpt-4o",
      provider: "openai",
      model: "gpt-4o",
      displayName: "GPT-4o",
      capabilities: ["multimodal", "fast"],
      available: true,
    });
  }

  // OpenRouter models (if API key available)
  if (process.env.OPENROUTER_API_KEY) {
    catalog.push({
      id: "gemini-2-flash",
      provider: "openrouter",
      model: "google/gemini-2.0-flash-001",
      modelRoute: "google/gemini-2.0-flash-001",
      displayName: "Gemini 2.0 Flash",
      capabilities: ["multimodal", "fast"],
      available: true,
    });
    catalog.push({
      id: "deepseek-r1",
      provider: "openrouter",
      model: "deepseek/deepseek-r1",
      modelRoute: "deepseek/deepseek-r1",
      displayName: "DeepSeek R1",
      capabilities: ["reasoning", "coding"],
      available: true,
    });
  }

  return catalog;
}

/**
 * Get a specific model by ID.
 */
export async function getModel(id: string): Promise<ModelCatalogEntry | undefined> {
  const catalog = await loadModelCatalog();
  return catalog.find((m) => m.id === id);
}

/**
 * Filter models by provider.
 */
export async function getModelsByProvider(
  provider: CouncilProviderType
): Promise<ModelCatalogEntry[]> {
  const catalog = await loadModelCatalog();
  return catalog.filter((m) => m.provider === provider);
}
