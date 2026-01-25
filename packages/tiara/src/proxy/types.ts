/**
 * Proxy Types
 *
 * Types for multi-protocol proxying and format translation.
 *
 * Ported from claude-flow v3 @agentic-flow/proxy
 *
 * @module tiara/proxy/types
 */

// =============================================================================
// Tool Types
// =============================================================================

/**
 * Tool definition for function calling
 */
export interface Tool {
  /** Tool name */
  name: string;
  /** Tool description */
  description?: string;
  /** JSON Schema for input */
  input_schema?: ToolInputSchema;
}

/**
 * Tool input schema (JSON Schema)
 */
export interface ToolInputSchema {
  type: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

/**
 * Schema property definition
 */
export interface SchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

/**
 * Tool call request
 */
export interface ToolCall {
  /** Tool name to invoke */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Optional call ID */
  id?: string;
}

/**
 * Tool emulation result
 */
export interface EmulationResult {
  /** Extracted tool calls */
  toolCalls: ToolCall[];
  /** Reasoning/thought process */
  reasoning?: string;
  /** Final answer (if no more tools needed) */
  finalAnswer?: string;
  /** Confidence score (0-1) */
  confidence: number;
}

// =============================================================================
// Provider Instructions
// =============================================================================

/**
 * Provider-specific tool instructions
 */
export interface ToolInstructions {
  /** Format description */
  format: string;
  /** Command patterns for common operations */
  commands: {
    write: string;
    read: string;
    bash: string;
  };
  /** Usage examples */
  examples?: string;
  /** Special emphasis/notes */
  emphasis?: string;
}

/**
 * Instruction generation options
 */
export interface InstructionOptions {
  /** Enable parallel execution instructions */
  enableParallel?: boolean;
  /** Batch size for operations */
  batchSize?: number;
  /** Include ReasoningBank instructions */
  enableReasoningBank?: boolean;
  /** Include XML format instructions */
  includeXmlInstructions?: boolean;
}

/**
 * Model parallel capabilities
 */
export interface ParallelCapabilities {
  /** Maximum concurrent agents */
  maxConcurrency: number;
  /** Recommended batch size */
  recommendedBatchSize: number;
  /** Supports subprocess spawning */
  supportsSubprocesses: boolean;
  /** Supports ReasoningBank coordination */
  supportsReasoningBank: boolean;
}

// =============================================================================
// Proxy Configuration
// =============================================================================

/**
 * Adaptive proxy configuration
 */
export interface AdaptiveProxyConfig {
  /** Enable HTTP/2 */
  enableHTTP2?: boolean;
  /** Enable HTTP/3 (QUIC) */
  enableHTTP3?: boolean;
  /** Enable WebSocket */
  enableWebSocket?: boolean;
  /** Enable HTTP/1.1 fallback */
  enableHTTP1?: boolean;
  /** HTTP/1.1 port */
  http1Port?: number;
  /** HTTP/2 port */
  http2Port?: number;
  /** HTTP/3 port */
  http3Port?: number;
  /** WebSocket port */
  wsPort?: number;
  /** TLS certificate (PEM) */
  cert?: string;
  /** TLS private key (PEM) */
  key?: string;
}

/**
 * HTTP/2 proxy configuration
 */
export interface HTTP2ProxyConfig {
  /** TLS certificate (PEM) */
  cert?: string;
  /** TLS private key (PEM) */
  key?: string;
  /** Port to listen on */
  port: number;
  /** Allow HTTP/1.1 fallback */
  allowHTTP1?: boolean;
  /** API keys for authentication */
  apiKeys?: string[];
  /** Rate limiting configuration */
  rateLimit?: RateLimitConfig;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  /** Points allowed */
  points: number;
  /** Duration window (seconds) */
  duration: number;
  /** Block duration on limit exceeded (seconds) */
  blockDuration: number;
}

/**
 * QUIC proxy configuration
 */
export interface QuicProxyConfig {
  /** Default model to use */
  defaultModel?: string;
  /** Transport protocol preference */
  transport?: "quic" | "http2" | "auto";
  /** Enable QUIC transport */
  enableQuic?: boolean;
  /** Fallback to HTTP/2 if QUIC fails */
  fallbackToHttp2?: boolean;
  /** Fallback timeout (ms) */
  fallbackTimeout?: number;
}

// =============================================================================
// Proxy Server
// =============================================================================

/**
 * Active proxy server instance
 */
export interface ProxyServer {
  /** Protocol name */
  protocol: string;
  /** Port number */
  port: number;
  /** Full URL */
  url: string;
  /** Server handle */
  server: unknown;
}

/**
 * Proxy status information
 */
export interface ProxyStatus {
  /** Is the proxy running */
  isRunning: boolean;
  /** Active servers */
  servers: Array<{
    protocol: string;
    port: number;
    url: string;
  }>;
  /** Enabled protocols */
  enabledProtocols: string[];
}

// =============================================================================
// Format Translation
// =============================================================================

/**
 * Message role types
 */
export type MessageRole = "user" | "assistant" | "system" | "tool";

/**
 * Content block types
 */
export type ContentBlockType = "text" | "tool_use" | "tool_result" | "image";

/**
 * Text content block
 */
export interface TextContent {
  type: "text";
  text: string;
}

/**
 * Tool use content block
 */
export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result content block
 */
export interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string | ContentBlock[];
}

/**
 * Image content block
 */
export interface ImageContent {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

/**
 * Content block union type
 */
export type ContentBlock =
  | TextContent
  | ToolUseContent
  | ToolResultContent
  | ImageContent;

/**
 * Message structure (Anthropic format)
 */
export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
}

/**
 * Request body (Anthropic format)
 */
export interface AnthropicRequest {
  model: string;
  messages: Message[];
  max_tokens: number;
  system?: string;
  tools?: Tool[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
}

/**
 * Response body (Anthropic format)
 */
export interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ContentBlock[];
  model: string;
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// =============================================================================
// Events
// =============================================================================

/**
 * Proxy event types
 */
export enum ProxyEventTypes {
  REQUEST_RECEIVED = "proxy:request_received",
  REQUEST_FORWARDED = "proxy:request_forwarded",
  RESPONSE_RECEIVED = "proxy:response_received",
  RESPONSE_SENT = "proxy:response_sent",
  PROTOCOL_SELECTED = "proxy:protocol_selected",
  FALLBACK_TRIGGERED = "proxy:fallback_triggered",
  ERROR = "proxy:error",
}

/**
 * Proxy event payload
 */
export interface ProxyEventPayload {
  /** Request ID */
  requestId?: string;
  /** Protocol used */
  protocol?: string;
  /** Target URL */
  url?: string;
  /** Error message */
  error?: string;
  /** Event timestamp */
  timestamp: number;
}
