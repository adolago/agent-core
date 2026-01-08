/**
 * Tool System Types
 *
 * Built-in tools and registry for MCP integration
 */

import type { z } from "zod";
import type { AgentConfig } from "../agent/types";

/** Tool execution context */
export interface ToolContext {
  /** Current agent configuration */
  agent?: AgentConfig;

  /** Current session ID */
  sessionId: string;

  /** Current message ID */
  messageId: string;

  /** Tool call ID */
  callId: string;

  /** Working directory */
  workingDirectory: string;

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /** Permission checker */
  checkPermission: (type: string, pattern?: string) => Promise<void>;

  /** Memory access */
  memory?: {
    search: (query: string, limit?: number) => Promise<unknown[]>;
    save: (content: string, category: string) => Promise<void>;
  };
}

/** Tool execution result */
export interface ToolResult {
  /** Title for display */
  title: string;

  /** Output content (string or structured) */
  output: string | object;

  /** Additional metadata */
  metadata: Record<string, unknown>;

  /** Files created/modified */
  files?: string[];

  /** Whether the tool errored */
  error?: boolean;
}

/** Tool definition */
export interface ToolDefinition<TParams = unknown> {
  /** Zod schema for parameters */
  parameters: z.ZodType<TParams>;

  /** Tool description for the model */
  description: string;

  /** Execute the tool */
  execute: (params: TParams, context: ToolContext) => Promise<ToolResult>;
}

/** Tool info for registration */
export interface ToolInfo {
  /** Unique tool identifier */
  id: string;

  /** Initialize and return the tool definition */
  init: (options: { agent?: AgentConfig }) => Promise<ToolDefinition>;
}

/** Built-in tool identifiers */
export type BuiltInTool =
  | "bash"
  | "read"
  | "write"
  | "edit"
  | "multiedit"
  | "glob"
  | "grep"
  | "ls"
  | "task"
  | "todoread"
  | "todowrite"
  | "webfetch"
  | "websearch"
  | "codesearch"
  | "skill"
  | "lsp";

/** Tool registry interface */
export interface ToolRegistry {
  /** Get all tool IDs */
  ids(): Promise<string[]>;

  /** Get tools for a specific agent and provider */
  tools(providerId: string, agent?: AgentConfig): Promise<Array<{
    id: string;
    parameters: z.ZodType;
    description: string;
    execute: (params: unknown, ctx: ToolContext) => Promise<ToolResult>;
  }>>;

  /** Get enabled tools for an agent */
  enabled(agent: AgentConfig): Promise<Record<string, boolean>>;

  /** Register a custom tool */
  register(tool: ToolInfo): Promise<void>;
}

/** Skill definition for extensible commands */
export interface SkillDefinition {
  /** Skill name (used as /command) */
  name: string;

  /** Human-readable description */
  description: string;

  /** Location: managed (built-in), project, or user */
  location: "managed" | "project" | "user";

  /** Skill source path */
  path?: string;

  /** Execute the skill */
  execute?: (args: string, context: ToolContext) => Promise<ToolResult>;
}

/** Skill registry interface */
export interface SkillRegistry {
  /** List available skills */
  list(): Promise<SkillDefinition[]>;

  /** Get a specific skill */
  get(name: string): Promise<SkillDefinition | undefined>;

  /** Execute a skill */
  execute(name: string, args: string, context: ToolContext): Promise<ToolResult>;

  /** Register a custom skill */
  register(skill: SkillDefinition): Promise<void>;
}
