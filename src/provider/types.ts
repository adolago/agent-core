/**
 * Provider System Types
 *
 * Supports 15+ LLM providers with both API key and subscription-based auth
 * (Claude Max, ChatGPT Plus, GitHub Copilot, etc.)
 */

import type { LanguageModelV1 } from "ai";

/** Authentication methods supported by providers */
export type AuthMethod =
  | { type: "api_key"; key: string; env?: string[] }
  | { type: "oauth"; tokens: OAuthTokens }
  | { type: "subscription"; provider: SubscriptionProvider; tokens: OAuthTokens }
  | { type: "custom"; loader: () => Promise<Record<string, unknown>> };

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

/** Subscription-based authentication providers */
export type SubscriptionProvider =
  | "claude-max"
  | "chatgpt-plus"
  | "github-copilot"
  | "github-copilot-enterprise";

/** Provider source indicating how the provider was configured */
export type ProviderSource = "env" | "config" | "custom" | "api" | "plugin";

/** Model capabilities */
export interface ModelCapabilities {
  temperature: boolean;
  reasoning: boolean;
  attachment: boolean;
  toolcall: boolean;
  streaming: boolean;
  input: {
    text: boolean;
    audio: boolean;
    image: boolean;
    video: boolean;
    pdf: boolean;
  };
  output: {
    text: boolean;
    audio: boolean;
    image: boolean;
    video: boolean;
    pdf: boolean;
  };
  interleaved: boolean | { field: "reasoning_content" | "reasoning_details" };
}

/** Model cost structure */
export interface ModelCost {
  input: number;
  output: number;
  cache?: {
    read: number;
    write: number;
  };
  experimentalOver200K?: {
    input: number;
    output: number;
    cache?: { read: number; write: number };
  };
}

/** Model limits */
export interface ModelLimits {
  context: number;
  output: number;
}

/** Model definition */
export interface Model {
  id: string;
  providerID: string;
  name: string;
  family?: string;
  api: {
    id: string;
    url: string;
    npm: string;
  };
  status: "alpha" | "beta" | "deprecated" | "active";
  capabilities: ModelCapabilities;
  cost: ModelCost;
  limit: ModelLimits;
  options: Record<string, unknown>;
  headers: Record<string, string>;
  releaseDate: string;
}

/** Provider definition */
export interface ProviderInfo {
  id: string;
  name: string;
  source: ProviderSource;
  env: string[];
  auth?: AuthMethod;
  options: Record<string, unknown>;
  models: Record<string, Model>;
}

/** Provider SDK interface */
export interface ProviderSDK {
  languageModel(modelId: string): LanguageModelV1;
  chat?(modelId: string): LanguageModelV1;
  responses?(modelId: string): LanguageModelV1;
}

/** Custom model loader for providers with special instantiation */
export type ModelLoader = (
  sdk: ProviderSDK,
  modelId: string,
  options?: Record<string, unknown>
) => Promise<LanguageModelV1>;

/** Provider registry interface */
export interface ProviderRegistry {
  /** List all available providers */
  list(): Promise<Record<string, ProviderInfo>>;

  /** Get a specific provider */
  get(providerId: string): Promise<ProviderInfo | undefined>;

  /** Get a specific model */
  getModel(providerId: string, modelId: string): Promise<Model>;

  /** Get the language model instance for inference */
  getLanguage(model: Model): Promise<LanguageModelV1>;

  /** Get the default model based on config */
  defaultModel(): Promise<{ providerId: string; modelId: string }>;

  /** Get a small/fast model for auxiliary tasks (title generation, etc.) */
  getSmallModel(providerId: string): Promise<Model | undefined>;

  /** Register a custom provider */
  register(provider: ProviderInfo): Promise<void>;
}

/** Models.dev registry integration */
export interface ModelsDevRegistry {
  /** Fetch and cache models.dev data */
  fetch(): Promise<Record<string, ModelsDevProvider>>;

  /** Get cached data */
  get(): Record<string, ModelsDevProvider>;

  /** Check if refresh is needed */
  needsRefresh(): boolean;
}

export interface ModelsDevProvider {
  id: string;
  name: string;
  api?: string;
  npm?: string;
  env?: string[];
  models: Record<string, ModelsDevModel>;
}

export interface ModelsDevModel {
  id: string;
  name: string;
  family?: string;
  provider?: { npm?: string };
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
    context_over_200k?: {
      input: number;
      output: number;
      cache_read?: number;
      cache_write?: number;
    };
  };
  limit: { context: number; output: number };
  temperature: boolean;
  reasoning: boolean;
  attachment: boolean;
  tool_call: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  interleaved?: boolean;
  status?: "alpha" | "beta" | "deprecated" | "active";
  headers?: Record<string, string>;
  options?: Record<string, unknown>;
  release_date: string;
}
