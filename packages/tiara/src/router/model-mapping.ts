/**
 * Model ID Mapping
 *
 * Cross-provider model ID translation for multi-provider support.
 * Different providers use different model ID formats:
 * - Anthropic: "claude-sonnet-4-5-20250929" (dated releases)
 * - OpenRouter: "anthropic/claude-sonnet-4.5" (vendor/model format)
 * - AWS Bedrock: "anthropic.claude-sonnet-4-5-v2:0" (ARN-style)
 *
 * Ported from claude-flow v3 @agentic-flow/router
 *
 * @module tiara/router/model-mapping
 */

import type { ModelMapping, ModelFamily, ModelCapabilities } from "./types.js";

// =============================================================================
// Model Mappings
// =============================================================================

/**
 * Claude model mappings
 */
export const CLAUDE_MODELS: Record<string, ModelMapping> = {
  // Claude Opus 4.5 (Latest flagship)
  "claude-opus-4.5": {
    anthropic: "claude-opus-4-5-20251101",
    openrouter: "anthropic/claude-opus-4.5",
    bedrock: "anthropic.claude-opus-4-5-v1:0",
    canonical: "Claude Opus 4.5",
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: true,
      supportsVision: true,
      maxContextLength: 200000,
      maxOutputTokens: 32000,
    },
  },

  // Claude Sonnet 4.5
  "claude-sonnet-4.5": {
    anthropic: "claude-sonnet-4-5-20250929",
    openrouter: "anthropic/claude-sonnet-4.5",
    bedrock: "anthropic.claude-sonnet-4-5-v2:0",
    canonical: "Claude Sonnet 4.5",
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: true,
      supportsVision: true,
      maxContextLength: 200000,
      maxOutputTokens: 16000,
    },
  },

  // Claude Sonnet 4
  "claude-sonnet-4": {
    anthropic: "claude-sonnet-4-20250514",
    openrouter: "anthropic/claude-sonnet-4",
    bedrock: "anthropic.claude-sonnet-4-v1:0",
    canonical: "Claude Sonnet 4",
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: true,
      supportsVision: true,
      maxContextLength: 200000,
      maxOutputTokens: 16000,
    },
  },

  // Claude 3.7 Sonnet
  "claude-3.7-sonnet": {
    anthropic: "claude-3-7-sonnet-20250219",
    openrouter: "anthropic/claude-3.7-sonnet",
    canonical: "Claude 3.7 Sonnet",
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: true,
      supportsVision: true,
      maxContextLength: 200000,
      maxOutputTokens: 8192,
    },
  },

  // Claude 3.5 Sonnet
  "claude-3.5-sonnet": {
    anthropic: "claude-3-5-sonnet-20241022",
    openrouter: "anthropic/claude-3.5-sonnet-20241022",
    bedrock: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    canonical: "Claude 3.5 Sonnet",
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: true,
      supportsVision: true,
      maxContextLength: 200000,
      maxOutputTokens: 8192,
    },
  },

  // Claude 3.5 Haiku
  "claude-3.5-haiku": {
    anthropic: "claude-3-5-haiku-20241022",
    openrouter: "anthropic/claude-3.5-haiku-20241022",
    canonical: "Claude 3.5 Haiku",
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: true,
      supportsVision: true,
      maxContextLength: 200000,
      maxOutputTokens: 8192,
    },
  },

  // Claude 3 Opus
  "claude-3-opus": {
    anthropic: "claude-3-opus-20240229",
    openrouter: "anthropic/claude-3-opus",
    bedrock: "anthropic.claude-3-opus-20240229-v1:0",
    canonical: "Claude 3 Opus",
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: true,
      supportsVision: true,
      maxContextLength: 200000,
      maxOutputTokens: 4096,
    },
  },
};

/**
 * GPT model mappings
 */
export const GPT_MODELS: Record<string, ModelMapping> = {
  "gpt-4o": {
    anthropic: "gpt-4o", // Not native, pass-through
    openrouter: "openai/gpt-4o",
    canonical: "GPT-4o",
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: false,
      supportsVision: true,
      maxContextLength: 128000,
      maxOutputTokens: 16384,
    },
  },

  "gpt-4o-mini": {
    anthropic: "gpt-4o-mini",
    openrouter: "openai/gpt-4o-mini",
    canonical: "GPT-4o Mini",
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: false,
      supportsVision: true,
      maxContextLength: 128000,
      maxOutputTokens: 16384,
    },
  },

  "gpt-4-turbo": {
    anthropic: "gpt-4-turbo",
    openrouter: "openai/gpt-4-turbo",
    canonical: "GPT-4 Turbo",
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: false,
      supportsVision: true,
      maxContextLength: 128000,
      maxOutputTokens: 4096,
    },
  },
};

/**
 * Gemini model mappings
 */
export const GEMINI_MODELS: Record<string, ModelMapping> = {
  "gemini-2.0-flash": {
    anthropic: "gemini-2.0-flash",
    openrouter: "google/gemini-2.0-flash-exp",
    canonical: "Gemini 2.0 Flash",
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: false,
      supportsVision: true,
      maxContextLength: 1000000,
      maxOutputTokens: 8192,
    },
  },

  "gemini-1.5-pro": {
    anthropic: "gemini-1.5-pro",
    openrouter: "google/gemini-pro-1.5",
    canonical: "Gemini 1.5 Pro",
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMCP: false,
      supportsVision: true,
      maxContextLength: 2000000,
      maxOutputTokens: 8192,
    },
  },
};

/**
 * All model mappings combined
 */
export const ALL_MODELS: Record<string, ModelMapping> = {
  ...CLAUDE_MODELS,
  ...GPT_MODELS,
  ...GEMINI_MODELS,
};

// =============================================================================
// Mapping Functions
// =============================================================================

/**
 * Map a model ID from one provider format to another
 *
 * @param modelId - Source model ID
 * @param targetProvider - Target provider format
 * @returns Mapped model ID
 *
 * @example
 * mapModelId('claude-sonnet-4-5-20250929', 'openrouter')
 * // Returns: 'anthropic/claude-sonnet-4.5'
 *
 * mapModelId('anthropic/claude-sonnet-4.5', 'anthropic')
 * // Returns: 'claude-sonnet-4-5-20250929'
 */
export function mapModelId(
  modelId: string,
  targetProvider: "anthropic" | "openrouter" | "bedrock"
): string {
  // If already in correct format, return as-is
  if (targetProvider === "anthropic" && modelId.startsWith("claude-")) {
    // Check if it's already an Anthropic API ID (has date like 20250929)
    if (/claude-.*-\d{8}/.test(modelId)) {
      return modelId;
    }
  }

  if (targetProvider === "openrouter" && modelId.includes("/")) {
    return modelId;
  }

  if (targetProvider === "bedrock" && modelId.includes(".")) {
    return modelId;
  }

  // Try to find exact mapping
  for (const [canonical, mapping] of Object.entries(ALL_MODELS)) {
    if (
      modelId === mapping.anthropic ||
      modelId === mapping.openrouter ||
      modelId === mapping.bedrock ||
      modelId === canonical
    ) {
      const mapped = mapping[targetProvider];
      if (mapped) {
        return mapped;
      }
    }
  }

  // Try to convert format algorithmically
  if (targetProvider === "openrouter") {
    // Convert Anthropic format to OpenRouter format
    // claude-sonnet-4-5-20250929 -> anthropic/claude-sonnet-4.5
    if (modelId.startsWith("claude-")) {
      const withoutDate = modelId.replace(/-\d{8}$/, "");
      // Try to find canonical for this
      for (const [canonical, mapping] of Object.entries(CLAUDE_MODELS)) {
        if (mapping.anthropic === modelId || mapping.anthropic.startsWith(withoutDate)) {
          return mapping.openrouter;
        }
      }
      // Fallback: construct OpenRouter format
      return `anthropic/${withoutDate}`;
    }
    if (modelId.startsWith("gpt-")) {
      return `openai/${modelId}`;
    }
    if (modelId.startsWith("gemini-")) {
      return `google/${modelId}`;
    }
  } else if (targetProvider === "anthropic") {
    // Convert OpenRouter format to Anthropic format
    if (modelId.startsWith("anthropic/")) {
      const withoutPrefix = modelId.replace("anthropic/", "");
      for (const mapping of Object.values(CLAUDE_MODELS)) {
        if (mapping.openrouter === modelId) {
          return mapping.anthropic;
        }
      }
      return withoutPrefix;
    }
    if (modelId.startsWith("openai/")) {
      return modelId.replace("openai/", "");
    }
    if (modelId.startsWith("google/")) {
      return modelId.replace("google/", "");
    }
  }

  // No conversion possible, return original
  return modelId;
}

/**
 * Get human-readable model name
 *
 * @param modelId - Model ID in any format
 * @returns Human-readable model name
 */
export function getModelName(modelId: string): string {
  for (const mapping of Object.values(ALL_MODELS)) {
    if (
      modelId === mapping.anthropic ||
      modelId === mapping.openrouter ||
      modelId === mapping.bedrock
    ) {
      return mapping.canonical;
    }
  }
  return modelId;
}

/**
 * Get model capabilities
 *
 * @param modelId - Model ID in any format
 * @returns Model capabilities or undefined if not found
 */
export function getModelCapabilities(modelId: string): Partial<ModelCapabilities> | undefined {
  for (const mapping of Object.values(ALL_MODELS)) {
    if (
      modelId === mapping.anthropic ||
      modelId === mapping.openrouter ||
      modelId === mapping.bedrock
    ) {
      return mapping.capabilities;
    }
  }
  return undefined;
}

/**
 * List all available model IDs for a provider
 *
 * @param provider - Target provider
 * @returns Array of model IDs
 */
export function listModels(provider: "anthropic" | "openrouter" | "bedrock"): string[] {
  return Object.values(ALL_MODELS)
    .map((m) => m[provider])
    .filter((id): id is string => id !== undefined);
}

/**
 * Get model family from model ID
 *
 * @param modelId - Model ID in any format
 * @returns Model family
 */
export function getModelFamily(modelId: string): ModelFamily {
  const lower = modelId.toLowerCase();

  if (lower.includes("claude")) return "claude";
  if (lower.includes("gpt")) return "gpt";
  if (lower.includes("gemini")) return "gemini";
  if (lower.includes("llama")) return "llama";
  if (lower.includes("mistral")) return "mistral";
  if (lower.includes("phi")) return "phi";

  return "other";
}

/**
 * Check if model supports a specific capability
 *
 * @param modelId - Model ID
 * @param capability - Capability to check
 * @returns True if model supports the capability
 */
export function modelSupports(
  modelId: string,
  capability: keyof ModelCapabilities
): boolean {
  const capabilities = getModelCapabilities(modelId);
  if (!capabilities) {
    // Unknown model, assume basic capabilities
    return capability === "supportsStreaming";
  }

  const value = capabilities[capability];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value > 0;
  }
  return false;
}

/**
 * Find models matching capabilities
 *
 * @param requirements - Required capabilities
 * @param provider - Optional provider filter
 * @returns Array of matching model IDs
 */
export function findModelsWithCapabilities(
  requirements: Partial<ModelCapabilities>,
  provider?: "anthropic" | "openrouter" | "bedrock"
): string[] {
  const results: string[] = [];

  for (const [canonical, mapping] of Object.entries(ALL_MODELS)) {
    if (!mapping.capabilities) continue;

    let matches = true;
    for (const [key, value] of Object.entries(requirements)) {
      const capKey = key as keyof ModelCapabilities;
      const capValue = mapping.capabilities[capKey];

      if (typeof value === "boolean" && capValue !== value) {
        matches = false;
        break;
      }
      if (typeof value === "number" && (capValue === undefined || capValue < value)) {
        matches = false;
        break;
      }
    }

    if (matches) {
      if (provider) {
        const modelId = mapping[provider];
        if (modelId) {
          results.push(modelId);
        }
      } else {
        results.push(canonical);
      }
    }
  }

  return results;
}
