/**
 * Built-in Tools Index
 *
 * Re-exports all built-in tools and provides registration helpers.
 * Built-in tools are the core tools that come with the system.
 */

import type { ToolDefinition } from '../types';
import { getToolRegistry } from '../registry';

// Tool implementations
import { BashTool } from './bash';
import { ReadTool } from './read';
import { WriteTool } from './write';
import { EditTool } from './edit';
import { GlobTool } from './glob';
import { GrepTool } from './grep';
import { TaskTool } from './task';
import { WebFetchTool } from './webfetch';
import { SkillTool } from './skill';

// ============================================================================
// Built-in Tools Registry
// ============================================================================

/**
 * All built-in tools
 */
export const builtinTools: ToolDefinition[] = [
  BashTool,
  ReadTool,
  WriteTool,
  EditTool,
  GlobTool,
  GrepTool,
  TaskTool,
  WebFetchTool,
  SkillTool,
];

/**
 * Register all built-in tools with the registry
 */
export function registerBuiltinTools(): void {
  const registry = getToolRegistry();
  registry.registerAll(builtinTools, { source: 'builtin', enabled: true });
}

/**
 * Get built-in tool IDs
 */
export function getBuiltinToolIds(): string[] {
  return builtinTools.map((t) => t.id);
}

// ============================================================================
// Tool Re-exports
// ============================================================================

export { BashTool } from './bash';
export { ReadTool } from './read';
export { WriteTool } from './write';
export { EditTool } from './edit';
export { GlobTool } from './glob';
export { GrepTool } from './grep';
export { TaskTool } from './task';
export { WebFetchTool } from './webfetch';
export { SkillTool } from './skill';

// Common utilities
export {
  readStringParam,
  readStringArrayParam,
  readNumberParam,
  readBooleanParam,
  jsonResult,
  textResult,
  errorResult,
  statusResult,
  type StringParamOptions,
} from './common';
