/**
 * MCP-compatible tools for zee.
 * Stub implementation - to be expanded later.
 */

import type { ZeeConfig } from "../config/config.js";

export interface McpToolOptions {
  config: ZeeConfig;
}

/**
 * Creates MCP-compatible tools from zee's tool registry.
 * Currently returns an empty array - expand as needed.
 */
export function createMcpCompatibleTools(_opts: McpToolOptions): unknown[] {
  // TODO: Implement MCP tool wrapping for zee tools
  return [];
}
