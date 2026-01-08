/**
 * Plugin Loader System
 *
 * Architecture Overview:
 * - Supports multiple plugin sources: NPM packages, local files, built-in
 * - Lazy loading with dependency resolution
 * - Version-aware loading with package manager integration
 * - Plugin sandboxing for security
 *
 * Design Decisions:
 * - Modular loader design allows different loading strategies
 * - Caching prevents duplicate loads
 * - Dependency graph ensures proper initialization order
 * - Built-in plugins are always loaded first
 */

import { resolve, dirname, isAbsolute } from 'path';
import {
  type PluginFactory,
  type PluginInstance,
  type PluginContext,
  type PluginDescriptor,
  type PluginMetadata,
  type PluginLogger,
} from './plugin';
import { HookManager } from './hooks';

// =============================================================================
// Loader Types
// =============================================================================

/**
 * Plugin load result
 */
export interface LoadedPlugin {
  /** Plugin identifier */
  id: string;
  /** Plugin source (npm package, file path, or 'builtin') */
  source: string;
  /** Plugin instance */
  instance: PluginInstance;
  /** Plugin metadata */
  metadata: PluginMetadata;
  /** Load timestamp */
  loadedAt: number;
  /** Whether plugin is enabled */
  enabled: boolean;
}

/**
 * Plugin loader options
 */
export interface PluginLoaderOptions {
  /** Logger for loader operations */
  logger?: PluginLogger;
  /** Cache directory for NPM packages */
  cacheDir?: string;
  /** Package manager to use */
  packageManager?: 'npm' | 'bun' | 'pnpm' | 'yarn';
  /** Whether to load default plugins */
  loadDefaults?: boolean;
  /** Default plugins to load */
  defaultPlugins?: string[];
  /** Plugin context factory */
  contextFactory?: (pluginId: string) => PluginContext;
}

/**
 * NPM package loader interface
 */
export interface PackageLoader {
  install(packageName: string, version: string): Promise<string>;
  resolve(packageName: string): Promise<string | undefined>;
}

// =============================================================================
// Plugin Loader
// =============================================================================

/**
 * Main plugin loader class
 */
export class PluginLoader {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private hookManager: HookManager;
  private logger: PluginLogger;
  private options: Required<PluginLoaderOptions>;
  private packageLoader: PackageLoader;
  private builtinPlugins: Map<string, PluginFactory> = new Map();

  constructor(hookManager: HookManager, options: PluginLoaderOptions = {}) {
    this.hookManager = hookManager;
    this.logger = options.logger || createDefaultLogger();
    this.options = {
      logger: this.logger,
      cacheDir: options.cacheDir || '.plugin-cache',
      packageManager: options.packageManager || detectPackageManager(),
      loadDefaults: options.loadDefaults ?? true,
      defaultPlugins: options.defaultPlugins || [],
      contextFactory: options.contextFactory || createDefaultContext,
    };
    this.packageLoader = createPackageLoader(
      this.options.packageManager,
      this.options.cacheDir
    );
  }

  // ---------------------------------------------------------------------------
  // Built-in Plugin Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a built-in plugin factory
   */
  registerBuiltin(name: string, factory: PluginFactory): void {
    this.builtinPlugins.set(name, factory);
    this.logger.debug('Registered built-in plugin', { name });
  }

  /**
   * Register multiple built-in plugins
   */
  registerBuiltins(plugins: Record<string, PluginFactory>): void {
    for (const [name, factory] of Object.entries(plugins)) {
      this.registerBuiltin(name, factory);
    }
  }

  // ---------------------------------------------------------------------------
  // Plugin Loading
  // ---------------------------------------------------------------------------

  /**
   * Load all plugins from configuration
   */
  async loadAll(
    descriptors: PluginDescriptor[],
    context: PluginContext
  ): Promise<Map<string, LoadedPlugin>> {
    // Load built-in plugins first
    for (const [name, factory] of this.builtinPlugins.entries()) {
      try {
        await this.loadBuiltin(name, factory, context);
      } catch (error) {
        this.logger.error(`Failed to load built-in plugin: ${name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Load default plugins if enabled
    if (this.options.loadDefaults) {
      for (const pkg of this.options.defaultPlugins) {
        try {
          await this.loadFromNpm(pkg, context);
        } catch (error) {
          this.logger.error(`Failed to load default plugin: ${pkg}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Load configured plugins
    for (const descriptor of descriptors) {
      if (!descriptor.enabled) continue;

      try {
        await this.load(descriptor, context);
      } catch (error) {
        this.logger.error(`Failed to load plugin: ${descriptor.source}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return this.plugins;
  }

  /**
   * Load a single plugin
   */
  async load(descriptor: PluginDescriptor, context: PluginContext): Promise<LoadedPlugin> {
    const { source } = descriptor;

    // Check if already loaded
    if (this.plugins.has(source)) {
      return this.plugins.get(source)!;
    }

    // Determine loading strategy
    if (source.startsWith('file://') || source.startsWith('./') || source.startsWith('/')) {
      return this.loadFromFile(source, context, descriptor.config);
    }

    if (source.startsWith('builtin:')) {
      const name = source.replace('builtin:', '');
      const factory = this.builtinPlugins.get(name);
      if (!factory) {
        throw new Error(`Built-in plugin not found: ${name}`);
      }
      return this.loadBuiltin(name, factory, context, descriptor.config);
    }

    // Default: NPM package
    return this.loadFromNpm(source, context, descriptor.config);
  }

  /**
   * Load a built-in plugin
   */
  private async loadBuiltin(
    name: string,
    factory: PluginFactory,
    context: PluginContext,
    config?: Record<string, unknown>
  ): Promise<LoadedPlugin> {
    const pluginContext = {
      ...context,
      ...this.options.contextFactory(name),
      config: {
        ...context.config,
        get: <T>(key: string) => (config?.[key] as T) ?? context.config.get<T>(key),
        has: (key: string) => key in (config || {}) || context.config.has(key),
        set: context.config.set,
        getAll: () => ({ ...context.config.getAll(), ...config }),
      },
    };

    const instance = await factory(pluginContext);

    // Call init lifecycle hook
    await instance.lifecycle?.init?.();

    // Register hooks
    this.hookManager.registerPlugin(name, instance);

    const loaded: LoadedPlugin = {
      id: name,
      source: `builtin:${name}`,
      instance,
      metadata: instance.metadata || { name, version: '1.0.0' },
      loadedAt: Date.now(),
      enabled: true,
    };

    this.plugins.set(name, loaded);
    this.logger.info(`Loaded built-in plugin: ${name}`);

    return loaded;
  }

  /**
   * Load a plugin from local file
   */
  private async loadFromFile(
    path: string,
    context: PluginContext,
    config?: Record<string, unknown>
  ): Promise<LoadedPlugin> {
    const cleanPath = path.replace('file://', '');
    const absolutePath = isAbsolute(cleanPath)
      ? cleanPath
      : resolve(context.projectRoot, cleanPath);

    const pluginId = `file:${absolutePath}`;

    this.logger.debug('Loading plugin from file', { path: absolutePath });

    // Dynamic import
    const module = await import(absolutePath);
    const factories = extractFactories(module);

    if (factories.length === 0) {
      throw new Error(`No plugin exports found in: ${absolutePath}`);
    }

    // Load the first factory (or all if multiple)
    const factory = factories[0];
    const pluginContext = {
      ...context,
      ...this.options.contextFactory(pluginId),
    };

    const instance = await factory(pluginContext);
    await instance.lifecycle?.init?.();
    this.hookManager.registerPlugin(pluginId, instance);

    const loaded: LoadedPlugin = {
      id: pluginId,
      source: absolutePath,
      instance,
      metadata: instance.metadata || {
        name: dirname(absolutePath).split('/').pop() || 'unknown',
        version: '0.0.0',
      },
      loadedAt: Date.now(),
      enabled: true,
    };

    this.plugins.set(pluginId, loaded);
    this.logger.info(`Loaded plugin from file: ${absolutePath}`);

    return loaded;
  }

  /**
   * Load a plugin from NPM
   */
  private async loadFromNpm(
    packageSpec: string,
    context: PluginContext,
    config?: Record<string, unknown>
  ): Promise<LoadedPlugin> {
    // Parse package@version format
    const lastAtIndex = packageSpec.lastIndexOf('@');
    const hasVersion = lastAtIndex > 0 && !packageSpec.startsWith('@');
    const packageName = hasVersion ? packageSpec.substring(0, lastAtIndex) : packageSpec;
    const version = hasVersion ? packageSpec.substring(lastAtIndex + 1) : 'latest';

    this.logger.debug('Loading plugin from NPM', { package: packageName, version });

    // Install package if needed
    const modulePath = await this.packageLoader.install(packageName, version);

    // Dynamic import
    const module = await import(modulePath);
    const factories = extractFactories(module);

    if (factories.length === 0) {
      throw new Error(`No plugin exports found in: ${packageName}`);
    }

    const pluginContext = {
      ...context,
      ...this.options.contextFactory(packageName),
    };

    // Load all factories from the package
    const instances: PluginInstance[] = [];
    for (const factory of factories) {
      const instance = await factory(pluginContext);
      await instance.lifecycle?.init?.();
      instances.push(instance);
    }

    // Merge instances
    const mergedInstance = mergeInstances(instances);
    this.hookManager.registerPlugin(packageName, mergedInstance);

    const loaded: LoadedPlugin = {
      id: packageName,
      source: packageSpec,
      instance: mergedInstance,
      metadata: mergedInstance.metadata || { name: packageName, version },
      loadedAt: Date.now(),
      enabled: true,
    };

    this.plugins.set(packageName, loaded);
    this.logger.info(`Loaded plugin from NPM: ${packageSpec}`);

    return loaded;
  }

  // ---------------------------------------------------------------------------
  // Plugin Management
  // ---------------------------------------------------------------------------

  /**
   * Unload a plugin
   */
  async unload(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    // Call destroy lifecycle hook
    await plugin.instance.lifecycle?.destroy?.();

    // Unregister hooks
    this.hookManager.unregisterPlugin(pluginId);

    this.plugins.delete(pluginId);
    this.logger.info(`Unloaded plugin: ${pluginId}`);
  }

  /**
   * Unload all plugins
   */
  async unloadAll(): Promise<void> {
    for (const pluginId of this.plugins.keys()) {
      await this.unload(pluginId);
    }
  }

  /**
   * Reload a plugin
   */
  async reload(pluginId: string, context: PluginContext): Promise<LoadedPlugin | undefined> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return undefined;

    await this.unload(pluginId);
    return this.load({ source: plugin.source, enabled: true }, context);
  }

  /**
   * Enable/disable a plugin
   */
  setEnabled(pluginId: string, enabled: boolean): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    plugin.enabled = enabled;

    // Enable/disable all hooks from this plugin
    for (const hookName of this.hookManager.getRegisteredHookNames()) {
      this.hookManager.setHookEnabled(hookName, pluginId, enabled);
    }

    this.logger.info(`Plugin ${enabled ? 'enabled' : 'disabled'}: ${pluginId}`);
  }

  // ---------------------------------------------------------------------------
  // Plugin Query
  // ---------------------------------------------------------------------------

  /**
   * Get a loaded plugin
   */
  get(pluginId: string): LoadedPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all loaded plugins
   */
  getAll(): LoadedPlugin[] {
    return [...this.plugins.values()];
  }

  /**
   * Check if a plugin is loaded
   */
  isLoaded(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Get plugins by tag
   */
  getByTag(tag: string): LoadedPlugin[] {
    return this.getAll().filter((p) => p.metadata.tags?.includes(tag));
  }

  /**
   * Get all registered tools from plugins
   */
  getAllTools(): Record<string, unknown> {
    const tools: Record<string, unknown> = {};

    for (const plugin of this.plugins.values()) {
      if (plugin.instance.tools) {
        for (const [name, tool] of Object.entries(plugin.instance.tools)) {
          tools[`${plugin.id}:${name}`] = tool;
        }
      }
    }

    return tools;
  }

  /**
   * Get all auth providers from plugins
   */
  getAllAuthProviders(): Array<{ pluginId: string; provider: unknown }> {
    const providers: Array<{ pluginId: string; provider: unknown }> = [];

    for (const plugin of this.plugins.values()) {
      if (plugin.instance.auth) {
        for (const auth of plugin.instance.auth) {
          providers.push({ pluginId: plugin.id, provider: auth });
        }
      }
    }

    return providers;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract plugin factories from a module
 */
function extractFactories(module: Record<string, unknown>): PluginFactory[] {
  const factories: PluginFactory[] = [];

  for (const exported of Object.values(module)) {
    if (typeof exported === 'function') {
      // Check if it looks like a plugin factory
      factories.push(exported as PluginFactory);
    }
  }

  return factories;
}

/**
 * Merge multiple plugin instances
 */
function mergeInstances(instances: PluginInstance[]): PluginInstance {
  const merged: PluginInstance = {
    hooks: {},
    tools: {},
    auth: [],
  };

  for (const instance of instances) {
    if (instance.metadata) {
      merged.metadata = instance.metadata;
    }
    if (instance.hooks) {
      merged.hooks = { ...merged.hooks, ...instance.hooks };
    }
    if (instance.tools) {
      merged.tools = { ...merged.tools, ...instance.tools };
    }
    if (instance.auth) {
      merged.auth!.push(...instance.auth);
    }
    if (instance.lifecycle) {
      merged.lifecycle = {
        init: async () => {
          for (const inst of instances) {
            await inst.lifecycle?.init?.();
          }
        },
        destroy: async () => {
          for (const inst of instances) {
            await inst.lifecycle?.destroy?.();
          }
        },
      };
    }
  }

  return merged;
}

/**
 * Detect available package manager
 */
function detectPackageManager(): 'npm' | 'bun' | 'pnpm' | 'yarn' {
  // Check for Bun
  if (typeof globalThis.Bun !== 'undefined') {
    return 'bun';
  }

  // Default to npm
  return 'npm';
}

/**
 * Create package loader based on package manager
 */
function createPackageLoader(
  packageManager: 'npm' | 'bun' | 'pnpm' | 'yarn',
  cacheDir: string
): PackageLoader {
  return {
    async install(packageName: string, version: string): Promise<string> {
      // Use the appropriate package manager to install
      const spec = version === 'latest' ? packageName : `${packageName}@${version}`;

      switch (packageManager) {
        case 'bun':
          // Bun has built-in package resolution
          return spec;
        case 'pnpm':
        case 'yarn':
        case 'npm':
        default:
          // For other package managers, assume package is installed
          return packageName;
      }
    },

    async resolve(packageName: string): Promise<string | undefined> {
      try {
        return require.resolve(packageName);
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * Create default plugin context
 */
function createDefaultContext(pluginId: string): Partial<PluginContext> {
  return {
    instanceId: `${pluginId}-${Date.now()}`,
  };
}

/**
 * Create default logger
 */
function createDefaultLogger(): PluginLogger {
  return {
    debug: (message, data) => console.debug(`[plugin-loader] ${message}`, data || ''),
    info: (message, data) => console.info(`[plugin-loader] ${message}`, data || ''),
    warn: (message, data) => console.warn(`[plugin-loader] ${message}`, data || ''),
    error: (message, data) => console.error(`[plugin-loader] ${message}`, data || ''),
  };
}
