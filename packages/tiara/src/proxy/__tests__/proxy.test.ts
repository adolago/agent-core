import { describe, expect, it, jest, beforeEach, afterEach } from "@jest/globals";
import {
  // Tool Emulation
  ReActEmulator,
  PromptEmulator,
  ToolEmulator,
  executeEmulation,
  createReActEmulator,
  createPromptEmulator,
  createToolEmulator,
  // Provider Instructions
  BASE_INSTRUCTIONS,
  ANTHROPIC_INSTRUCTIONS,
  OPENAI_INSTRUCTIONS,
  GOOGLE_INSTRUCTIONS,
  getInstructionsForModel,
  taskRequiresFileOps,
  formatInstructions,
  getMaxTokensForModel,
  getParallelCapabilities,
  buildInstructions,
  // Adaptive Proxy
  AdaptiveProxy,
  createAdaptiveProxy,
  // Types
  ProxyEventTypes,
  Tool,
} from "../index.js";

describe("proxy module", () => {
  const sampleTools: Tool[] = [
    {
      name: "read_file",
      description: "Read contents of a file",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
        },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Write content to a file",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "search",
      description: "Search for text in files",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          path: { type: "string", description: "Directory to search" },
        },
        required: ["query"],
      },
    },
  ];

  describe("ReActEmulator", () => {
    let emulator: ReActEmulator;

    beforeEach(() => {
      emulator = new ReActEmulator(sampleTools);
    });

    describe("prompt building", () => {
      it("builds prompt with tools", () => {
        const prompt = emulator.buildPrompt("Find TODO comments");

        expect(prompt).toContain("read_file");
        expect(prompt).toContain("write_file");
        expect(prompt).toContain("search");
        expect(prompt).toContain("Find TODO comments");
        expect(prompt).toContain("Thought:");
        expect(prompt).toContain("Action:");
      });

      it("includes previous steps", () => {
        const previousSteps = "Thought: I need to search for files\nAction: search";
        const prompt = emulator.buildPrompt("Find TODO comments", previousSteps);

        expect(prompt).toContain("Previous Steps");
        expect(prompt).toContain(previousSteps);
      });
    });

    describe("response parsing", () => {
      it("parses tool call", () => {
        const response = `Thought: I need to read the file first
Action: read_file
Action Input: {"path": "/src/app.ts"}`;

        const parsed = emulator.parseResponse(response);

        expect(parsed.thought).toBe("I need to read the file first");
        expect(parsed.toolCall).toBeDefined();
        expect(parsed.toolCall?.name).toBe("read_file");
        expect(parsed.toolCall?.arguments).toEqual({ path: "/src/app.ts" });
      });

      it("parses final answer", () => {
        const response = `Thought: I have all the information needed
Final Answer: Found 5 TODO comments in the codebase.`;

        const parsed = emulator.parseResponse(response);

        expect(parsed.thought).toBe("I have all the information needed");
        expect(parsed.finalAnswer).toBe("Found 5 TODO comments in the codebase.");
        expect(parsed.toolCall).toBeUndefined();
      });

      it("handles malformed JSON", () => {
        const response = `Thought: Reading file
Action: read_file
Action Input: {path: "/invalid"}`;

        const parsed = emulator.parseResponse(response);

        // Should still extract action name even with malformed JSON
        expect(parsed.toolCall?.name).toBe("read_file");
      });
    });

    describe("observation appending", () => {
      it("appends observation", () => {
        const prompt = "Initial prompt";
        const observation = "File contains 100 lines";

        const result = emulator.appendObservation(prompt, observation);

        expect(result).toContain(prompt);
        expect(result).toContain("Observation:");
        expect(result).toContain(observation);
      });
    });

    it("creates via factory", () => {
      const created = createReActEmulator(sampleTools);
      expect(created).toBeInstanceOf(ReActEmulator);
    });
  });

  describe("PromptEmulator", () => {
    let emulator: PromptEmulator;

    beforeEach(() => {
      emulator = new PromptEmulator(sampleTools);
    });

    describe("prompt building", () => {
      it("builds simple prompt", () => {
        const prompt = emulator.buildPrompt("Read config.json");

        expect(prompt).toContain("read_file");
        expect(prompt).toContain("Read config.json");
        expect(prompt).toContain("json");
      });
    });

    describe("response parsing", () => {
      it("parses tool call in code block", () => {
        const response = `I'll read the file for you.

\`\`\`json
{"tool": "read_file", "args": {"path": "/config.json"}}
\`\`\``;

        const parsed = emulator.parseResponse(response);

        expect(parsed.toolCall).toBeDefined();
        expect(parsed.toolCall?.name).toBe("read_file");
        expect(parsed.toolCall?.arguments).toEqual({ path: "/config.json" });
      });

      it("parses direct JSON", () => {
        const response = `{"tool": "search", "args": {"query": "TODO"}}`;

        const parsed = emulator.parseResponse(response);

        expect(parsed.toolCall?.name).toBe("search");
        expect(parsed.toolCall?.arguments).toEqual({ query: "TODO" });
      });

      it("returns text response when no tool call", () => {
        const response = "Here's what I found in the file...";

        const parsed = emulator.parseResponse(response);

        expect(parsed.toolCall).toBeUndefined();
        expect(parsed.textResponse).toBe(response);
      });
    });

    it("creates via factory", () => {
      const created = createPromptEmulator(sampleTools);
      expect(created).toBeInstanceOf(PromptEmulator);
    });
  });

  describe("ToolEmulator", () => {
    describe("strategy selection", () => {
      it("uses react strategy", () => {
        const emulator = new ToolEmulator(sampleTools, "react");
        expect(emulator.getStrategy()).toBe("react");
      });

      it("uses prompt strategy", () => {
        const emulator = new ToolEmulator(sampleTools, "prompt");
        expect(emulator.getStrategy()).toBe("prompt");
      });

      it("defaults to react", () => {
        const emulator = new ToolEmulator(sampleTools);
        expect(emulator.getStrategy()).toBe("react");
      });
    });

    describe("tool validation", () => {
      let emulator: ToolEmulator;

      beforeEach(() => {
        emulator = new ToolEmulator(sampleTools);
      });

      it("validates correct tool call", () => {
        const result = emulator.validateToolCall({
          name: "read_file",
          arguments: { path: "/test.txt" },
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
      });

      it("rejects unknown tool", () => {
        const result = emulator.validateToolCall({
          name: "unknown_tool",
          arguments: {},
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Unknown tool: unknown_tool");
      });

      it("rejects missing required parameter", () => {
        const result = emulator.validateToolCall({
          name: "write_file",
          arguments: { path: "/test.txt" }, // Missing 'content'
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Missing required parameter: content");
      });

      it("rejects wrong parameter type", () => {
        const result = emulator.validateToolCall({
          name: "read_file",
          arguments: { path: 123 }, // Should be string
        });

        expect(result.valid).toBe(false);
        expect(result.errors?.[0]).toContain("expected string, got number");
      });
    });

    describe("confidence scoring", () => {
      let emulator: ToolEmulator;

      beforeEach(() => {
        emulator = new ToolEmulator(sampleTools);
      });

      it("high confidence for final answer", () => {
        const confidence = emulator.getConfidence({
          finalAnswer: "Task completed",
        });
        expect(confidence).toBe(0.9);
      });

      it("high confidence for valid tool call with thought", () => {
        const confidence = emulator.getConfidence({
          toolCall: { name: "read_file", arguments: { path: "/test" } },
          thought: "I need to read the file",
        });
        expect(confidence).toBeGreaterThan(0.9);
      });

      it("lower confidence for invalid tool call", () => {
        const confidence = emulator.getConfidence({
          toolCall: { name: "unknown", arguments: {} },
        });
        expect(confidence).toBe(0.5);
      });
    });

    it("returns tools", () => {
      const emulator = new ToolEmulator(sampleTools);
      expect(emulator.getTools()).toHaveLength(3);
    });

    it("creates via factory", () => {
      const created = createToolEmulator(sampleTools, "prompt");
      expect(created).toBeInstanceOf(ToolEmulator);
      expect(created.getStrategy()).toBe("prompt");
    });
  });

  describe("executeEmulation", () => {
    it("executes single tool call", async () => {
      const emulator = new ToolEmulator(sampleTools, "react");

      let callCount = 0;
      const modelCall = jest.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return `Thought: I need to read the file
Action: read_file
Action Input: {"path": "/test.txt"}`;
        }
        return `Thought: Got the content
Final Answer: File contains "hello world"`;
      });

      const toolExecutor = jest.fn(async () => "hello world");

      const result = await executeEmulation(
        emulator,
        "What's in test.txt?",
        modelCall,
        toolExecutor
      );

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe("read_file");
      expect(result.finalAnswer).toContain("hello world");
      expect(toolExecutor).toHaveBeenCalledTimes(1);
    });

    it("respects max iterations", async () => {
      const emulator = new ToolEmulator(sampleTools, "react");

      // Model always returns tool call, never final answer
      const modelCall = jest.fn(async () => {
        return `Thought: Need to search more
Action: search
Action Input: {"query": "test"}`;
      });

      const toolExecutor = jest.fn(async () => "no results");

      const result = await executeEmulation(
        emulator,
        "Find something",
        modelCall,
        toolExecutor,
        { maxIterations: 3 }
      );

      expect(modelCall).toHaveBeenCalledTimes(3);
      expect(result.toolCalls).toHaveLength(3);
      expect(result.confidence).toBeLessThan(0.5); // Low confidence at max iterations
    });
  });

  describe("Provider Instructions", () => {
    describe("getInstructionsForModel", () => {
      it("returns Anthropic instructions for Claude models", () => {
        const instructions = getInstructionsForModel("claude-opus-4");
        expect(instructions).toBe(ANTHROPIC_INSTRUCTIONS);
      });

      it("returns OpenAI instructions for GPT models", () => {
        const instructions = getInstructionsForModel("gpt-4o");
        expect(instructions).toBe(OPENAI_INSTRUCTIONS);
      });

      it("returns Google instructions for Gemini models", () => {
        const instructions = getInstructionsForModel("gemini-2.0-flash");
        expect(instructions).toBe(GOOGLE_INSTRUCTIONS);
      });

      it("uses provider hint", () => {
        const instructions = getInstructionsForModel("custom-model", "openai");
        expect(instructions).toBe(OPENAI_INSTRUCTIONS);
      });

      it("returns base instructions for unknown models", () => {
        const instructions = getInstructionsForModel("unknown-model");
        expect(instructions).toBe(BASE_INSTRUCTIONS);
      });
    });

    describe("taskRequiresFileOps", () => {
      it("detects file operations in prompt", () => {
        expect(
          taskRequiresFileOps("You are a coding assistant", [
            { content: "Please edit the config file" },
          ])
        ).toBe(true);
      });

      it("returns false for non-file tasks", () => {
        expect(
          taskRequiresFileOps("You are a chat assistant", [
            { content: "Tell me a joke" },
          ])
        ).toBe(false);
      });
    });

    describe("formatInstructions", () => {
      it("formats basic instructions", () => {
        const formatted = formatInstructions(BASE_INSTRUCTIONS);

        expect(formatted).toContain(BASE_INSTRUCTIONS.format);
      });

      it("includes examples", () => {
        const formatted = formatInstructions(ANTHROPIC_INSTRUCTIONS);

        expect(formatted).toContain("Examples:");
      });

      it("includes emphasis", () => {
        const formatted = formatInstructions(ANTHROPIC_INSTRUCTIONS);

        expect(formatted).toContain("IMPORTANT:");
      });

      it("adds XML instructions when requested", () => {
        const formatted = formatInstructions(BASE_INSTRUCTIONS, true);

        expect(formatted).toContain("<thinking>");
        expect(formatted).toContain("<result>");
      });
    });

    describe("getMaxTokensForModel", () => {
      it("returns correct limits for known models", () => {
        expect(getMaxTokensForModel("claude-opus-4")).toBe(32768);
        expect(getMaxTokensForModel("gpt-4o")).toBe(16384);
        expect(getMaxTokensForModel("gemini-2.0-flash")).toBe(8192);
      });

      it("respects requested limit", () => {
        expect(getMaxTokensForModel("claude-opus-4", 1000)).toBe(1000);
      });

      it("returns default for unknown models", () => {
        expect(getMaxTokensForModel("unknown-model")).toBe(4096);
      });
    });

    describe("getParallelCapabilities", () => {
      it("returns high capabilities for top models", () => {
        const caps = getParallelCapabilities("claude-opus-4");

        expect(caps.maxConcurrency).toBe(8);
        expect(caps.supportsSubprocesses).toBe(true);
        expect(caps.supportsReasoningBank).toBe(true);
      });

      it("returns medium capabilities for mid-tier models", () => {
        const caps = getParallelCapabilities("claude-sonnet-4");

        expect(caps.maxConcurrency).toBe(4);
        expect(caps.supportsSubprocesses).toBe(true);
      });

      it("returns basic capabilities for unknown models", () => {
        const caps = getParallelCapabilities("unknown-model");

        expect(caps.maxConcurrency).toBe(2);
        expect(caps.supportsSubprocesses).toBe(false);
      });
    });

    describe("buildInstructions", () => {
      it("builds basic instructions", () => {
        const instructions = buildInstructions("gpt-4o", "openai");

        expect(instructions).toContain("function calls");
      });

      it("adds parallel instructions when enabled", () => {
        const instructions = buildInstructions("claude-opus-4", "anthropic", {
          enableParallel: true,
        });

        expect(instructions).toContain("Concurrent Execution");
        expect(instructions).toContain("Max Concurrency");
      });

      it("adds ReasoningBank instructions when enabled", () => {
        const instructions = buildInstructions("claude-opus-4", "anthropic", {
          enableReasoningBank: true,
        });

        expect(instructions).toContain("ReasoningBank");
      });
    });
  });

  describe("AdaptiveProxy", () => {
    let proxy: AdaptiveProxy;

    beforeEach(() => {
      proxy = new AdaptiveProxy({
        enableHTTP2: true,
        enableWebSocket: true,
        enableHTTP1: true,
        enableHTTP3: false,
      });
    });

    afterEach(async () => {
      await proxy.stop();
    });

    describe("lifecycle", () => {
      it("starts proxy", async () => {
        const servers = await proxy.start();

        expect(servers.length).toBeGreaterThan(0);
        expect(proxy.getStatus().isRunning).toBe(true);
      });

      it("handles double start", async () => {
        await proxy.start();
        const servers = await proxy.start();

        expect(servers.length).toBeGreaterThan(0);
      });

      it("stops proxy", async () => {
        await proxy.start();
        await proxy.stop();

        expect(proxy.getStatus().isRunning).toBe(false);
        expect(proxy.getServers()).toHaveLength(0);
      });
    });

    describe("status", () => {
      it("returns status", async () => {
        await proxy.start();

        const status = proxy.getStatus();

        expect(status.isRunning).toBe(true);
        expect(status.servers.length).toBeGreaterThan(0);
        expect(status.enabledProtocols).toContain("http2");
        expect(status.enabledProtocols).toContain("http1");
        expect(status.enabledProtocols).toContain("websocket");
      });

      it("returns enabled protocols", () => {
        const status = proxy.getStatus();

        expect(status.enabledProtocols).not.toContain("http3");
      });
    });

    describe("protocol selection", () => {
      beforeEach(async () => {
        await proxy.start();
      });

      it("selects best available protocol", () => {
        const protocol = proxy.selectProtocol();

        expect(protocol).toBe("http2"); // Highest priority available
      });

      it("respects client capabilities", () => {
        const protocol = proxy.selectProtocol(["http1", "websocket"]);

        expect(protocol).toBe("http1");
      });

      it("returns null when no match", () => {
        const protocol = proxy.selectProtocol(["http3"]);

        expect(protocol).toBeNull();
      });
    });

    describe("server access", () => {
      beforeEach(async () => {
        await proxy.start();
      });

      it("gets server by protocol", () => {
        const server = proxy.getServerByProtocol("http2");

        expect(server).toBeDefined();
        expect(server?.protocol).toBe("http2");
      });

      it("returns undefined for unavailable protocol", () => {
        const server = proxy.getServerByProtocol("http3");

        expect(server).toBeUndefined();
      });

      it("checks protocol availability", () => {
        expect(proxy.hasProtocol("http2")).toBe(true);
        expect(proxy.hasProtocol("http3")).toBe(false);
      });
    });

    describe("events", () => {
      it("emits protocol selected event", async () => {
        const handler = jest.fn();
        proxy.on(ProxyEventTypes.PROTOCOL_SELECTED, handler);

        await proxy.start();

        expect(handler).toHaveBeenCalled();
      });
    });

    describe("configuration", () => {
      it("returns config", () => {
        const config = proxy.getConfig();

        expect(config.enableHTTP2).toBe(true);
        expect(config.enableHTTP3).toBe(false);
      });
    });

    it("creates via factory", () => {
      const created = createAdaptiveProxy();
      expect(created).toBeInstanceOf(AdaptiveProxy);
    });
  });
});
