/**
 * Plugin Type Definitions
 *
 * Core types for the Tiara plugin system.
 * Enables modular extension of orchestration capabilities.
 *
 * Ported from claude-flow v3 @claude-flow/plugins
 *
 * @module tiara/plugin/types
 */

/**
 * Plugin lifecycle states
 */
export type PluginLifecycleState =
  | "uninitialized"
  | "initializing"
  | "initialized"
  | "shutting-down"
  | "shutdown"
  | "error";

/**
 * Plugin metadata describing the plugin
 */
export interface PluginMetadata {
  /** Unique plugin identifier */
  readonly name: string;
  /** Semantic version string */
  readonly version: string;
  /** Plugin description */
  readonly description?: string;
  /** Plugin author */
  readonly author?: string;
  /** License type */
  readonly license?: string;
  /** Source repository URL */
  readonly repository?: string;
  /** Plugin dependencies (other plugin names) */
  readonly dependencies?: string[];
  /** Peer dependencies with version constraints */
  readonly peerDependencies?: Record<string, string>;
  /** Minimum core version required */
  readonly minCoreVersion?: string;
  /** Maximum core version supported */
  readonly maxCoreVersion?: string;
  /** Tags for categorization/search */
  readonly tags?: string[];
}

/**
 * Plugin configuration options
 */
export interface PluginConfig {
  /** Whether the plugin is enabled */
  readonly enabled: boolean;
  /** Load priority (0-100, higher loads first) */
  readonly priority: number;
  /** Plugin-specific settings */
  readonly settings: Record<string, unknown>;
  /** Enable sandboxing */
  readonly sandbox?: boolean;
  /** Plugin operation timeout in ms */
  readonly timeout?: number;
  /** Maximum memory in MB */
  readonly maxMemoryMb?: number;
}

/**
 * Logger interface for plugins
 */
export interface IPluginLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Event bus interface for plugin communication
 */
export interface IPluginEventBus {
  emit(event: string, data?: unknown): void;
  on(event: string, handler: (data: unknown) => void): () => void;
  off(event: string, handler: (data: unknown) => void): void;
  once(event: string, handler: (data: unknown) => void): void;
}

/**
 * Service container for dependency injection
 */
export interface IServiceContainer {
  get<T>(name: string): T | undefined;
  has(name: string): boolean;
  register<T>(name: string, instance: T): void;
}

/**
 * Context provided to plugins during initialization
 */
export interface PluginContext {
  /** Plugin configuration */
  readonly config: PluginConfig;
  /** Event bus for communication */
  readonly eventBus: IPluginEventBus;
  /** Logger instance */
  readonly logger: IPluginLogger;
  /** Service container */
  readonly services: IServiceContainer;
  /** Core version string */
  readonly coreVersion: string;
  /** Data directory path for plugin storage */
  readonly dataDir: string;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Whether the plugin is healthy */
  healthy: boolean;
  /** Optional status message */
  message?: string;
  /** Additional metrics/details */
  details?: Record<string, unknown>;
  /** Timestamp of check */
  timestamp: Date;
}

/**
 * JSON Schema for input validation
 */
export interface JSONSchema {
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  properties?: Record<string, JSONSchema | JSONSchemaProperty>;
  required?: string[];
  items?: JSONSchema | JSONSchemaProperty;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface JSONSchemaProperty {
  type: "string" | "number" | "boolean" | "object" | "array" | "null";
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: JSONSchema | JSONSchemaProperty;
  properties?: Record<string, JSONSchema | JSONSchemaProperty>;
  required?: string[];
}

/**
 * MCP tool definition
 */
export interface MCPToolDefinition {
  /** Tool name */
  readonly name: string;
  /** Tool description */
  readonly description: string;
  /** Input schema */
  readonly inputSchema: {
    type: "object";
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
  };
  /** Tool handler */
  handler: (input: Record<string, unknown>) => Promise<MCPToolResult>;
}

/**
 * MCP tool result
 */
export interface MCPToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * CLI command argument definition
 */
export interface CLIArgumentDefinition {
  name: string;
  description: string;
  required?: boolean;
  default?: unknown;
}

/**
 * CLI command option definition
 */
export interface CLIOptionDefinition {
  name: string;
  short?: string;
  description: string;
  required?: boolean;
  default?: unknown;
  type?: "string" | "number" | "boolean";
}

/**
 * CLI command definition
 */
export interface CLICommandDefinition {
  /** Command name */
  readonly name: string;
  /** Command description */
  readonly description: string;
  /** Command aliases */
  readonly aliases?: string[];
  /** Positional arguments */
  readonly args?: CLIArgumentDefinition[];
  /** Command options */
  readonly options?: CLIOptionDefinition[];
  /** Command handler */
  handler: (args: Record<string, unknown>) => Promise<number>;
}

/**
 * Agent type definition for plugins
 */
export interface AgentTypeDefinition {
  /** Agent type identifier */
  readonly type: string;
  /** Display name */
  readonly name: string;
  /** Description */
  readonly description?: string;
  /** Agent capabilities */
  readonly capabilities: string[];
  /** System prompt */
  readonly systemPrompt?: string;
  /** Model to use */
  readonly model?: string;
  /** Temperature setting */
  readonly temperature?: number;
  /** Max tokens */
  readonly maxTokens?: number;
  /** Available tools */
  readonly tools?: string[];
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Task type definition for plugins
 */
export interface TaskTypeDefinition {
  /** Task type identifier */
  readonly type: string;
  /** Display name */
  readonly name: string;
  /** Description */
  readonly description?: string;
  /** Input validation schema */
  readonly inputSchema: JSONSchema;
  /** Output schema */
  readonly outputSchema?: JSONSchema;
  /** Handler identifier */
  readonly handler?: string;
  /** Timeout in ms */
  readonly timeout?: number;
  /** Number of retries */
  readonly retries?: number;
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Plugin events
 */
export const PLUGIN_EVENTS = {
  LOADING: "plugin:loading",
  LOADED: "plugin:loaded",
  INITIALIZING: "plugin:initializing",
  INITIALIZED: "plugin:initialized",
  SHUTTING_DOWN: "plugin:shutting-down",
  SHUTDOWN: "plugin:shutdown",
  ERROR: "plugin:error",
  HEALTH_CHECK: "plugin:health-check",
} as const;

export type PluginEvent = (typeof PLUGIN_EVENTS)[keyof typeof PLUGIN_EVENTS];

/**
 * Extension point registration from a plugin
 */
export interface PluginExtensions {
  agentTypes?: AgentTypeDefinition[];
  taskTypes?: TaskTypeDefinition[];
  mcpTools?: MCPToolDefinition[];
  cliCommands?: CLICommandDefinition[];
}

/**
 * Plugin interface - the core contract all plugins must implement
 */
export interface IPlugin {
  /** Plugin metadata */
  readonly metadata: PluginMetadata;
  /** Current lifecycle state */
  readonly state: PluginLifecycleState;

  /**
   * Initialize the plugin
   * @param context Plugin context with services and config
   */
  initialize(context: PluginContext): Promise<void>;

  /**
   * Shutdown the plugin gracefully
   */
  shutdown(): Promise<void>;

  /**
   * Optional health check
   */
  healthCheck?(): Promise<HealthCheckResult>;

  // Extension point registration methods (all optional)
  registerAgentTypes?(): AgentTypeDefinition[];
  registerTaskTypes?(): TaskTypeDefinition[];
  registerMCPTools?(): MCPToolDefinition[];
  registerCLICommands?(): CLICommandDefinition[];
}

/**
 * Plugin factory function type
 */
export type PluginFactory = () => IPlugin | Promise<IPlugin>;

/**
 * Plugin entry in the registry
 */
export interface PluginEntry {
  readonly plugin: IPlugin;
  readonly config: PluginConfig;
  readonly registeredAt: Date;
  readonly extensions: PluginExtensions;
  initializationTime?: number;
  lastHealthCheck?: HealthCheckResult;
}

/**
 * Registry statistics
 */
export interface RegistryStats {
  totalPlugins: number;
  initializedPlugins: number;
  failedPlugins: number;
  totalAgentTypes: number;
  totalTaskTypes: number;
  totalMCPTools: number;
  totalCLICommands: number;
}
