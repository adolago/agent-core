import type { EmbeddingProviderType } from "../memory/types";

export type EmbeddingProfileConfig = {
  provider: EmbeddingProviderType;
  model: string;
  dimensions?: number;
  baseUrl?: string;
};

export const EMBEDDING_PROFILES: Record<string, EmbeddingProfileConfig> = {
  "openai/text-embedding-3-small": {
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 1536,
  },
  "openai/text-embedding-3-small-512": {
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 512,
  },
  "openai/text-embedding-3-small-1024": {
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 1024,
  },
  "openai/text-embedding-3-large": {
    provider: "openai",
    model: "text-embedding-3-large",
    dimensions: 3072,
  },
  "openai/text-embedding-3-large-1024": {
    provider: "openai",
    model: "text-embedding-3-large",
    dimensions: 1024,
  },
  "openai/text-embedding-3-large-1536": {
    provider: "openai",
    model: "text-embedding-3-large",
    dimensions: 1536,
  },
  "openai/text-embedding-ada-002": {
    provider: "openai",
    model: "text-embedding-ada-002",
    dimensions: 1536,
  },
  "google/text-embedding-004": {
    provider: "google",
    model: "text-embedding-004",
    dimensions: 768,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  "nebius/qwen3-embedding-8b": {
    provider: "nebius",
    model: "Qwen/Qwen3-Embedding-8B",
    dimensions: 4096,
    baseUrl: "https://api.tokenfactory.nebius.com/v1",
  },
  "voyage/voyage-3-large": {
    provider: "voyage",
    model: "voyage-3-large",
    dimensions: 1024,
  },
};

export function resolveEmbeddingProfile(
  profile?: string
): EmbeddingProfileConfig | undefined {
  if (!profile) return undefined;
  return EMBEDDING_PROFILES[profile];
}
