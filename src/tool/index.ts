/**
 * Tool Module
 *
 * Built-in tools and registry for MCP integration.
 */

export * from "./types";

// Built-in tool IDs
export const BUILTIN_TOOLS = [
  "bash",
  "read",
  "write",
  "edit",
  "multiedit",
  "glob",
  "grep",
  "ls",
  "task",
  "todoread",
  "todowrite",
  "webfetch",
  "websearch",
  "codesearch",
  "skill",
  "lsp",
] as const;
