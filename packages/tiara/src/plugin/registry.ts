/**
 * Plugin Registry
 *
 * Central registry for plugin management with dependency resolution,
 * lifecycle management, and extension point collection.
 *
 * Ported from claude-flow v3 @claude-flow/plugins
 *
 * @module tiara/plugin/registry
 */

import { EventEmitter } from "events";
import type {
  IPlugin,
  PluginFactory,
  PluginConfig,
  PluginContext,
  PluginEntry,
  PluginExtensions,
  HealthCheckResult,
  RegistryStats,
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
 * Registry configuration
 */
export interface PluginRegistryConfig {
  /** Maximum number of plugins */
  maxPlugins?: number;
  /** Plugin initialization timeout in ms */
  initializationTimeout?: number;
  /** Health check interval in ms */
  healthCheckInterval?: number;
  /** Core version string */
  coreVersion?: string;
  /** Base data directory for plugins */
  dataDir?: string;
  /** Logger instance */
  logger?: IPluginLogger;
  /** Event bus instance */
  eventBus?: IPluginEventBus;
}

const DEFAULT_CONFIG: Required<Omit<PluginRegistryConfig, "logger" | "eventBus">> = {
  maxPlugins: 100,
  initializationTimeout: 30000,
  healthCheckInterval: 60000,
  coreVersion: "1.0.0",
  dataDir: "/tmp/tiara-plugins",
};

/**
 * Default plugin configuration
 */
const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  enabled: true,
  priority: 50,
  settings: {},
  timeout: 30000,
};

/**
 * Plugin Registry
 *
 * Manages plugin lifecycle, dependency resolution, and extension point collection.
 *
 * @example
 * const registry = new PluginRegistry({ coreVersion: '3.0.0' });
 *
 * // Register plugins
 * await registry.register(myPlugin);
 * await registry.register(anotherPlugin, { priority: 75 });
 *
 * // Initialize all plugins
 * await registry.initialize();
 *
 * // Get collected extension points
 * const tools = registry.getMCPTools();
 */
export class PluginRegistry extends EventEmitter {
  private readonly plugins = new Map<string, PluginEntry>();
  private readonly config: Required<Omit<PluginRegistryConfig, "logger" | "eventBus">>;
  private readonly logger: IPluginLogger;
  private readonly eventBus: IPluginEventBus;
  private readonly services: IServiceContainer;
  private initialized = false;
  private healthCheckTimer?: ReturnType<typeof setInterval>;

  // Extension point caches
  private agentTypesCache?: AgentTypeDefinition[];
  private taskTypesCache?: TaskTypeDefinition[];
  private mcpToolsCache?: MCPToolDefinition[];
  private cliCommandsCache?: CLICommandDefinition[];

  constructor(config?: PluginRegistryConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = config?.logger ?? this.createDefaultLogger();
    this.eventBus = config?.eventBus ?? this.createDefaultEventBus();
    this.services = this.createServiceContainer();
  }

  /**
   * Register a plugin
   */
  async register(
    pluginOrFactory: IPlugin | PluginFactory,
    config?: Partial<PluginConfig>
  ): Promise<void> {
    // Resolve plugin from factory if needed
    const plugin =
      typeof pluginOrFactory === "function" ? await pluginOrFactory() : pluginOrFactory;

    const name = plugin.metadata.name;

    // Validate
    if (this.plugins.has(name)) {
      throw new Error(`Plugin ${name} is already registered`);
    }

    if (this.plugins.size >= this.config.maxPlugins) {
      throw new Error(`Maximum plugin limit (${this.config.maxPlugins}) reached`);
    }

    // Validate plugin interface
    this.validatePlugin(plugin);

    // Merge config
    const pluginConfig: PluginConfig = {
      ...DEFAULT_PLUGIN_CONFIG,
      ...config,
      settings: { ...DEFAULT_PLUGIN_CONFIG.settings, ...config?.settings },
    };

    // Create entry
    const entry: PluginEntry = {
      plugin,
      config: pluginConfig,
      registeredAt: new Date(),
      extensions: {},
    };

    this.plugins.set(name, entry);
    this.emit(PLUGIN_EVENTS.LOADED, { plugin: name });
    this.logger.info(`Plugin ${name} registered`, { version: plugin.metadata.version });

    // Invalidate caches
    this.invalidateCaches();
  }

  /**
   * Unregister a plugin
   */
  async unregister(name: string): Promise<void> {
    const entry = this.plugins.get(name);
    if (!entry) {
      return;
    }

    // Shutdown if initialized
    if (entry.plugin.state === "initialized") {
      await entry.plugin.shutdown();
    }

    this.plugins.delete(name);
    this.services.register(`plugin:${name}`, undefined);
    this.invalidateCaches();

    this.logger.info(`Plugin ${name} unregistered`);
  }

  /**
   * Initialize all registered plugins
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new Error("Registry already initialized");
    }

    // Resolve dependency order
    const order = this.resolveDependencies();

    // Initialize in order
    for (const name of order) {
      const entry = this.plugins.get(name);
      if (!entry || !entry.config.enabled) continue;

      const startTime = Date.now();

      try {
        this.emit(PLUGIN_EVENTS.INITIALIZING, { plugin: name });

        const context = this.createPluginContext(entry);
        await this.initializeWithTimeout(entry.plugin, context);

        // Collect extension points
        this.collectExtensionPoints(entry);

        // Register as service for dependency resolution
        this.services.register(`plugin:${name}`, entry.plugin);

        entry.initializationTime = Date.now() - startTime;
        this.emit(PLUGIN_EVENTS.INITIALIZED, {
          plugin: name,
          time: entry.initializationTime,
        });

        this.logger.info(`Plugin ${name} initialized`, {
          time: entry.initializationTime,
        });
      } catch (error) {
        this.emit(PLUGIN_EVENTS.ERROR, {
          plugin: name,
          error: error instanceof Error ? error.message : String(error),
        });
        this.logger.error(`Plugin ${name} initialization failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other plugins
      }
    }

    this.initialized = true;

    // Start health check interval
    if (this.config.healthCheckInterval > 0) {
      this.healthCheckTimer = setInterval(() => {
        this.performHealthChecks();
      }, this.config.healthCheckInterval);
    }
  }

  /**
   * Shutdown all plugins
   */
  async shutdown(): Promise<void> {
    // Stop health checks
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    // Shutdown in reverse order of registration (simple approach to avoid
    // re-throwing circular dependency errors during shutdown)
    const order = Array.from(this.plugins.keys()).reverse();

    for (const name of order) {
      const entry = this.plugins.get(name);
      if (!entry || entry.plugin.state !== "initialized") continue;

      try {
        this.emit(PLUGIN_EVENTS.SHUTTING_DOWN, { plugin: name });
        await entry.plugin.shutdown();
        this.logger.info(`Plugin ${name} shutdown`);
      } catch (error) {
        this.logger.error(`Plugin ${name} shutdown failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.initialized = false;
  }

  /**
   * Get a registered plugin
   */
  get(name: string): IPlugin | undefined {
    return this.plugins.get(name)?.plugin;
  }

  /**
   * Check if a plugin is registered
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get all registered plugin names
   */
  names(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get all agent type definitions
   */
  getAgentTypes(): AgentTypeDefinition[] {
    if (!this.agentTypesCache) {
      this.agentTypesCache = this.collectAllExtensions("agentTypes");
    }
    return this.agentTypesCache;
  }

  /**
   * Get all task type definitions
   */
  getTaskTypes(): TaskTypeDefinition[] {
    if (!this.taskTypesCache) {
      this.taskTypesCache = this.collectAllExtensions("taskTypes");
    }
    return this.taskTypesCache;
  }

  /**
   * Get all MCP tool definitions
   */
  getMCPTools(): MCPToolDefinition[] {
    if (!this.mcpToolsCache) {
      this.mcpToolsCache = this.collectAllExtensions("mcpTools");
    }
    return this.mcpToolsCache;
  }

  /**
   * Get all CLI command definitions
   */
  getCLICommands(): CLICommandDefinition[] {
    if (!this.cliCommandsCache) {
      this.cliCommandsCache = this.collectAllExtensions("cliCommands");
    }
    return this.cliCommandsCache;
  }

  /**
   * Run health checks on all plugins
   */
  async healthCheck(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();

    for (const [name, entry] of this.plugins) {
      if (entry.plugin.healthCheck) {
        try {
          const result = await entry.plugin.healthCheck();
          results.set(name, result);
          entry.lastHealthCheck = result;
        } catch (error) {
          const result: HealthCheckResult = {
            healthy: false,
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
          };
          results.set(name, result);
          entry.lastHealthCheck = result;
        }
      }
    }

    return results;
  }

  /**
   * Get registry statistics
   */
  getStats(): RegistryStats {
    let initialized = 0;
    let failed = 0;

    for (const entry of this.plugins.values()) {
      if (entry.plugin.state === "initialized") initialized++;
      if (entry.plugin.state === "error") failed++;
    }

    return {
      totalPlugins: this.plugins.size,
      initializedPlugins: initialized,
      failedPlugins: failed,
      totalAgentTypes: this.getAgentTypes().length,
      totalTaskTypes: this.getTaskTypes().length,
      totalMCPTools: this.getMCPTools().length,
      totalCLICommands: this.getCLICommands().length,
    };
  }

  /**
   * Resolve plugin dependencies using topological sort
   */
  private resolveDependencies(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (name: string): void => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected: ${name}`);
      }

      visiting.add(name);

      const entry = this.plugins.get(name);
      if (entry) {
        const deps = entry.plugin.metadata.dependencies || [];
        for (const dep of deps) {
          if (this.plugins.has(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(name);
      visited.add(name);
      result.push(name);
    };

    // Sort by priority first, then visit
    const sorted = Array.from(this.plugins.entries())
      .sort((a, b) => b[1].config.priority - a[1].config.priority)
      .map(([name]) => name);

    for (const name of sorted) {
      visit(name);
    }

    return result;
  }

  /**
   * Initialize plugin with timeout
   */
  private async initializeWithTimeout(
    plugin: IPlugin,
    context: PluginContext
  ): Promise<void> {
    const timeout = this.config.initializationTimeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Plugin initialization timed out after ${timeout}ms`));
      }, timeout);
    });

    await Promise.race([plugin.initialize(context), timeoutPromise]);
  }

  /**
   * Create context for a plugin
   */
  private createPluginContext(entry: PluginEntry): PluginContext {
    return {
      config: entry.config,
      eventBus: this.eventBus,
      logger: this.createPluginLogger(entry.plugin.metadata.name),
      services: this.services,
      coreVersion: this.config.coreVersion,
      dataDir: `${this.config.dataDir}/${entry.plugin.metadata.name}`,
    };
  }

  /**
   * Create a logger for a specific plugin
   */
  private createPluginLogger(pluginName: string): IPluginLogger {
    return {
      debug: (msg, meta) => this.logger.debug(`[${pluginName}] ${msg}`, meta),
      info: (msg, meta) => this.logger.info(`[${pluginName}] ${msg}`, meta),
      warn: (msg, meta) => this.logger.warn(`[${pluginName}] ${msg}`, meta),
      error: (msg, meta) => this.logger.error(`[${pluginName}] ${msg}`, meta),
    };
  }

  /**
   * Collect extension points from a plugin
   */
  private collectExtensionPoints(entry: PluginEntry): void {
    const plugin = entry.plugin;
    const extensions: PluginExtensions = {};

    if (plugin.registerAgentTypes) {
      extensions.agentTypes = plugin.registerAgentTypes();
    }
    if (plugin.registerTaskTypes) {
      extensions.taskTypes = plugin.registerTaskTypes();
    }
    if (plugin.registerMCPTools) {
      extensions.mcpTools = plugin.registerMCPTools();
    }
    if (plugin.registerCLICommands) {
      extensions.cliCommands = plugin.registerCLICommands();
    }

    entry.extensions = extensions;
    this.invalidateCaches();
  }

  /**
   * Collect all extensions of a specific type
   */
  private collectAllExtensions<K extends keyof PluginExtensions>(
    type: K
  ): NonNullable<PluginExtensions[K]> {
    const result: unknown[] = [];

    for (const entry of this.plugins.values()) {
      const items = entry.extensions[type];
      if (items) {
        result.push(...items);
      }
    }

    return result as NonNullable<PluginExtensions[K]>;
  }

  /**
   * Invalidate extension caches
   */
  private invalidateCaches(): void {
    this.agentTypesCache = undefined;
    this.taskTypesCache = undefined;
    this.mcpToolsCache = undefined;
    this.cliCommandsCache = undefined;
  }

  /**
   * Validate plugin interface
   */
  private validatePlugin(plugin: IPlugin): void {
    if (!plugin.metadata) {
      throw new Error("Plugin missing metadata");
    }
    if (!plugin.metadata.name) {
      throw new Error("Plugin metadata missing name");
    }
    if (!plugin.metadata.version) {
      throw new Error("Plugin metadata missing version");
    }
    if (!/^\d+\.\d+\.\d+/.test(plugin.metadata.version)) {
      throw new Error(
        `Invalid version format: ${plugin.metadata.version}. Expected semantic versioning.`
      );
    }
    if (typeof plugin.initialize !== "function") {
      throw new Error("Plugin missing initialize method");
    }
    if (typeof plugin.shutdown !== "function") {
      throw new Error("Plugin missing shutdown method");
    }
  }

  /**
   * Perform periodic health checks
   */
  private async performHealthChecks(): Promise<void> {
    const results = await this.healthCheck();

    for (const [name, result] of results) {
      this.emit(PLUGIN_EVENTS.HEALTH_CHECK, { plugin: name, result });

      if (!result.healthy) {
        this.logger.warn(`Plugin ${name} health check failed`, {
          message: result.message,
        });
      }
    }
  }

  /**
   * Create default logger
   */
  private createDefaultLogger(): IPluginLogger {
    return {
      debug: (msg, meta) => console.debug(`[plugin-registry] ${msg}`, meta || ""),
      info: (msg, meta) => console.info(`[plugin-registry] ${msg}`, meta || ""),
      warn: (msg, meta) => console.warn(`[plugin-registry] ${msg}`, meta || ""),
      error: (msg, meta) => console.error(`[plugin-registry] ${msg}`, meta || ""),
    };
  }

  /**
   * Create default event bus
   */
  private createDefaultEventBus(): IPluginEventBus {
    const emitter = new EventEmitter();
    return {
      emit: (event, data) => emitter.emit(event, data),
      on: (event, handler) => {
        emitter.on(event, handler);
        return () => emitter.off(event, handler);
      },
      off: (event, handler) => emitter.off(event, handler),
      once: (event, handler) => emitter.once(event, handler),
    };
  }

  /**
   * Create service container
   */
  private createServiceContainer(): IServiceContainer {
    const services = new Map<string, unknown>();
    return {
      get: <T>(name: string) => services.get(name) as T | undefined,
      has: (name) => services.has(name),
      register: <T>(name: string, instance: T) => {
        if (instance === undefined) {
          services.delete(name);
        } else {
          services.set(name, instance);
        }
      },
    };
  }
}

// Default registry singleton
let defaultRegistry: PluginRegistry | undefined;

/**
 * Get the default plugin registry
 */
export function getDefaultRegistry(): PluginRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new PluginRegistry();
  }
  return defaultRegistry;
}

/**
 * Set the default plugin registry
 */
export function setDefaultRegistry(registry: PluginRegistry): void {
  defaultRegistry = registry;
}
