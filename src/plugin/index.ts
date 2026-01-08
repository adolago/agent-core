/**
 * Plugin System for Agent Core
 *
 * This module provides the extensibility layer for agent-core,
 * allowing plugins to extend functionality through hooks, tools,
 * and auth providers.
 *
 * Architecture:
 * - plugin.ts: Core interfaces and types
 * - hooks.ts: Hook management and execution
 * - loader.ts: Plugin loading and lifecycle
 * - builtin/: Built-in plugins
 */

// Core exports
export * from './plugin';
export * from './hooks';
export * from './loader';

// Built-in plugins
export * from './builtin';

import { HookManager, HOOK_TYPES } from './hooks';
import { PluginLoader, type PluginLoaderOptions } from './loader';
import { builtinPlugins, defaultPlugins, getAgentPlugins } from './builtin';
import type {
  PluginContext,
  PluginDescriptor,
  PluginInstance,
  Hooks,
  PluginLogger,
} from './plugin';

// =============================================================================
// Plugin System Facade
// =============================================================================

/**
 * Plugin system initialization options
 */
export interface PluginSystemOptions extends PluginLoaderOptions {
  /** Plugin descriptors to load */
  plugins?: PluginDescriptor[];
  /** Agent ID for domain-specific plugins */
  agentId?: string;
  /** Disable default plugins */
  disableDefaults?: boolean;
  /** Additional built-in plugins to register */
  additionalBuiltins?: Record<string, (ctx: PluginContext) => Promise<PluginInstance>>;
}

/**
 * Plugin system facade for easy integration
 */
export class PluginSystem {
  readonly hooks: HookManager;
  readonly loader: PluginLoader;
  private initialized = false;
  private logger: PluginLogger;

  constructor(options: PluginSystemOptions = {}) {
    this.logger = options.logger || createDefaultLogger();
    this.hooks = new HookManager(this.logger);
    this.loader = new PluginLoader(this.hooks, {
      ...options,
      logger: this.logger,
      loadDefaults: !options.disableDefaults,
      defaultPlugins: defaultPlugins,
    });

    // Register built-in plugins
    this.loader.registerBuiltins(builtinPlugins);

    // Register additional built-ins if provided
    if (options.additionalBuiltins) {
      this.loader.registerBuiltins(options.additionalBuiltins);
    }
  }

  /**
   * Initialize the plugin system
   */
  async init(context: PluginContext, options: PluginSystemOptions = {}): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Plugin system already initialized');
      return;
    }

    // Collect all plugins to load
    const descriptors: PluginDescriptor[] = [...(options.plugins || [])];

    // Add agent-specific plugins
    if (options.agentId) {
      const agentPlugins = getAgentPlugins(options.agentId);
      for (const name of agentPlugins) {
        descriptors.push({ source: `builtin:${name}`, enabled: true });
      }
    }

    // Load all plugins
    await this.loader.loadAll(descriptors, context);

    this.initialized = true;
    this.logger.info('Plugin system initialized', {
      pluginCount: this.loader.getAll().length,
    });
  }

  /**
   * Trigger a hook
   */
  async trigger<K extends keyof Hooks>(
    hookName: K,
    input: Parameters<NonNullable<Hooks[K]>>[0],
    output: Parameters<NonNullable<Hooks[K]>>[1]
  ): Promise<typeof output> {
    const result = await this.hooks.trigger(hookName, input, output, {
      continueOnError: true,
    });
    return result.output;
  }

  /**
   * Notify all hooks (no output transformation)
   */
  async notify<K extends keyof Hooks>(
    hookName: K,
    input: Parameters<NonNullable<Hooks[K]>>[0],
    output: Parameters<NonNullable<Hooks[K]>>[1]
  ): Promise<void> {
    await this.hooks.notify(hookName, input, output);
  }

  /**
   * Emit a system event
   */
  async emit(eventType: string, data: unknown): Promise<void> {
    await this.hooks.emitEvent({
      type: eventType,
      timestamp: Date.now(),
      data,
    });
  }

  /**
   * Get all registered tools
   */
  getTools(): Record<string, unknown> {
    return this.loader.getAllTools();
  }

  /**
   * Get all auth providers
   */
  getAuthProviders(): Array<{ pluginId: string; provider: unknown }> {
    return this.loader.getAllAuthProviders();
  }

  /**
   * Load a plugin dynamically
   */
  async loadPlugin(descriptor: PluginDescriptor, context: PluginContext): Promise<void> {
    await this.loader.load(descriptor, context);
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    await this.loader.unload(pluginId);
  }

  /**
   * Shutdown the plugin system
   */
  async shutdown(): Promise<void> {
    await this.loader.unloadAll();
    this.hooks.clear();
    this.initialized = false;
    this.logger.info('Plugin system shutdown');
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Create a new plugin system instance
 */
export function createPluginSystem(options?: PluginSystemOptions): PluginSystem {
  return new PluginSystem(options);
}

/**
 * Hook type constants for easy reference
 */
export { HOOK_TYPES };

// =============================================================================
// Default Logger
// =============================================================================

function createDefaultLogger(): PluginLogger {
  return {
    debug: (message, data) => console.debug(`[plugin-system] ${message}`, data || ''),
    info: (message, data) => console.info(`[plugin-system] ${message}`, data || ''),
    warn: (message, data) => console.warn(`[plugin-system] ${message}`, data || ''),
    error: (message, data) => console.error(`[plugin-system] ${message}`, data || ''),
  };
}
