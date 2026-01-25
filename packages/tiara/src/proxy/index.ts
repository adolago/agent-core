/**
 * Proxy Module
 *
 * Multi-protocol proxying, format translation, and tool emulation.
 *
 * Features:
 * - Adaptive multi-protocol proxy (HTTP/3, HTTP/2, HTTP/1.1, WebSocket)
 * - Tool emulation for models without native function calling
 * - Provider-specific instruction formatting
 * - Request/response format translation
 *
 * Ported from claude-flow v3 @agentic-flow/proxy
 *
 * @module tiara/proxy
 */

// Types
export type {
  Tool,
  ToolInputSchema,
  SchemaProperty,
  ToolCall,
  EmulationResult,
  ToolInstructions,
  InstructionOptions,
  ParallelCapabilities,
  AdaptiveProxyConfig,
  HTTP2ProxyConfig,
  RateLimitConfig,
  QuicProxyConfig,
  ProxyServer,
  ProxyStatus,
  MessageRole,
  ContentBlockType,
  TextContent,
  ToolUseContent,
  ToolResultContent,
  ImageContent,
  ContentBlock,
  Message,
  AnthropicRequest,
  AnthropicResponse,
  ProxyEventPayload,
} from "./types.js";

export { ProxyEventTypes } from "./types.js";

// Tool Emulation
export {
  ReActEmulator,
  PromptEmulator,
  ToolEmulator,
  executeEmulation,
  createReActEmulator,
  createPromptEmulator,
  createToolEmulator,
} from "./tool-emulation.js";

// Provider Instructions
export {
  BASE_INSTRUCTIONS,
  ANTHROPIC_INSTRUCTIONS,
  OPENAI_INSTRUCTIONS,
  GOOGLE_INSTRUCTIONS,
  META_INSTRUCTIONS,
  DEEPSEEK_INSTRUCTIONS,
  MISTRAL_INSTRUCTIONS,
  XAI_INSTRUCTIONS,
  PARALLEL_EXECUTION_INSTRUCTIONS,
  getInstructionsForModel,
  taskRequiresFileOps,
  formatInstructions,
  getMaxTokensForModel,
  getParallelCapabilities,
  buildInstructions,
} from "./provider-instructions.js";

// Adaptive Proxy
export { AdaptiveProxy, createAdaptiveProxy } from "./adaptive-proxy.js";
