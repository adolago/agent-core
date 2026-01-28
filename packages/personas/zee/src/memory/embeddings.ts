/**
 * Zee Embedding Providers
 *
 * Supports OpenAI and Gemini embedding providers.
 * For vLLM or other OpenAI-compatible servers, use the OpenAI provider with custom baseUrl.
 */
import type { ZeeConfig } from "../config/config.js";
import { createGeminiEmbeddingProvider, type GeminiEmbeddingClient } from "./embeddings-gemini.js";
import { createOpenAiEmbeddingProvider, type OpenAiEmbeddingClient } from "./embeddings-openai.js";

export type { GeminiEmbeddingClient } from "./embeddings-gemini.js";
export type { OpenAiEmbeddingClient } from "./embeddings-openai.js";

export type EmbeddingProvider = {
  id: string;
  model: string;
  embedQuery: (text: string) => Promise<number[]>;
  embedBatch: (texts: string[]) => Promise<number[][]>;
};

export type EmbeddingProviderResult = {
  provider: EmbeddingProvider;
  requestedProvider: "openai" | "gemini" | "auto";
  fallbackFrom?: "openai" | "gemini";
  fallbackReason?: string;
  openAi?: OpenAiEmbeddingClient;
  gemini?: GeminiEmbeddingClient;
};

export type EmbeddingProviderOptions = {
  config: ZeeConfig;
  agentDir?: string;
  provider: "openai" | "gemini" | "auto";
  remote?: {
    baseUrl?: string;
    apiKey?: string;
    headers?: Record<string, string>;
  };
  model: string;
  fallback: "openai" | "gemini" | "none";
};

function isMissingApiKeyError(err: unknown): boolean {
  const message = formatError(err);
  return message.includes("No API key found for provider");
}

export async function createEmbeddingProvider(
  options: EmbeddingProviderOptions,
): Promise<EmbeddingProviderResult> {
  const requestedProvider = options.provider;
  const fallback = options.fallback;

  const createProvider = async (id: "openai" | "gemini") => {
    if (id === "gemini") {
      const { provider, client } = await createGeminiEmbeddingProvider(options);
      return { provider, gemini: client };
    }
    const { provider, client } = await createOpenAiEmbeddingProvider(options);
    return { provider, openAi: client };
  };

  if (requestedProvider === "auto") {
    const missingKeyErrors: string[] = [];

    for (const provider of ["openai", "gemini"] as const) {
      try {
        const result = await createProvider(provider);
        return { ...result, requestedProvider };
      } catch (err) {
        const message = formatError(err);
        if (isMissingApiKeyError(err)) {
          missingKeyErrors.push(message);
          continue;
        }
        throw new Error(message);
      }
    }

    if (missingKeyErrors.length > 0) {
      throw new Error(missingKeyErrors.join("\n\n"));
    }
    throw new Error("No embeddings provider available.");
  }

  try {
    const primary = await createProvider(requestedProvider);
    return { ...primary, requestedProvider };
  } catch (primaryErr) {
    const reason = formatError(primaryErr);
    if (fallback && fallback !== "none" && fallback !== requestedProvider) {
      try {
        const fallbackResult = await createProvider(fallback);
        return {
          ...fallbackResult,
          requestedProvider,
          fallbackFrom: requestedProvider,
          fallbackReason: reason,
        };
      } catch (fallbackErr) {
        throw new Error(`${reason}\n\nFallback to ${fallback} failed: ${formatError(fallbackErr)}`);
      }
    }
    throw new Error(reason);
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
