/**
 * Agent Core - Unified AI Agent Foundation
 *
 * Powers Stanley (GUI/GPUI), Zee (WhatsApp/Telegram), and OpenCode (CLI/TUI)
 * with subscription-based auth support (Claude Max, ChatGPT Plus, GitHub Copilot).
 *
 * ## Architecture Overview
 *
 * - **Provider System**: 15+ LLM providers with models.dev integration
 * - **Agent System**: Configurable personas, permissions, and mode switching
 * - **Tool System**: Built-in tools with MCP integration
 * - **Memory Layer**: Qdrant vector storage with semantic search
 * - **Surface Abstraction**: CLI/TUI, GUI, and Messaging adapters
 * - **Plugin System**: Hook-based extensibility
 * - **Session Management**: Streaming, retry logic, persistence
 *
 * @packageDocumentation
 */

// Provider System - Multi-LLM support with subscription auth
export * from "./provider/types.js";

// Agent System - Configurable personas and permissions
export * from "./agent/types.js";

// Tool System - Built-in tools and MCP integration
export * from "./tool/types.js";

// MCP - Model Context Protocol servers
export * from "./mcp/types.js";

// Memory - Qdrant-backed semantic memory
export * from "./memory/types.js";

// Surface - Abstraction for CLI/GUI/Messaging UIs
export * from "./surface/types.js";

// Session - Conversation state management
export * from "./session/types.js";

// Plugin - Hook-based extensibility
export * from "./plugin/types.js";

// Configuration - Unified config system
export * from "./config/types.js";

// Transport - Communication abstractions
export * from "./transport/types.js";

// Utilities - Common helpers and types
export * from "./util/types.js";

// Re-export common utilities
export { z } from "zod";
export type { LanguageModelV2 } from "ai";

/** agent-core version */
export const VERSION = "0.1.0";

/** Package metadata */
export const PACKAGE = {
  name: "@agent-core/core",
  version: VERSION,
  description: "Unified foundation for AI agent applications",
} as const;
