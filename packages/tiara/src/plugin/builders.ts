/**
 * Plugin Builders
 *
 * Fluent builder API for creating plugins and extension points.
 * Provides type-safe, ergonomic plugin development.
 *
 * Ported from claude-flow v3 @claude-flow/plugins
 *
 * @module tiara/plugin/builders
 */

import type {
  IPlugin,
  PluginMetadata,
  PluginContext,
  PluginConfig,
  AgentTypeDefinition,
  TaskTypeDefinition,
  MCPToolDefinition,
  MCPToolResult,
  CLICommandDefinition,
  JSONSchemaProperty,
} from "./types.js";
import { createSimplePlugin } from "./base-plugin.js";
import { getDefaultRegistry } from "./registry.js";

/**
 * Plugin Builder
 *
 * Fluent API for creating plugins.
 *
 * @example
 * const plugin = new PluginBuilder('my-plugin', '1.0.0')
 *   .withDescription('My awesome plugin')
 *   .withMCPTools([myTool])
 *   .onInitialize(async (ctx) => {
 *     ctx.logger.info('Ready!');
 *   })
 *   .build();
 */
export class PluginBuilder {
  private metadata: PluginMetadata;
  private agentTypes: AgentTypeDefinition[] = [];
  private taskTypes: TaskTypeDefinition[] = [];
  private mcpTools: MCPToolDefinition[] = [];
  private cliCommands: CLICommandDefinition[] = [];
  private initHandler?: (context: PluginContext) => Promise<void>;
  private shutdownHandler?: () => Promise<void>;
  private healthCheckHandler?: () => Promise<Record<string, unknown>>;

  constructor(name: string, version: string) {
    this.metadata = { name, version };
  }

  // Metadata methods
  withDescription(description: string): this {
    this.metadata = { ...this.metadata, description };
    return this;
  }

  withAuthor(author: string): this {
    this.metadata = { ...this.metadata, author };
    return this;
  }

  withLicense(license: string): this {
    this.metadata = { ...this.metadata, license };
    return this;
  }

  withRepository(repository: string): this {
    this.metadata = { ...this.metadata, repository };
    return this;
  }

  withDependencies(dependencies: string[]): this {
    this.metadata = { ...this.metadata, dependencies };
    return this;
  }

  withTags(tags: string[]): this {
    this.metadata = { ...this.metadata, tags };
    return this;
  }

  withMinCoreVersion(minCoreVersion: string): this {
    this.metadata = { ...this.metadata, minCoreVersion };
    return this;
  }

  // Extension points
  withAgentTypes(types: AgentTypeDefinition[]): this {
    this.agentTypes.push(...types);
    return this;
  }

  withTaskTypes(types: TaskTypeDefinition[]): this {
    this.taskTypes.push(...types);
    return this;
  }

  withMCPTools(tools: MCPToolDefinition[]): this {
    this.mcpTools.push(...tools);
    return this;
  }

  withCLICommands(commands: CLICommandDefinition[]): this {
    this.cliCommands.push(...commands);
    return this;
  }

  // Lifecycle
  onInitialize(handler: (context: PluginContext) => Promise<void>): this {
    this.initHandler = handler;
    return this;
  }

  onShutdown(handler: () => Promise<void>): this {
    this.shutdownHandler = handler;
    return this;
  }

  onHealthCheck(handler: () => Promise<Record<string, unknown>>): this {
    this.healthCheckHandler = handler;
    return this;
  }

  /**
   * Build the plugin
   */
  build(): IPlugin {
    return createSimplePlugin({
      metadata: this.metadata,
      agentTypes: this.agentTypes,
      taskTypes: this.taskTypes,
      mcpTools: this.mcpTools,
      cliCommands: this.cliCommands,
      onInitialize: this.initHandler,
      onShutdown: this.shutdownHandler,
      onHealthCheck: this.healthCheckHandler,
    });
  }

  /**
   * Build and register with the default registry
   */
  async buildAndRegister(config?: Partial<PluginConfig>): Promise<IPlugin> {
    const plugin = this.build();
    await getDefaultRegistry().register(plugin, config);
    return plugin;
  }
}

/**
 * MCP Tool Builder
 *
 * Type-safe builder for MCP tools.
 *
 * @example
 * const tool = new MCPToolBuilder('my-tool')
 *   .withDescription('Does something useful')
 *   .addStringParam('input', 'The input text', { required: true })
 *   .addNumberParam('count', 'Number of items', { default: 10 })
 *   .withHandler(async (params) => {
 *     return { content: [{ type: 'text', text: `Got: ${params.input}` }] };
 *   })
 *   .build();
 */
export class MCPToolBuilder {
  private name: string;
  private description = "";
  private properties: Record<string, JSONSchemaProperty> = {};
  private required: string[] = [];
  private handler?: MCPToolDefinition["handler"];

  constructor(name: string) {
    this.name = name;
  }

  withDescription(description: string): this {
    this.description = description;
    return this;
  }

  addStringParam(
    name: string,
    description: string,
    options?: { required?: boolean; default?: string; enum?: string[]; pattern?: string }
  ): this {
    this.properties[name] = {
      type: "string",
      description,
      default: options?.default,
      enum: options?.enum,
      pattern: options?.pattern,
    };
    if (options?.required) {
      this.required.push(name);
    }
    return this;
  }

  addNumberParam(
    name: string,
    description: string,
    options?: { required?: boolean; default?: number; minimum?: number; maximum?: number }
  ): this {
    this.properties[name] = {
      type: "number",
      description,
      default: options?.default,
      minimum: options?.minimum,
      maximum: options?.maximum,
    };
    if (options?.required) {
      this.required.push(name);
    }
    return this;
  }

  addBooleanParam(
    name: string,
    description: string,
    options?: { required?: boolean; default?: boolean }
  ): this {
    this.properties[name] = {
      type: "boolean",
      description,
      default: options?.default,
    };
    if (options?.required) {
      this.required.push(name);
    }
    return this;
  }

  addObjectParam(
    name: string,
    description: string,
    schema: JSONSchemaProperty,
    options?: { required?: boolean }
  ): this {
    this.properties[name] = {
      type: "object",
      description,
      ...schema,
    };
    if (options?.required) {
      this.required.push(name);
    }
    return this;
  }

  addArrayParam(
    name: string,
    description: string,
    itemsSchema: JSONSchemaProperty,
    options?: { required?: boolean }
  ): this {
    this.properties[name] = {
      type: "array",
      description,
      items: itemsSchema,
    };
    if (options?.required) {
      this.required.push(name);
    }
    return this;
  }

  withHandler(handler: (input: Record<string, unknown>) => Promise<MCPToolResult>): this {
    this.handler = handler;
    return this;
  }

  build(): MCPToolDefinition {
    if (!this.handler) {
      throw new Error(`Tool ${this.name} requires a handler`);
    }

    return {
      name: this.name,
      description: this.description,
      inputSchema: {
        type: "object",
        properties: this.properties,
        required: this.required.length > 0 ? this.required : undefined,
      },
      handler: this.handler,
    };
  }
}

/**
 * Agent Type Builder
 *
 * Builder for creating agent type definitions.
 *
 * @example
 * const agentType = new AgentTypeBuilder('coder')
 *   .withName('Code Developer')
 *   .withCapabilities(['code-generation', 'debugging'])
 *   .withSystemPrompt('You are an expert developer...')
 *   .build();
 */
export class AgentTypeBuilder {
  private type: string;
  private name = "";
  private description?: string;
  private capabilities: string[] = [];
  private systemPrompt?: string;
  private model?: string;
  private temperature?: number;
  private maxTokens?: number;
  private tools?: string[];
  private metadata?: Record<string, unknown>;

  constructor(type: string) {
    this.type = type;
    this.name = type;
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withDescription(description: string): this {
    this.description = description;
    return this;
  }

  withCapabilities(capabilities: string[]): this {
    this.capabilities.push(...capabilities);
    return this;
  }

  withSystemPrompt(prompt: string): this {
    this.systemPrompt = prompt;
    return this;
  }

  withModel(model: string): this {
    this.model = model;
    return this;
  }

  withTemperature(temperature: number): this {
    this.temperature = temperature;
    return this;
  }

  withMaxTokens(maxTokens: number): this {
    this.maxTokens = maxTokens;
    return this;
  }

  withTools(tools: string[]): this {
    this.tools = tools;
    return this;
  }

  withMetadata(metadata: Record<string, unknown>): this {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }

  build(): AgentTypeDefinition {
    return {
      type: this.type,
      name: this.name,
      description: this.description,
      capabilities: this.capabilities,
      systemPrompt: this.systemPrompt,
      model: this.model,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      tools: this.tools,
      metadata: this.metadata,
    };
  }
}

/**
 * CLI Command Builder
 *
 * Builder for creating CLI command definitions.
 *
 * @example
 * const command = new CLICommandBuilder('my-command')
 *   .withDescription('Does something')
 *   .addArg('input', 'Input file', { required: true })
 *   .addOption('verbose', 'Enable verbose output', { short: 'v', type: 'boolean' })
 *   .withHandler(async (args) => {
 *     console.log('Running with:', args);
 *     return 0;
 *   })
 *   .build();
 */
export class CLICommandBuilder {
  private name: string;
  private description = "";
  private aliases: string[] = [];
  private args: { name: string; description: string; required?: boolean; default?: unknown }[] =
    [];
  private options: {
    name: string;
    short?: string;
    description: string;
    required?: boolean;
    default?: unknown;
    type?: "string" | "number" | "boolean";
  }[] = [];
  private handler?: (args: Record<string, unknown>) => Promise<number>;

  constructor(name: string) {
    this.name = name;
  }

  withDescription(description: string): this {
    this.description = description;
    return this;
  }

  withAliases(aliases: string[]): this {
    this.aliases.push(...aliases);
    return this;
  }

  addArg(
    name: string,
    description: string,
    options?: { required?: boolean; default?: unknown }
  ): this {
    this.args.push({ name, description, ...options });
    return this;
  }

  addOption(
    name: string,
    description: string,
    options?: {
      short?: string;
      required?: boolean;
      default?: unknown;
      type?: "string" | "number" | "boolean";
    }
  ): this {
    this.options.push({ name, description, ...options });
    return this;
  }

  withHandler(handler: (args: Record<string, unknown>) => Promise<number>): this {
    this.handler = handler;
    return this;
  }

  build(): CLICommandDefinition {
    if (!this.handler) {
      throw new Error(`Command ${this.name} requires a handler`);
    }

    return {
      name: this.name,
      description: this.description,
      aliases: this.aliases.length > 0 ? this.aliases : undefined,
      args: this.args.length > 0 ? this.args : undefined,
      options: this.options.length > 0 ? this.options : undefined,
      handler: this.handler,
    };
  }
}

// Quick creation helpers

/**
 * Create a tool-only plugin
 */
export function createToolPlugin(
  name: string,
  version: string,
  tools: MCPToolDefinition[]
): IPlugin {
  return new PluginBuilder(name, version)
    .withDescription(`Tool plugin providing ${tools.length} MCP tools`)
    .withMCPTools(tools)
    .build();
}

/**
 * Create a command-only plugin
 */
export function createCommandPlugin(
  name: string,
  version: string,
  commands: CLICommandDefinition[]
): IPlugin {
  return new PluginBuilder(name, version)
    .withDescription(`Command plugin providing ${commands.length} CLI commands`)
    .withCLICommands(commands)
    .build();
}

/**
 * Create an agent types plugin
 */
export function createAgentTypesPlugin(
  name: string,
  version: string,
  agentTypes: AgentTypeDefinition[]
): IPlugin {
  return new PluginBuilder(name, version)
    .withDescription(`Agent plugin providing ${agentTypes.length} agent types`)
    .withAgentTypes(agentTypes)
    .build();
}
