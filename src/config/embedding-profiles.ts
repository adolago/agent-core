import type { EmbeddingProviderType } from "../memory/types";

export type EmbeddingProfileConfig = {
  provider: EmbeddingProviderType;
  model: string;
  dimensions?: number;
  baseUrl?: string;
};

export const EMBEDDING_PROFILES: Record<string, EmbeddingProfileConfig> = {
  // Google Gemini embedding (recommended)
  "google/gemini-embedding-001": {
    provider: "google",
    model: "gemini-embedding-001",
    dimensions: 3072,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  // OpenAI large embedding
  "openai/text-embedding-3-large": {
    provider: "openai",
    model: "text-embedding-3-large",
    dimensions: 3072,
  },
  // Voyage AI embedding
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
