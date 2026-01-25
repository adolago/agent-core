/**
 * Plugin Module
 *
 * Extensible plugin system for Tiara orchestration engine.
 * Enables modular extension through agents, tools, commands, and more.
 *
 * Ported from claude-flow v3 @claude-flow/plugins
 *
 * @module tiara/plugin
 */

// Types
export type {
  // Core types
  IPlugin,
  PluginFactory,
  PluginMetadata,
  PluginConfig,
  PluginContext,
  PluginLifecycleState,
  PluginEntry,
  PluginExtensions,
  RegistryStats,
  HealthCheckResult,
  // Extension types
  AgentTypeDefinition,
  TaskTypeDefinition,
  MCPToolDefinition,
  MCPToolResult,
  CLICommandDefinition,
  CLIArgumentDefinition,
  CLIOptionDefinition,
  // Schema types
  JSONSchema,
  JSONSchemaProperty,
  // Service types
  IPluginLogger,
  IPluginEventBus,
  IServiceContainer,
} from "./types.js";

export { PLUGIN_EVENTS } from "./types.js";
export type { PluginEvent } from "./types.js";

// Base plugin
export { BasePlugin, createSimplePlugin } from "./base-plugin.js";
export type { SimplePluginConfig } from "./base-plugin.js";

// Registry
export {
  PluginRegistry,
  getDefaultRegistry,
  setDefaultRegistry,
} from "./registry.js";
export type { PluginRegistryConfig } from "./registry.js";

// Builders
export {
  PluginBuilder,
  MCPToolBuilder,
  AgentTypeBuilder,
  CLICommandBuilder,
  // Quick creation helpers
  createToolPlugin,
  createCommandPlugin,
  createAgentTypesPlugin,
} from "./builders.js";
