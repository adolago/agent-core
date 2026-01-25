import { describe, expect, it, jest, beforeEach, afterEach } from "@jest/globals";
import {
  PluginBuilder,
  MCPToolBuilder,
  AgentTypeBuilder,
  CLICommandBuilder,
  PluginRegistry,
  createSimplePlugin,
  createToolPlugin,
  BasePlugin,
  PLUGIN_EVENTS,
} from "../index.js";
import type { IPlugin, PluginMetadata, PluginContext, MCPToolDefinition } from "../index.js";

describe("plugin module", () => {
  describe("PluginBuilder", () => {
    it("creates a plugin with metadata", () => {
      const plugin = new PluginBuilder("test-plugin", "1.0.0")
        .withDescription("A test plugin")
        .withAuthor("Test Author")
        .withTags(["test", "example"])
        .build();

      expect(plugin.metadata.name).toBe("test-plugin");
      expect(plugin.metadata.version).toBe("1.0.0");
      expect(plugin.metadata.description).toBe("A test plugin");
      expect(plugin.metadata.author).toBe("Test Author");
      expect(plugin.metadata.tags).toEqual(["test", "example"]);
    });

    it("creates a plugin with MCP tools", () => {
      const tool: MCPToolDefinition = {
        name: "test-tool",
        description: "A test tool",
        inputSchema: { type: "object", properties: {} },
        handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
      };

      const plugin = new PluginBuilder("test-plugin", "1.0.0").withMCPTools([tool]).build();

      const tools = plugin.registerMCPTools?.() ?? [];
      expect(tools).toHaveLength(1);
      expect(tools[0]!.name).toBe("test-tool");
    });

    it("supports initialization handler", async () => {
      const initFn = jest.fn();

      const plugin = new PluginBuilder("test-plugin", "1.0.0")
        .onInitialize(async (ctx) => {
          initFn(ctx.config.enabled);
        })
        .build();

      const mockContext: PluginContext = {
        config: { enabled: true, priority: 50, settings: {} },
        eventBus: {
          emit: jest.fn(),
          on: jest.fn().mockReturnValue(() => {}),
          off: jest.fn(),
          once: jest.fn(),
        },
        logger: {
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        services: { get: jest.fn(), has: jest.fn(), register: jest.fn() },
        coreVersion: "1.0.0",
        dataDir: "/tmp",
      };

      await plugin.initialize(mockContext);
      expect(initFn).toHaveBeenCalledWith(true);
    });
  });

  describe("MCPToolBuilder", () => {
    it("creates a tool with parameters", async () => {
      const tool = new MCPToolBuilder("greeting-tool")
        .withDescription("Generates a greeting")
        .addStringParam("name", "Name to greet", { required: true })
        .addNumberParam("count", "Number of greetings", { default: 1 })
        .addBooleanParam("formal", "Use formal greeting", { default: false })
        .withHandler(async (params) => ({
          content: [{ type: "text", text: `Hello, ${params.name}!` }],
        }))
        .build();

      expect(tool.name).toBe("greeting-tool");
      expect(tool.description).toBe("Generates a greeting");
      expect(tool.inputSchema.properties.name).toBeDefined();
      expect(tool.inputSchema.properties.count).toBeDefined();
      expect(tool.inputSchema.properties.formal).toBeDefined();
      expect(tool.inputSchema.required).toContain("name");

      const result = await tool.handler({ name: "World" });
      expect(result.content[0]!.text).toBe("Hello, World!");
    });

    it("throws if no handler provided", () => {
      expect(() => {
        new MCPToolBuilder("no-handler").withDescription("Missing handler").build();
      }).toThrow("requires a handler");
    });
  });

  describe("AgentTypeBuilder", () => {
    it("creates an agent type definition", () => {
      const agentType = new AgentTypeBuilder("coder")
        .withName("Code Developer")
        .withDescription("Expert developer agent")
        .withCapabilities(["code-generation", "debugging"])
        .withSystemPrompt("You are an expert developer")
        .withModel("claude-3-sonnet")
        .withTemperature(0.7)
        .build();

      expect(agentType.type).toBe("coder");
      expect(agentType.name).toBe("Code Developer");
      expect(agentType.capabilities).toContain("code-generation");
      expect(agentType.systemPrompt).toBe("You are an expert developer");
      expect(agentType.temperature).toBe(0.7);
    });
  });

  describe("CLICommandBuilder", () => {
    it("creates a CLI command definition", async () => {
      const command = new CLICommandBuilder("greet")
        .withDescription("Greet someone")
        .withAliases(["g", "hello"])
        .addArg("name", "Name to greet", { required: true })
        .addOption("loud", "Shout the greeting", { short: "l", type: "boolean" })
        .withHandler(async (args) => {
          const name = args.name as string;
          const loud = args.loud as boolean;
          console.log(loud ? name.toUpperCase() : name);
          return 0;
        })
        .build();

      expect(command.name).toBe("greet");
      expect(command.aliases).toContain("g");
      expect(command.args?.[0]?.name).toBe("name");
      expect(command.options?.[0]?.name).toBe("loud");

      const result = await command.handler({ name: "World", loud: false });
      expect(result).toBe(0);
    });

    it("throws if no handler provided", () => {
      expect(() => {
        new CLICommandBuilder("no-handler").build();
      }).toThrow("requires a handler");
    });
  });

  describe("createSimplePlugin", () => {
    it("creates a functional plugin", async () => {
      const plugin = createSimplePlugin({
        metadata: { name: "simple", version: "1.0.0" },
        mcpTools: [
          {
            name: "echo",
            description: "Echo input",
            inputSchema: { type: "object", properties: {} },
            handler: async (input) => ({
              content: [{ type: "text", text: JSON.stringify(input) }],
            }),
          },
        ],
      });

      expect(plugin.metadata.name).toBe("simple");
      expect(plugin.registerMCPTools?.()).toHaveLength(1);
    });
  });

  describe("createToolPlugin", () => {
    it("creates a tool-only plugin", () => {
      const tools: MCPToolDefinition[] = [
        {
          name: "tool1",
          description: "Tool 1",
          inputSchema: { type: "object", properties: {} },
          handler: async () => ({ content: [{ type: "text", text: "1" }] }),
        },
        {
          name: "tool2",
          description: "Tool 2",
          inputSchema: { type: "object", properties: {} },
          handler: async () => ({ content: [{ type: "text", text: "2" }] }),
        },
      ];

      const plugin = createToolPlugin("tools", "1.0.0", tools);

      expect(plugin.metadata.name).toBe("tools");
      expect(plugin.registerMCPTools?.()).toHaveLength(2);
    });
  });

  describe("PluginRegistry", () => {
    let registry: PluginRegistry;

    beforeEach(() => {
      registry = new PluginRegistry({
        coreVersion: "3.0.0",
        dataDir: "/tmp/test-plugins",
      });
    });

    afterEach(async () => {
      await registry.shutdown();
    });

    it("registers a plugin", async () => {
      const plugin = new PluginBuilder("test", "1.0.0").build();

      await registry.register(plugin);

      expect(registry.has("test")).toBe(true);
      expect(registry.names()).toContain("test");
    });

    it("rejects duplicate plugins", async () => {
      const plugin1 = new PluginBuilder("test", "1.0.0").build();
      const plugin2 = new PluginBuilder("test", "1.0.1").build();

      await registry.register(plugin1);
      await expect(registry.register(plugin2)).rejects.toThrow("already registered");
    });

    it("validates plugin metadata", async () => {
      const badPlugin = {
        metadata: { name: "", version: "" },
        state: "uninitialized",
        initialize: jest.fn(),
        shutdown: jest.fn(),
      } as unknown as IPlugin;

      await expect(registry.register(badPlugin)).rejects.toThrow("missing name");
    });

    it("validates version format", async () => {
      const badPlugin = {
        metadata: { name: "bad", version: "invalid" },
        state: "uninitialized",
        initialize: jest.fn(),
        shutdown: jest.fn(),
      } as unknown as IPlugin;

      await expect(registry.register(badPlugin)).rejects.toThrow("Invalid version format");
    });

    it("initializes plugins in dependency order", async () => {
      const order: string[] = [];

      const pluginA = new PluginBuilder("plugin-a", "1.0.0")
        .withDependencies(["plugin-b"])
        .onInitialize(async () => {
          order.push("a");
        })
        .build();

      const pluginB = new PluginBuilder("plugin-b", "1.0.0")
        .onInitialize(async () => {
          order.push("b");
        })
        .build();

      await registry.register(pluginA);
      await registry.register(pluginB);
      await registry.initialize();

      // B should initialize before A due to dependency
      expect(order[0]).toBe("b");
      expect(order[1]).toBe("a");
    });

    it("detects circular dependencies", async () => {
      const pluginA = new PluginBuilder("plugin-a", "1.0.0")
        .withDependencies(["plugin-b"])
        .build();

      const pluginB = new PluginBuilder("plugin-b", "1.0.0")
        .withDependencies(["plugin-a"])
        .build();

      await registry.register(pluginA);
      await registry.register(pluginB);

      await expect(registry.initialize()).rejects.toThrow("Circular dependency");
    });

    it("collects extension points", async () => {
      const tool = new MCPToolBuilder("my-tool")
        .withDescription("Test")
        .withHandler(async () => ({ content: [{ type: "text", text: "ok" }] }))
        .build();

      const plugin = new PluginBuilder("test", "1.0.0").withMCPTools([tool]).build();

      await registry.register(plugin);
      await registry.initialize();

      const tools = registry.getMCPTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]!.name).toBe("my-tool");
    });

    it("unregisters plugins", async () => {
      const plugin = new PluginBuilder("test", "1.0.0").build();

      await registry.register(plugin);
      await registry.initialize();
      await registry.unregister("test");

      expect(registry.has("test")).toBe(false);
    });

    it("provides statistics", async () => {
      const plugin = new PluginBuilder("test", "1.0.0")
        .withMCPTools([
          {
            name: "t1",
            description: "",
            inputSchema: { type: "object", properties: {} },
            handler: async () => ({ content: [{ type: "text", text: "" }] }),
          },
        ])
        .build();

      await registry.register(plugin);
      await registry.initialize();

      const stats = registry.getStats();

      expect(stats.totalPlugins).toBe(1);
      expect(stats.initializedPlugins).toBe(1);
      expect(stats.totalMCPTools).toBe(1);
    });

    it("performs health checks", async () => {
      const plugin = new PluginBuilder("healthy", "1.0.0").build();

      await registry.register(plugin);
      await registry.initialize();

      const results = await registry.healthCheck();

      expect(results.has("healthy")).toBe(true);
      expect(results.get("healthy")!.healthy).toBe(true);
    });

    it("emits events during lifecycle", async () => {
      const events: string[] = [];

      registry.on(PLUGIN_EVENTS.LOADED, () => events.push("loaded"));
      registry.on(PLUGIN_EVENTS.INITIALIZING, () => events.push("initializing"));
      registry.on(PLUGIN_EVENTS.INITIALIZED, () => events.push("initialized"));

      const plugin = new PluginBuilder("test", "1.0.0").build();

      await registry.register(plugin);
      await registry.initialize();

      expect(events).toContain("loaded");
      expect(events).toContain("initializing");
      expect(events).toContain("initialized");
    });
  });

  describe("BasePlugin", () => {
    it("tracks lifecycle state", async () => {
      class TestPlugin extends BasePlugin {
        constructor() {
          super({ name: "test", version: "1.0.0" });
        }
      }

      const plugin = new TestPlugin();

      expect(plugin.state).toBe("uninitialized");

      const mockContext: PluginContext = {
        config: { enabled: true, priority: 50, settings: {} },
        eventBus: {
          emit: jest.fn(),
          on: jest.fn().mockReturnValue(() => {}),
          off: jest.fn(),
          once: jest.fn(),
        },
        logger: {
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        services: { get: jest.fn(), has: jest.fn(), register: jest.fn() },
        coreVersion: "1.0.0",
        dataDir: "/tmp",
      };

      await plugin.initialize(mockContext);
      expect(plugin.state).toBe("initialized");

      await plugin.shutdown();
      expect(plugin.state).toBe("shutdown");
    });

    it("prevents double initialization", async () => {
      class TestPlugin extends BasePlugin {
        constructor() {
          super({ name: "test", version: "1.0.0" });
        }
      }

      const plugin = new TestPlugin();
      const mockContext: PluginContext = {
        config: { enabled: true, priority: 50, settings: {} },
        eventBus: {
          emit: jest.fn(),
          on: jest.fn().mockReturnValue(() => {}),
          off: jest.fn(),
          once: jest.fn(),
        },
        logger: {
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        services: { get: jest.fn(), has: jest.fn(), register: jest.fn() },
        coreVersion: "1.0.0",
        dataDir: "/tmp",
      };

      await plugin.initialize(mockContext);
      await expect(plugin.initialize(mockContext)).rejects.toThrow("already initialized");
    });

    it("performs health check", async () => {
      class TestPlugin extends BasePlugin {
        constructor() {
          super({ name: "test", version: "1.0.0" });
        }

        protected async onHealthCheck(): Promise<Record<string, unknown>> {
          return { customMetric: 42 };
        }
      }

      const plugin = new TestPlugin();
      const mockContext: PluginContext = {
        config: { enabled: true, priority: 50, settings: {} },
        eventBus: {
          emit: jest.fn(),
          on: jest.fn().mockReturnValue(() => {}),
          off: jest.fn(),
          once: jest.fn(),
        },
        logger: {
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        services: { get: jest.fn(), has: jest.fn(), register: jest.fn() },
        coreVersion: "1.0.0",
        dataDir: "/tmp",
      };

      await plugin.initialize(mockContext);
      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.details?.customMetric).toBe(42);
    });
  });
});
