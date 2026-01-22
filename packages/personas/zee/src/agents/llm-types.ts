/**
 * LLM types consolidated from compat layers.
 * These are the minimal types needed after removing pi-ai/pi-coding-agent dependencies.
 * LLM operations are handled by agent-core via Vercel AI SDK.
 */

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
 * Model discovery stub.
 * Returns empty registry - agent-core provides model catalog.
 */
export function discoverModels(
  _authStorage?: AuthStorage,
  _agentDir?: string,
): ModelRegistry {
  return {
    getAll: () => [],
    getAvailable: () => [],
    find: () => null,
  };
}

/**
 * Load model catalog stub.
 * Returns empty array - agent-core provides model catalog via models.dev.
 */
export async function loadModelCatalog(_params?: {
  config?: unknown;
  useCache?: boolean;
}): Promise<ModelCatalogEntry[]> {
  return [];
}

/**
 * Reset model catalog cache (no-op stub for tests).
 */
export function resetModelCatalogCacheForTest(): void {
  // No-op - no cache to reset
}
