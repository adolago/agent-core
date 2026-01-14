/**
 * Lightweight runtime config loader.
 *
 * Reads agent-core.json(c) for runtime-only settings (memory, tiara)
 * without invoking the full CLI config pipeline.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import { Assets } from "../paths";
import type { EmbeddingProviderType } from "../memory/types";
import { resolveEmbeddingProfile } from "./embedding-profiles";

type RuntimeConfig = {
  memory?: {
    qdrant?: {
      url?: string;
      apiKey?: string;
      collection?: string;
    };
    qdrantUrl?: string;
    qdrantApiKey?: string;
    qdrantCollection?: string;
    embedding?: {
      profile?: string;
      provider?: string;
      model?: string;
      dimensions?: number;
      dimension?: number;
      apiKey?: string;
      baseUrl?: string;
    };
  };
  tiara?: {
    qdrant?: {
      url?: string;
      apiKey?: string;
      stateCollection?: string;
      memoryCollection?: string;
      embeddingDimension?: number;
    };
  };
};

export type MemoryQdrantConfig = {
  url?: string;
  apiKey?: string;
  collection?: string;
};

export type TiaraQdrantConfig = {
  url?: string;
  apiKey?: string;
  stateCollection?: string;
  memoryCollection?: string;
  embeddingDimension?: number;
};

export type MemoryEmbeddingConfig = {
  provider?: EmbeddingProviderType;
  model?: string;
  dimensions?: number;
  apiKey?: string;
  baseUrl?: string;
};

const CONFIG_PATHS = [
  path.join(os.homedir(), ".config", "agent-core", "agent-core.jsonc"),
  path.join(os.homedir(), ".config", "agent-core", "agent-core.json"),
  Assets.config(),
  path.join(Assets.root(), "agent-core.json"),
];

let cachedConfig: RuntimeConfig | null = null;

function parseConfigFile(filePath: string): RuntimeConfig | null {
  let contents: string;
  try {
    contents = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  contents = contents.replace(/\{env:([^}]+)\}/g, (_match, varName) => {
    return process.env[varName] ?? "";
  });

  const errors: ParseError[] = [];
  const parsed = parseJsonc(contents, errors, { allowTrailingComma: true });
  if (errors.length || typeof parsed !== "object" || parsed === null) {
    return null;
  }

  return parsed as RuntimeConfig;
}

function mergeConfigs(base: RuntimeConfig, override: RuntimeConfig): RuntimeConfig {
  return {
    ...base,
    ...override,
    memory: {
      ...base.memory,
      ...override.memory,
      qdrant: {
        ...base.memory?.qdrant,
        ...override.memory?.qdrant,
      },
      embedding: {
        ...base.memory?.embedding,
        ...override.memory?.embedding,
      },
    },
    tiara: {
      ...base.tiara,
      ...override.tiara,
      qdrant: {
        ...base.tiara?.qdrant,
        ...override.tiara?.qdrant,
      },
    },
  };
}

function loadRuntimeConfig(): RuntimeConfig {
  if (cachedConfig) return cachedConfig;

  let merged: RuntimeConfig = {};
  for (const configPath of CONFIG_PATHS) {
    const parsed = parseConfigFile(configPath);
    if (parsed) merged = mergeConfigs(merged, parsed);
  }

  cachedConfig = merged;
  return merged;
}

function resolveMemoryQdrantConfig(config: RuntimeConfig): MemoryQdrantConfig {
  const memory = config.memory ?? {};
  const qdrant = memory.qdrant ?? {};
  const url = (qdrant.url ?? memory.qdrantUrl)?.trim() || undefined;
  const apiKey = (qdrant.apiKey ?? memory.qdrantApiKey)?.trim() || undefined;
  const collection = (qdrant.collection ?? memory.qdrantCollection)?.trim() || undefined;

  return {
    url,
    apiKey,
    collection,
  };
}

function resolveMemoryEmbeddingConfig(config: RuntimeConfig): MemoryEmbeddingConfig {
  const embedding = config.memory?.embedding ?? {};
  const profileConfig = resolveEmbeddingProfile(embedding.profile?.trim());
  const rawDimensions =
    embedding.dimensions ?? embedding.dimension ?? profileConfig?.dimensions;
  const dimensions =
    typeof rawDimensions === "string"
      ? Number.parseInt(rawDimensions, 10)
      : rawDimensions;

  const provider = embedding.provider?.trim() || profileConfig?.provider;

  return {
    provider: provider as EmbeddingProviderType | undefined,
    model: embedding.model?.trim() || profileConfig?.model,
    dimensions: Number.isFinite(dimensions as number) ? (dimensions as number) : undefined,
    apiKey: embedding.apiKey?.trim() || undefined,
    baseUrl: embedding.baseUrl?.trim() || profileConfig?.baseUrl,
  };
}

export function getMemoryQdrantConfig(): MemoryQdrantConfig {
  return resolveMemoryQdrantConfig(loadRuntimeConfig());
}

export function getMemoryEmbeddingConfig(): MemoryEmbeddingConfig {
  return resolveMemoryEmbeddingConfig(loadRuntimeConfig());
}

export function getTiaraQdrantConfig(): TiaraQdrantConfig {
  const config = loadRuntimeConfig();
  const memoryQdrant = resolveMemoryQdrantConfig(config);
  const memoryEmbedding = resolveMemoryEmbeddingConfig(config);
  const qdrant = config.tiara?.qdrant ?? {};
  const url = (qdrant.url ?? memoryQdrant.url)?.trim() || undefined;
  const apiKey = (qdrant.apiKey ?? memoryQdrant.apiKey)?.trim() || undefined;
  const stateCollection = qdrant.stateCollection?.trim() || undefined;
  const memoryCollection = (qdrant.memoryCollection ?? memoryQdrant.collection)?.trim() || undefined;
  const embeddingDimension =
    typeof qdrant.embeddingDimension === "number"
      ? qdrant.embeddingDimension
      : memoryEmbedding.dimensions;

  return {
    url,
    apiKey,
    stateCollection,
    memoryCollection,
    embeddingDimension,
  };
}
