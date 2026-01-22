/**
 * Agent-Core Daemon Client Types
 * Types for communicating with the agent-core daemon API
 */

// Persona identifiers
export type PersonaId = "zee" | "stanley" | "johny";

// SPARC phase to persona mapping
export const SPARC_PERSONA_MAP: Record<string, PersonaId> = {
  "spec-pseudocode": "johny",
  "architect": "johny",
  "code": "zee",
  "tdd": "zee",
  "refinement-optimization-mode": "zee",
  "security-review": "johny",
  "integration": "zee",
  "debug": "zee",
  "docs-writer": "zee",
  // Default fallback
  "default": "zee",
};

// Session types
export interface Session {
  id: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionCreateOptions {
  title?: string;
  persona?: PersonaId;
}

// Message types
export interface MessagePart {
  type: "text" | "reasoning" | "tool";
  text?: string;
  tool?: string;
  callID?: string;
  input?: Record<string, unknown>;
  state?: { output?: string };
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  info: {
    tokens?: {
      input?: number;
      output?: number;
      cache?: { read?: number; write?: number };
    };
  };
}

// Prompt options
export interface PromptOptions {
  sessionId: string;
  prompt: string;
  persona?: PersonaId;
  model?: {
    providerID: string;
    modelID: string;
  };
  system?: string;
  signal?: AbortSignal;
}

// Response types
export interface PromptResult {
  success: boolean;
  text: string;
  tokenCount: number;
  aborted: boolean;
  message?: Message;
  error?: string;
  toolCalls: Array<{ name: string; result?: string }>;
}

// Usage tracking
export interface UsageInfo {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

// Client configuration
export interface AgentCoreClientConfig {
  /** Base URL of the agent-core daemon. Default: http://127.0.0.1:3210 */
  baseUrl?: string;
  /** Request timeout in milliseconds. Default: 120000 */
  timeoutMs?: number;
  /** Maximum retry attempts. Default: 3 */
  maxRetries?: number;
  /** Initial retry delay in milliseconds. Default: 1000 */
  initialRetryDelayMs?: number;
}

// Event types for streaming
export type AgentEvent = {
  stream: "text" | "tool" | "reasoning" | "compaction" | "error" | "lifecycle";
  data: Record<string, unknown>;
};

// Callback types
export interface PromptCallbacks {
  onText?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolStart?: (tool: string) => void;
  onToolEnd?: (tool: string, result?: string) => void;
  onError?: (error: Error) => void;
}

// SPARC-specific types
export interface SPARCExecuteOptions {
  mode: string;
  task: string;
  context?: Record<string, unknown>;
  callbacks?: PromptCallbacks;
  signal?: AbortSignal;
}

export interface SPARCExecuteResult {
  success: boolean;
  text: string;
  phase: string;
  persona: PersonaId;
  tokenCount: number;
  error?: string;
}
