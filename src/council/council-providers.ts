/**
 * Provider abstraction for the LLM Council.
 *
 * This is a thin wrapper around OpenCode's Provider system.
 * All orchestration techniques (Council, Swarm, HiveMind) should use this.
 */

import type {
  CouncilProviderType,
  CouncilProviderConfig,
  LLMMember,
} from "./council-types.js";

// Import OpenCode's Provider
// Relative path from src/council/ to packages/agent-core/src/provider/
import { Provider } from "../../packages/agent-core/src/provider/provider.js";

// ─────────────────────────────────────────────────────────────────────────────
// Provider Interface (maintained for compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for a completion request.
 */
export interface CompletionOptions {
  /** System prompt */
  systemPrompt?: string;
  /** Temperature (0-1) */
  temperature?: number;
  /** Max output tokens */
  maxTokens?: number;
  /** Timeout in ms */
  timeoutMs?: number;
  /** Additional metadata to pass through */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a completion request.
 */
export interface CompletionResult {
  /** The generated response text */
  text: string;
  /** Token usage statistics */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Time taken in ms */
  durationMs: number;
  /** Model that was actually used (may differ from requested) */
  model?: string;
  /** Any warnings or notices */
  warnings?: string[];
}

/**
 * Abstract interface for council providers.
 */
export interface CouncilProvider {
  /** Provider type identifier */
  readonly type: CouncilProviderType;
  /** Human-readable name */
  readonly name: string;

  /**
   * Send a completion request to the provider.
   */
  complete(prompt: string, options?: CompletionOptions): Promise<CompletionResult>;

  /**
   * Check if the provider is configured and ready.
   */
  isConfigured(): Promise<boolean>;

  /**
   * List available models for this provider.
   */
  listModels?(): Promise<string[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenCode Provider Wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps CouncilProviderType to OpenCode provider IDs.
 */
const PROVIDER_TYPE_MAP: Record<CouncilProviderType, string> = {
  openrouter: "openrouter",
  opencode_zen: "opencode",
  google_antigravity: "google-antigravity",
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  zai: "zai",
  custom: "openai", // Custom uses OpenAI-compatible
};

/**
 * Wrapper that adapts OpenCode's Provider to the CouncilProvider interface.
 */
class OpenCodeProviderWrapper implements CouncilProvider {
  readonly type: CouncilProviderType;
  readonly name: string;

  constructor(
    private readonly providerId: string,
    private readonly model: string,
    type: CouncilProviderType,
    name: string,
  ) {
    this.type = type;
    this.name = name;
  }

  async complete(
    prompt: string,
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    const startTime = Date.now();

    try {
      // Get the model info, then the language model from OpenCode's Provider
      const modelInfo = await Provider.getModel(this.providerId, this.model);
      const languageModel = await Provider.getLanguage(modelInfo);

      // Build messages
      const messages: Array<{ role: "system" | "user"; content: string }> = [];
      if (options?.systemPrompt) {
        messages.push({ role: "system", content: options.systemPrompt });
      }
      messages.push({ role: "user", content: prompt });

      // Use the Vercel AI SDK's generateText
      const { generateText } = await import("ai");

      const result = await generateText({
        model: languageModel as any, // LanguageModelV2 is compatible
        messages,
        temperature: options?.temperature ?? 0.7,
        maxTokens: options?.maxTokens ?? 4096,
        abortSignal: options?.timeoutMs
          ? AbortSignal.timeout(options.timeoutMs)
          : undefined,
      });

      return {
        text: result.text,
        usage: result.usage
          ? {
              inputTokens: result.usage.promptTokens,
              outputTokens: result.usage.completionTokens,
              totalTokens: result.usage.totalTokens,
            }
          : undefined,
        durationMs: Date.now() - startTime,
        model: this.model,
      };
    } catch (error) {
      const err = error as Error;
      throw new Error(`${this.name} error: ${err.message}`);
    }
  }

  async isConfigured(): Promise<boolean> {
    try {
      const provider = await Provider.getProvider(this.providerId);
      return provider !== undefined;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const models = await Provider.list();
      return models
        .filter((m) => m.provider === this.providerId)
        .map((m) => m.id);
    } catch {
      return [];
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default base URLs for reference (OpenCode Provider handles these internally).
 */
export const PROVIDER_BASE_URLS: Record<CouncilProviderType, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  opencode_zen: "https://opencode.ai/zen/v1",
  google_antigravity: "https://antigravity.opencode.ai/v1",
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  zai: "https://api.zai.one/v1",
  custom: "",
};

/**
 * Default environment variable names for API keys.
 * OpenCode Provider handles key resolution internally.
 */
export const PROVIDER_ENV_VARS: Record<CouncilProviderType, string> = {
  openrouter: "OPENROUTER_API_KEY",
  opencode_zen: "OPENCODE_ZEN_API_KEY",
  google_antigravity: "GOOGLE_OAUTH_TOKEN",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  zai: "ZAI_API_KEY",
  custom: "",
};

/**
 * Resolve API key from config or environment.
 * Kept for compatibility - OpenCode Provider handles this internally.
 */
export function resolveApiKey(config: CouncilProviderConfig): string | undefined {
  if (config.apiKey) {
    return config.apiKey;
  }
  if (config.apiKeyEnv) {
    return process.env[config.apiKeyEnv];
  }
  const defaultEnv = PROVIDER_ENV_VARS[config.type];
  if (defaultEnv) {
    return process.env[defaultEnv];
  }
  return undefined;
}

/**
 * Get human-readable name for a provider type.
 */
function getProviderName(type: CouncilProviderType): string {
  const names: Record<CouncilProviderType, string> = {
    openrouter: "OpenRouter",
    opencode_zen: "OpenCode Zen",
    google_antigravity: "Google Antigravity",
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google Gemini",
    zai: "ZAI",
    custom: "Custom",
  };
  return names[type];
}

/**
 * Create a provider instance for an LLM council member.
 * Uses OpenCode's Provider system under the hood.
 */
export function createProviderForMember(
  member: LLMMember,
  _defaultConfig?: CouncilProviderConfig,
): CouncilProvider {
  const providerType = member.provider;
  const model = member.modelRoute ?? member.model;
  const providerId = PROVIDER_TYPE_MAP[providerType];

  return new OpenCodeProviderWrapper(
    providerId,
    model,
    providerType,
    member.displayName ?? getProviderName(providerType),
  );
}

/**
 * Create providers for all LLM members in a council.
 */
export function createProvidersForCouncil(
  members: LLMMember[],
  defaultConfig?: CouncilProviderConfig,
): Map<string, CouncilProvider> {
  const providers = new Map<string, CouncilProvider>();

  for (const member of members) {
    providers.set(member.id, createProviderForMember(member, defaultConfig));
  }

  return providers;
}
