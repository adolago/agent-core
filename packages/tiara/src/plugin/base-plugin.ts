/**
 * Base Plugin Implementation
 *
 * Abstract base class for creating plugins with common functionality.
 * Provides lifecycle management, logging, and utilities.
 *
 * Ported from claude-flow v3 @claude-flow/plugins
 *
 * @module tiara/plugin/base-plugin
 */

import { EventEmitter } from "events";
import type {
  IPlugin,
  PluginMetadata,
  PluginContext,
  PluginConfig,
  PluginLifecycleState,
  HealthCheckResult,
  AgentTypeDefinition,
  TaskTypeDefinition,
  MCPToolDefinition,
  CLICommandDefinition,
  IPluginLogger,
  IPluginEventBus,
  IServiceContainer,
} from "./types.js";
import { PLUGIN_EVENTS } from "./types.js";

/**
 * Abstract base plugin with common functionality
 *
 * @example
 * class MyPlugin extends BasePlugin {
 *   constructor() {
 *     super({
 *       name: 'my-plugin',
 *       version: '1.0.0',
 *       description: 'My awesome plugin',
 *     });
 *   }
 *
 *   protected async onInitialize(): Promise<void> {
 *     this.logger.info('Plugin initialized!');
 *   }
 *
 *   registerMCPTools(): MCPToolDefinition[] {
 *     return [{ name: 'my-tool', ... }];
 *   }
 * }
 */
export abstract class BasePlugin extends EventEmitter implements IPlugin {
  readonly metadata: PluginMetadata;
  private _state: PluginLifecycleState = "uninitialized";
  private _context?: PluginContext;
  private readonly startTime: number;

  constructor(metadata: PluginMetadata) {
    super();
    this.metadata = metadata;
    this.startTime = Date.now();
  }

  get state(): PluginLifecycleState {
    return this._state;
  }

  protected get context(): PluginContext {
    if (!this._context) {
      throw new Error(`Plugin ${this.metadata.name} not initialized`);
    }
    return this._context;
  }

  protected get config(): PluginConfig {
    return this.context.config;
  }

  protected get logger(): IPluginLogger {
    return this.context.logger;
  }

  protected get eventBus(): IPluginEventBus {
    return this.context.eventBus;
  }

  protected get services(): IServiceContainer {
    return this.context.services;
  }

  /**
   * Initialize the plugin
   */
  async initialize(context: PluginContext): Promise<void> {
    if (this._state !== "uninitialized") {
      throw new Error(
        `Plugin ${this.metadata.name} already initialized (state: ${this._state})`
      );
    }

    this._state = "initializing";
    this._context = context;

    try {
      // Validate dependencies if specified
      if (this.metadata.dependencies?.length) {
        this.validateDependencies();
      }

      // Call subclass initialization
      await this.onInitialize();

      this._state = "initialized";
      this.emit(PLUGIN_EVENTS.INITIALIZED, { plugin: this.metadata.name });
    } catch (error) {
      this._state = "error";
      this.emit(PLUGIN_EVENTS.ERROR, {
        plugin: this.metadata.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Shutdown the plugin
   */
  async shutdown(): Promise<void> {
    if (this._state !== "initialized" && this._state !== "error") {
      return; // Already shutdown or not initialized
    }

    this._state = "shutting-down";

    try {
      await this.onShutdown();
      this._state = "shutdown";
      this.emit(PLUGIN_EVENTS.SHUTDOWN, { plugin: this.metadata.name });
    } catch (error) {
      this._state = "error";
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const baseResult: HealthCheckResult = {
      healthy: this._state === "initialized",
      message:
        this._state === "initialized" ? "Plugin is healthy" : `Plugin state: ${this._state}`,
      timestamp: new Date(),
      details: {
        uptime: this.getUptime(),
        state: this._state,
      },
    };

    try {
      const additionalDetails = await this.onHealthCheck();
      return {
        ...baseResult,
        details: { ...baseResult.details, ...additionalDetails },
      };
    } catch (error) {
      return {
        ...baseResult,
        healthy: false,
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Override in subclass for custom initialization
   */
  protected async onInitialize(): Promise<void> {
    // Default: no-op
  }

  /**
   * Override in subclass for custom shutdown
   */
  protected async onShutdown(): Promise<void> {
    // Default: no-op
  }

  /**
   * Override in subclass for custom health check details
   */
  protected async onHealthCheck(): Promise<Record<string, unknown>> {
    return {};
  }

  /**
   * Get a setting value with optional default
   */
  protected getSetting<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.config.settings[key];
    return value !== undefined ? (value as T) : defaultValue;
  }

  /**
   * Get plugin uptime in milliseconds
   */
  protected getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Create a child logger with additional context
   */
  protected createChildLogger(context: Record<string, unknown>): IPluginLogger {
    const parentLogger = this.logger;
    return {
      debug: (msg, meta) => parentLogger.debug(msg, { ...context, ...meta }),
      info: (msg, meta) => parentLogger.info(msg, { ...context, ...meta }),
      warn: (msg, meta) => parentLogger.warn(msg, { ...context, ...meta }),
      error: (msg, meta) => parentLogger.error(msg, { ...context, ...meta }),
    };
  }

  /**
   * Validate that all declared dependencies are available
   */
  private validateDependencies(): void {
    // Dependencies are validated by the registry before initialization
    // This is a safety check for runtime validation
    const deps = this.metadata.dependencies || [];
    for (const dep of deps) {
      if (!this.services.has(`plugin:${dep}`)) {
        throw new Error(`Missing dependency: ${dep}`);
      }
    }
  }

  // Extension point methods - override in subclasses
  registerAgentTypes?(): AgentTypeDefinition[];
  registerTaskTypes?(): TaskTypeDefinition[];
  registerMCPTools?(): MCPToolDefinition[];
  registerCLICommands?(): CLICommandDefinition[];
}

/**
 * Configuration for simple plugin creation
 */
export interface SimplePluginConfig {
  metadata: PluginMetadata;
  onInitialize?: (context: PluginContext) => Promise<void>;
  onShutdown?: () => Promise<void>;
  onHealthCheck?: () => Promise<Record<string, unknown>>;
  agentTypes?: AgentTypeDefinition[];
  taskTypes?: TaskTypeDefinition[];
  mcpTools?: MCPToolDefinition[];
  cliCommands?: CLICommandDefinition[];
}

/**
 * Create a simple plugin from configuration
 *
 * @example
 * const plugin = createSimplePlugin({
 *   metadata: { name: 'my-plugin', version: '1.0.0' },
 *   mcpTools: [{ name: 'my-tool', ... }],
 *   onInitialize: async (ctx) => {
 *     ctx.logger.info('Plugin ready!');
 *   },
 * });
 */
export function createSimplePlugin(config: SimplePluginConfig): IPlugin {
  class SimplePlugin extends BasePlugin {
    constructor() {
      super(config.metadata);
    }

    protected async onInitialize(): Promise<void> {
      if (config.onInitialize) {
        await config.onInitialize(this.context);
      }
    }

    protected async onShutdown(): Promise<void> {
      if (config.onShutdown) {
        await config.onShutdown();
      }
    }

    protected async onHealthCheck(): Promise<Record<string, unknown>> {
      if (config.onHealthCheck) {
        return config.onHealthCheck();
      }
      return {};
    }

    registerAgentTypes(): AgentTypeDefinition[] {
      return config.agentTypes || [];
    }

    registerTaskTypes(): TaskTypeDefinition[] {
      return config.taskTypes || [];
    }

    registerMCPTools(): MCPToolDefinition[] {
      return config.mcpTools || [];
    }

    registerCLICommands(): CLICommandDefinition[] {
      return config.cliCommands || [];
    }
  }

  return new SimplePlugin();
}
