/**
 * LLM types consolidated from compat layers.
 * These are the minimal types needed after removing pi-ai/pi-coding-agent dependencies.
 * LLM operations are handled by agent-core via Vercel AI SDK.
 */

import { createOpencodeClient } from "@opencode-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const CURRENT_SESSION_VERSION = 1;

interface SessionHeader {
  type: string;
  version: number;
  id: string;
  timestamp: string;
  cwd?: string;
}

/**
 * Simple session manager for reading/writing session files.
 */
export class SessionManager {
  private sessionFile: string;
  private messages: unknown[] = [];
  private header: SessionHeader | null = null;

  private constructor(sessionFile: string) {
    this.sessionFile = sessionFile;
  }

  static open(sessionFile: string): SessionManager {
    const manager = new SessionManager(sessionFile);
    manager.load();
    return manager;
  }

  static create(sessionFile: string): SessionManager {
    return new SessionManager(sessionFile);
  }

  private load(): void {
    try {
      if (fs.existsSync(this.sessionFile)) {
        const content = fs.readFileSync(this.sessionFile, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        this.messages = lines.map((line) => JSON.parse(line));
        if (this.messages.length > 0) {
          const first = this.messages[0] as Record<string, unknown>;
          if (first.type === "session") {
            this.header = first as unknown as SessionHeader;
          }
        }
      }
    } catch {
      // Ignore errors loading session
    }
  }

  getMessages(): unknown[] {
    return this.messages;
  }

  getSessionFile(): string {
    return this.sessionFile;
  }

  getSessionDir(): string {
    return path.dirname(this.sessionFile);
  }

  getSessionId(): string {
    return this.header?.id ?? crypto.randomUUID();
  }

  getCwd(): string {
    return this.header?.cwd ?? process.cwd();
  }

  getLeafId(): string | undefined {
    if (this.messages.length > 0) {
      const last = this.messages[this.messages.length - 1] as Record<
        string,
        unknown
      >;
      return last.id as string | undefined;
    }
    return undefined;
  }

  createBranchedSession(leafId: string): string | null {
    const sessionId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const fileTimestamp = timestamp.replace(/[:.]/g, "-");
    const newSessionFile = path.join(
      this.getSessionDir(),
      `${fileTimestamp}_${sessionId}_branch.jsonl`,
    );
    const header = {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: sessionId,
      timestamp,
      cwd: this.getCwd(),
      parentSession: this.sessionFile,
      branchFrom: leafId,
    };
    try {
      fs.writeFileSync(newSessionFile, `${JSON.stringify(header)}\n`, "utf-8");
      return newSessionFile;
    } catch {
      return null;
    }
  }

  appendMessage(message: unknown): void {
    this.messages.push(message);
    try {
      fs.appendFileSync(
        this.sessionFile,
        `${JSON.stringify(message)}\n`,
        "utf-8",
      );
    } catch {
      // Ignore write errors
    }
  }

  save(): void {
    try {
      const content = this.messages.map((m) => JSON.stringify(m)).join("\n");
      fs.writeFileSync(this.sessionFile, `${content}\n`, "utf-8");
    } catch {
      // Ignore write errors
    }
  }
}

/**
 * Generic API type parameter. Used as a type parameter for Model<Api>.
 */
export type Api = unknown;

/**
 * Model type with provider information.
 */
export type Model<_T = Api> = {
  provider: string;
  id: string;
  name?: string;
  contextWindow?: number;
  input?: string[];
  baseUrl?: string;
  maxTokens?: number;
  reasoning?: boolean;
};

/**
 * Message part for content blocks.
 */
export type Part = {
  type: string;
  text?: string;
  source?: { type: string; data?: string; url?: string };
};

/**
 * Assistant message type.
 */
export type AssistantMessage = {
  role: "assistant";
  content: Part[];
};

/**
 * Context type for LLM completions.
 */
export type Context = {
  signal?: AbortSignal;
  apiKey?: string;
  messages?: unknown[];
  maxTokens?: number;
  tools?: unknown[];
};

/**
 * Complete function stub - not implemented.
 * LLM completions are handled by agent-core via Vercel AI SDK.
 * @throws Error - always throws, use agent-core for completions
 */
export async function complete(
  _model: Model,
  _context: Context,
  _options?: Record<string, unknown>,
): Promise<AssistantMessage> {
  throw new Error(
    "complete() is not implemented - use agent-core for LLM completions",
  );
}

/**
 * OAuth provider types.
 */
export type OAuthProvider =
  | "anthropic"
  | "google-antigravity"
  | "google-gemini-cli"
  | "openai-codex";

/**
 * OAuth credentials type.
 */
export type OAuthCredentials = {
  access: string;
  refresh: string;
  expires: number;
  enterpriseUrl?: string;
  projectId?: string;
  accountId?: string;
  email?: string;
};

/**
 * Model catalog entry type.
 */
export type ModelCatalogEntry = {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
};

/**
 * Auth storage type.
 */
export type AuthStorage = {
  getApiKey: (provider: string, opts?: unknown) => Promise<string | undefined>;
  setRuntimeApiKey: (provider: string, key: string) => void;
};

/**
 * Model registry type.
 */
export type ModelRegistry = {
  getAll: () => Model[];
  getAvailable: () => Model[];
  find: (provider: string, id: string) => Model | null;
};

type ProviderListModel = {
  id: string;
  name: string;
  limit?: {
    context: number;
    output: number;
  };
  modalities?: {
    input: Array<"text" | "audio" | "image" | "video" | "pdf">;
  };
  reasoning?: boolean;
};

type ProviderListProvider = {
  id: string;
  name: string;
  api?: string;
  models?: Record<string, ProviderListModel>;
};

type ProviderListPayload = {
  all: ProviderListProvider[];
  default?: Record<string, string>;
  connected?: string[];
};

const AGENT_CORE_DAEMON_URL = "http://127.0.0.1:3210";

let modelCatalogCache: ModelCatalogEntry[] | null = null;
let modelRegistryCache: Model[] | null = null;
let connectedProvidersCache: Set<string> | null = null;
let loadCatalogPromise: Promise<ModelCatalogEntry[]> | null = null;

function resolveAgentCoreUrl(): string {
  const envUrl = process.env.AGENT_CORE_URL?.trim();
  return envUrl || AGENT_CORE_DAEMON_URL;
}

function cacheProviderList(payload: ProviderListPayload): ModelCatalogEntry[] {
  const catalog: ModelCatalogEntry[] = [];
  const registry: Model[] = [];

  for (const provider of payload.all ?? []) {
    const providerId = provider.id?.trim();
    if (!providerId) continue;
    const baseUrl = provider.api?.trim() || undefined;
    const models = provider.models ?? {};
    for (const [modelKey, model] of Object.entries(models)) {
      const modelId = (model.id || modelKey || "").trim();
      if (!modelId) continue;
      const contextWindow =
        typeof model.limit?.context === "number" && model.limit.context > 0
          ? model.limit.context
          : undefined;
      const maxTokens =
        typeof model.limit?.output === "number" && model.limit.output > 0
          ? model.limit.output
          : undefined;
      const input =
        Array.isArray(model.modalities?.input) &&
        model.modalities?.input.length > 0
          ? [...model.modalities.input]
          : ["text"];
      const reasoning = Boolean(model.reasoning);
      const name = model.name?.trim() || modelId;

      catalog.push({
        id: modelId,
        name,
        provider: providerId,
        contextWindow,
        reasoning,
      });

      registry.push({
        provider: providerId,
        id: modelId,
        name,
        contextWindow,
        maxTokens,
        input,
        baseUrl,
        reasoning,
      });
    }
  }

  modelCatalogCache = catalog;
  modelRegistryCache = registry;
  const connected = (payload.connected ?? [])
    .map((providerId) => providerId.trim())
    .filter(Boolean);
  connectedProvidersCache = new Set(connected);
  return catalog;
}

async function fetchProviderCatalog(): Promise<ModelCatalogEntry[]> {
  const client = createOpencodeClient({ baseUrl: resolveAgentCoreUrl() });
  const response = await client.provider.list({ throwOnError: true });
  const payload = response.data as ProviderListPayload | undefined;
  if (!payload || !Array.isArray(payload.all)) {
    modelCatalogCache = [];
    modelRegistryCache = [];
    connectedProvidersCache = new Set();
    return [];
  }
  return cacheProviderList(payload);
}

/**
 * Stub for OAuth API key retrieval/refresh.
 * Returns null - agent-core plugins handle OAuth.
 */
export async function getOAuthApiKey(
  _provider: OAuthProvider,
  _credentials: Record<string, OAuthCredentials>,
): Promise<{ apiKey: string; newCredentials: OAuthCredentials } | null> {
  return null;
}

/**
 * Stub for Anthropic OAuth login.
 * @throws Error - OAuth login not available in stub implementation
 */
export async function loginAnthropic(
  _openUrl: (url: string) => Promise<void>,
  _promptCode: () => Promise<string>,
): Promise<OAuthCredentials | null> {
  throw new Error(
    "Anthropic OAuth login is not available. Please use API key authentication or Claude CLI credentials.",
  );
}

/**
 * Stub for OpenAI Codex OAuth login.
 * @throws Error - OAuth login not available in stub implementation
 */
export async function loginOpenAICodex(_params: {
  onAuth: (opts: { url: string }) => Promise<void>;
  onPrompt: (prompt: {
    message: string;
    placeholder?: string;
  }) => Promise<string>;
  onProgress?: (msg: string) => void;
}): Promise<OAuthCredentials | null> {
  throw new Error(
    "OpenAI Codex OAuth login is not available. Please use API key authentication or Codex CLI credentials.",
  );
}

/**
 * Stub for Google Antigravity OAuth login.
 * @throws Error - OAuth login not available in stub implementation
 */
export async function loginAntigravity(
  _openUrl: (opts: { url: string; instructions?: string }) => Promise<void>,
  _onProgress?: (msg: string) => void,
): Promise<OAuthCredentials | null> {
  throw new Error(
    "Google Antigravity OAuth login is not available. The agent-core migration will provide this functionality.",
  );
}

/**
 * Auth storage discovery stub.
 * Returns minimal implementation - agent-core handles real auth.
 */
export function discoverAuthStorage(_agentDir?: string): AuthStorage {
  const runtimeKeys = new Map<string, string>();
  return {
    getApiKey: async (provider: string) => runtimeKeys.get(provider),
    setRuntimeApiKey: (provider: string, key: string) => {
      runtimeKeys.set(provider, key);
    },
  };
}

/**
 * Model discovery.
 * Returns registry backed by the agent-core provider catalog.
 */
export function discoverModels(
  _authStorage?: AuthStorage,
  _agentDir?: string,
): ModelRegistry {
  void loadModelCatalog({ useCache: true });
  return {
    getAll: () => modelRegistryCache ?? [],
    getAvailable: () => {
      if (!modelRegistryCache || !connectedProvidersCache) return [];
      return modelRegistryCache.filter((model) =>
        connectedProvidersCache?.has(model.provider),
      );
    },
    find: (provider, id) =>
      modelRegistryCache?.find(
        (model) => model.provider === provider && model.id === id,
      ) ?? null,
  };
}

/**
 * Load model catalog from the agent-core daemon.
 */
export async function loadModelCatalog(params?: {
  config?: unknown;
  useCache?: boolean;
}): Promise<ModelCatalogEntry[]> {
  const useCache = params?.useCache ?? true;
  if (useCache && modelCatalogCache) return modelCatalogCache;
  if (!loadCatalogPromise) {
    loadCatalogPromise = fetchProviderCatalog()
      .catch(() => modelCatalogCache ?? [])
      .finally(() => {
        loadCatalogPromise = null;
      });
  }
  return loadCatalogPromise;
}

/**
 * Reset model catalog cache (for tests).
 */
export function resetModelCatalogCacheForTest(): void {
  modelCatalogCache = null;
  modelRegistryCache = null;
  connectedProvidersCache = null;
  loadCatalogPromise = null;
}
