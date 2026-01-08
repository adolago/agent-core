/**
 * Unified Configuration System
 *
 * Provides a hierarchical configuration system that works across all surfaces:
 * - Stanley (WhatsApp)
 * - Zee (Telegram)
 * - CLI
 * - Web
 *
 * Configuration hierarchy (later overrides earlier):
 * 1. Built-in defaults
 * 2. Global config (~/.config/agent-core/)
 * 3. Project config (.agent-core/ in project root)
 * 4. Environment variables (AGENT_CORE_*)
 * 5. Runtime overrides
 *
 * @module config
 * @example
 * ```typescript
 * import { getConfig, loadConfig, ConfigSchema } from './config';
 *
 * // Simple usage - get cached config
 * const config = await getConfig();
 * console.log(config.model);
 *
 * // Load with options
 * const loaded = await loadConfig({
 *   surface: 'cli',
 *   overrides: { logLevel: 'debug' }
 * });
 *
 * // Validate custom config
 * const result = ConfigSchema.safeParse(myConfig);
 * ```
 */

// ============================================================================
// Legacy Types (backward compatibility)
// ============================================================================

export * from "./types";

// ============================================================================
// Schema Exports
// ============================================================================

export {
  // Main schemas
  ConfigSchema,
  ProviderConfigSchema,
  AgentConfigSchema,
  McpConfigSchema,
  McpLocalConfigSchema,
  McpRemoteConfigSchema,
  SurfaceConfigSchema,
  MemoryConfigSchema,

  // Surface-specific schemas
  StanleySurfaceConfigSchema,
  ZeeSurfaceConfigSchema,
  CliSurfaceConfigSchema,
  WebSurfaceConfigSchema,

  // Utility schemas
  PermissionSchema,
  LogLevelSchema,
  ModelConfigSchema,
  VectorDbConfigSchema,
  PluginEntrySchema,

  // Types
  type Config,
  type ProviderConfig as NewProviderConfig,
  type AgentConfig as NewAgentConfig,
  type McpConfig,
  type McpLocalConfig,
  type McpRemoteConfig,
  type McpOAuthConfig,
  type SurfaceConfig,
  type StanleySurfaceConfig,
  type ZeeSurfaceConfig,
  type CliSurfaceConfig,
  type WebSurfaceConfig,
  type MemoryConfig as NewMemoryConfig,
  type VectorDbConfig,
  type ModelConfig,
  type PluginEntry,
  type Permission,
  type LogLevel,

  // Validation
  validateConfig,
  type ConfigValidationError,
  SchemaMetadata,
} from './schema';

// ============================================================================
// Default Exports
// ============================================================================

export {
  // Complete defaults
  DEFAULT_CONFIG as NEW_DEFAULT_CONFIG,
  DEFAULT_PROVIDERS,
  DEFAULT_AGENTS,
  DEFAULT_SURFACE_CONFIG,
  DEFAULT_MEMORY_CONFIG,
  DEFAULT_PERMISSIONS,

  // Surface-specific defaults
  DEFAULT_STANLEY_CONFIG,
  DEFAULT_ZEE_CONFIG,
  DEFAULT_CLI_CONFIG,
  DEFAULT_WEB_CONFIG,

  // Utility functions
  getDefaultsForSurface,
  getGlobalConfigDir,

  // Model fallbacks
  MODEL_FALLBACK_CHAIN,
  SMALL_MODEL_FALLBACK_CHAIN,

  // File and directory names
  CONFIG_FILE_NAMES,
  CONFIG_DIR_NAMES,
  ENV_VAR_MAPPING,
} from './defaults';

// ============================================================================
// Interpolation Exports
// ============================================================================

export {
  // Core interpolation
  interpolate,
  interpolateEnv,
  interpolateObject,

  // Pattern utilities
  hasInterpolation,
  extractPatterns,
  resolveFilePath,

  // Security
  isSensitiveKey,
  maskSensitiveValues,

  // Validation helpers
  validateRequiredEnvVars,
  generateEnvTemplate,

  // Error types
  InterpolationError,

  // Types
  type InterpolationContext,
  type InterpolationResult,
  type InterpolatedVariable,
  type MissingVariable,
  type InterpolationStats,
} from './interpolation';

// ============================================================================
// Config Loading Exports
// ============================================================================

export {
  // Main API
  loadConfig,
  getConfig,
  getLoadedConfig,
  reloadConfig,
  clearConfigCache,

  // Debug utilities
  debugConfig,
  getConfigValue,

  // Error types
  ConfigFileError,
  ConfigValidationErrorAggregate,

  // Types
  type ConfigLoadOptions,
  type LoadedConfig,
  type ConfigWarning,
  type ConfigSources,
} from './config';

// ============================================================================
// Convenience Re-exports
// ============================================================================

import { getConfig as _getConfig, loadConfig as _loadConfig } from './config';
import type { Config as _Config } from './schema';

/**
 * Default export for simple usage
 */
export default {
  /**
   * Get the cached configuration or load it
   */
  get: _getConfig,

  /**
   * Load configuration with options
   */
  load: _loadConfig,
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid Config object
 */
export function isConfig(value: unknown): value is _Config {
  return (
    typeof value === 'object' &&
    value !== null &&
    'agent' in value &&
    typeof (value as Record<string, unknown>).agent === 'object'
  );
}

/**
 * Check if a string is a valid model identifier (provider/model format)
 */
export function isValidModelId(value: string): boolean {
  return /^[\w-]+\/[\w.-]+$/.test(value);
}

/**
 * Parse a model identifier into provider and model parts
 */
export function parseModelId(value: string): { provider: string; model: string } | null {
  const match = value.match(/^([\w-]+)\/([\w.-]+)$/);
  if (!match) return null;
  return { provider: match[1], model: match[2] };
}

// ============================================================================
// Config Builder (for programmatic config creation)
// ============================================================================

/**
 * Fluent builder for creating configuration objects
 */
export class ConfigBuilder {
  private config: Partial<_Config> = {};

  /**
   * Set the default model
   */
  model(modelId: string): this {
    this.config.model = modelId;
    return this;
  }

  /**
   * Set the small model for lightweight tasks
   */
  smallModel(modelId: string): this {
    this.config.smallModel = modelId;
    return this;
  }

  /**
   * Add a provider configuration
   */
  provider(name: string, config: NonNullable<_Config['provider']>[string]): this {
    this.config.provider = this.config.provider || {};
    this.config.provider[name] = config;
    return this;
  }

  /**
   * Add an agent configuration
   */
  agent(name: string, config: NonNullable<_Config['agent']>[string]): this {
    this.config.agent = this.config.agent || {};
    this.config.agent[name] = config;
    return this;
  }

  /**
   * Add an MCP server configuration
   */
  mcp(name: string, config: NonNullable<_Config['mcp']>[string]): this {
    this.config.mcp = this.config.mcp || {};
    this.config.mcp[name] = config;
    return this;
  }

  /**
   * Configure memory settings
   */
  memory(config: Partial<NonNullable<_Config['memory']>>): this {
    this.config.memory = { ...this.config.memory, ...config } as _Config['memory'];
    return this;
  }

  /**
   * Set log level
   */
  logLevel(level: _Config['logLevel']): this {
    this.config.logLevel = level;
    return this;
  }

  /**
   * Add a plugin
   */
  plugin(plugin: string | { name: string; enabled?: boolean; options?: Record<string, unknown> }): this {
    this.config.plugin = this.config.plugin || [];
    // Normalize the plugin entry to ensure enabled has a default value
    const entry = typeof plugin === 'string'
      ? plugin
      : { ...plugin, enabled: plugin.enabled ?? true };
    this.config.plugin.push(entry as NonNullable<_Config['plugin']>[number]);
    return this;
  }

  /**
   * Build the final configuration
   */
  build(): Partial<_Config> {
    return { ...this.config };
  }
}

/**
 * Create a new ConfigBuilder
 */
export function createConfig(): ConfigBuilder {
  return new ConfigBuilder();
}
