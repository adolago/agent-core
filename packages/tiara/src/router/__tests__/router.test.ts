import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import {
  ModelRouter,
  createRouter,
  mapModelId,
  getModelName,
  getModelCapabilities,
  listModels,
  getModelFamily,
  modelSupports,
  findModelsWithCapabilities,
  CLAUDE_MODELS,
  GPT_MODELS,
  ALL_MODELS,
} from "../index.js";

describe("router module", () => {
  describe("Model Mapping", () => {
    describe("mapModelId", () => {
      it("maps Anthropic ID to OpenRouter format", () => {
        const result = mapModelId("claude-sonnet-4-5-20250929", "openrouter");
        expect(result).toBe("anthropic/claude-sonnet-4.5");
      });

      it("maps OpenRouter ID to Anthropic format", () => {
        const result = mapModelId("anthropic/claude-sonnet-4.5", "anthropic");
        expect(result).toBe("claude-sonnet-4-5-20250929");
      });

      it("maps canonical name to provider format", () => {
        const result = mapModelId("claude-sonnet-4.5", "anthropic");
        expect(result).toBe("claude-sonnet-4-5-20250929");
      });

      it("returns original ID when already in target format", () => {
        const anthropicId = "claude-sonnet-4-5-20250929";
        expect(mapModelId(anthropicId, "anthropic")).toBe(anthropicId);

        const openrouterId = "anthropic/claude-sonnet-4.5";
        expect(mapModelId(openrouterId, "openrouter")).toBe(openrouterId);
      });

      it("handles GPT models", () => {
        expect(mapModelId("gpt-4o", "openrouter")).toBe("openai/gpt-4o");
        expect(mapModelId("openai/gpt-4o", "anthropic")).toBe("gpt-4o");
      });

      it("handles Gemini models", () => {
        expect(mapModelId("gemini-2.0-flash", "openrouter")).toBe("google/gemini-2.0-flash-exp");
      });

      it("returns original for unknown models", () => {
        expect(mapModelId("unknown-model", "anthropic")).toBe("unknown-model");
      });
    });

    describe("getModelName", () => {
      it("returns canonical name for known models", () => {
        expect(getModelName("claude-sonnet-4-5-20250929")).toBe("Claude Sonnet 4.5");
        expect(getModelName("anthropic/claude-sonnet-4.5")).toBe("Claude Sonnet 4.5");
      });

      it("returns original ID for unknown models", () => {
        expect(getModelName("unknown-model")).toBe("unknown-model");
      });
    });

    describe("getModelCapabilities", () => {
      it("returns capabilities for known models", () => {
        // Use actual Anthropic model ID format
        const caps = getModelCapabilities("claude-sonnet-4-5-20250929");
        expect(caps).toBeDefined();
        expect(caps!.supportsTools).toBe(true);
        expect(caps!.supportsMCP).toBe(true);
        expect(caps!.maxContextLength).toBe(200000);
      });

      it("returns undefined for unknown models", () => {
        expect(getModelCapabilities("unknown-model")).toBeUndefined();
      });
    });

    describe("listModels", () => {
      it("lists Anthropic models", () => {
        const models = listModels("anthropic");
        expect(models).toContain("claude-sonnet-4-5-20250929");
        expect(models).toContain("claude-opus-4-5-20251101");
      });

      it("lists OpenRouter models", () => {
        const models = listModels("openrouter");
        expect(models).toContain("anthropic/claude-sonnet-4.5");
        expect(models).toContain("openai/gpt-4o");
      });
    });

    describe("getModelFamily", () => {
      it("identifies Claude models", () => {
        expect(getModelFamily("claude-sonnet-4.5")).toBe("claude");
        expect(getModelFamily("anthropic/claude-opus-4.5")).toBe("claude");
      });

      it("identifies GPT models", () => {
        expect(getModelFamily("gpt-4o")).toBe("gpt");
        expect(getModelFamily("openai/gpt-4-turbo")).toBe("gpt");
      });

      it("identifies Gemini models", () => {
        expect(getModelFamily("gemini-2.0-flash")).toBe("gemini");
      });

      it("returns other for unknown families", () => {
        expect(getModelFamily("unknown-model")).toBe("other");
      });
    });

    describe("modelSupports", () => {
      it("checks streaming support", () => {
        expect(modelSupports("claude-sonnet-4.5", "supportsStreaming")).toBe(true);
      });

      it("checks tool support", () => {
        // Use actual Anthropic model ID format
        expect(modelSupports("claude-sonnet-4-5-20250929", "supportsTools")).toBe(true);
      });

      it("checks MCP support", () => {
        // Use actual model ID formats
        expect(modelSupports("claude-sonnet-4-5-20250929", "supportsMCP")).toBe(true);
        expect(modelSupports("openai/gpt-4o", "supportsMCP")).toBe(false);
      });

      it("returns default for unknown models", () => {
        expect(modelSupports("unknown-model", "supportsStreaming")).toBe(true);
        expect(modelSupports("unknown-model", "supportsTools")).toBe(false);
      });
    });

    describe("findModelsWithCapabilities", () => {
      it("finds models with tool support", () => {
        const models = findModelsWithCapabilities({ supportsTools: true });
        expect(models.length).toBeGreaterThan(0);
        expect(models).toContain("claude-sonnet-4.5");
      });

      it("finds models with MCP support", () => {
        const models = findModelsWithCapabilities({ supportsMCP: true });
        // Only Claude models support MCP
        expect(models.every((m) => m.includes("claude"))).toBe(true);
      });

      it("finds models with minimum context length", () => {
        const models = findModelsWithCapabilities({ maxContextLength: 500000 });
        expect(models).toContain("gemini-1.5-pro"); // 2M context
      });

      it("returns provider-specific format", () => {
        const models = findModelsWithCapabilities({ supportsTools: true }, "openrouter");
        expect(models.some((m) => m.startsWith("anthropic/"))).toBe(true);
      });
    });
  });

  describe("ModelRouter", () => {
    let router: ModelRouter;

    beforeEach(() => {
      router = new ModelRouter({
        defaultProvider: "anthropic",
        defaultModel: "claude-sonnet-4.5",
      });
      // Register some providers
      router.registerProvider("anthropic");
      router.registerProvider("openrouter");
      router.registerProvider("ollama");
    });

    describe("basic routing", () => {
      it("routes to default provider in manual mode", () => {
        const result = router.route({});
        expect(result.provider).toBe("anthropic");
        expect(result.model).toBe("claude-sonnet-4.5");
        expect(result.reason).toContain("Manual");
      });

      it("uses specified model when provided", () => {
        const result = router.route({ model: "claude-opus-4.5" });
        expect(result.model).toBe("claude-opus-4.5");
      });
    });

    describe("rule-based routing", () => {
      beforeEach(() => {
        router = new ModelRouter({
          defaultProvider: "anthropic",
          routing: {
            mode: "rule-based",
            rules: [
              {
                id: "tools-rule",
                condition: { requiresTools: true },
                action: { provider: "anthropic", model: "claude-sonnet-4.5" },
                reason: "Tool support required",
              },
              {
                id: "local-rule",
                condition: { localOnly: true },
                action: { provider: "ollama", model: "llama3.2" },
                reason: "Local execution required",
              },
              {
                id: "coder-rule",
                condition: { agentType: ["coder", "reviewer"] },
                action: { provider: "anthropic", model: "claude-opus-4.5" },
                reason: "Coding tasks need best model",
              },
            ],
          },
        });
        router.registerProvider("anthropic");
        router.registerProvider("ollama");
      });

      it("matches tool requirement rule", () => {
        const result = router.route({ hasTools: true });
        expect(result.provider).toBe("anthropic");
        expect(result.model).toBe("claude-sonnet-4.5");
        expect(result.matchedRule?.id).toBe("tools-rule");
      });

      it("matches local-only rule", () => {
        const result = router.route({ localOnly: true });
        expect(result.provider).toBe("ollama");
        expect(result.model).toBe("llama3.2");
        expect(result.matchedRule?.id).toBe("local-rule");
      });

      it("matches agent type rule", () => {
        const result = router.route({ agentType: "coder" });
        expect(result.provider).toBe("anthropic");
        expect(result.model).toBe("claude-opus-4.5");
        expect(result.matchedRule?.id).toBe("coder-rule");
      });

      it("falls back to default when no rule matches", () => {
        const result = router.route({ agentType: "unknown" });
        expect(result.matchedRule).toBeUndefined();
      });

      it("respects rule priority", () => {
        router.addRule({
          id: "high-priority",
          priority: 100,
          condition: { agentType: ["coder"] },
          action: { provider: "openrouter", model: "anthropic/claude-opus-4.5" },
          reason: "High priority rule",
        });
        router.registerProvider("openrouter");

        const result = router.route({ agentType: "coder" });
        expect(result.matchedRule?.id).toBe("high-priority");
      });

      it("skips unavailable providers", () => {
        router.unregisterProvider("ollama");
        const result = router.route({ localOnly: true });
        // Should fall back since ollama is not available
        expect(result.provider).not.toBe("ollama");
      });

      it("can disable rules", () => {
        router.setRuleEnabled("tools-rule", false);
        const result = router.route({ hasTools: true });
        expect(result.matchedRule?.id).not.toBe("tools-rule");
      });
    });

    describe("cost-optimized routing", () => {
      beforeEach(() => {
        router = new ModelRouter({
          defaultProvider: "anthropic",
          routing: { mode: "cost-optimized" },
        });
        router.registerProvider("anthropic");
        router.registerProvider("ollama");
      });

      it("prefers cheaper providers", () => {
        const result = router.route({});
        // Ollama is free/local, should be preferred
        expect(result.provider).toBe("ollama");
        expect(result.reason).toContain("Cost-optimized");
      });

      it("provides alternatives", () => {
        router.registerProvider("openrouter");
        const result = router.route({});
        expect(result.alternatives).toBeDefined();
        expect(result.alternatives!.length).toBeGreaterThan(0);
      });
    });

    describe("performance-optimized routing", () => {
      beforeEach(() => {
        router = new ModelRouter({
          defaultProvider: "anthropic",
          routing: { mode: "performance-optimized" },
        });
        router.registerProvider("anthropic");
        router.registerProvider("openrouter");
      });

      it("uses metrics to select fastest provider", () => {
        // Record some metrics
        router.recordRequest("anthropic", { success: true, latency: 500 });
        router.recordRequest("anthropic", { success: true, latency: 600 });
        router.recordRequest("anthropic", { success: true, latency: 550 });
        router.recordRequest("anthropic", { success: true, latency: 520 });
        router.recordRequest("anthropic", { success: true, latency: 530 });
        router.recordRequest("anthropic", { success: true, latency: 510 });

        router.recordRequest("openrouter", { success: true, latency: 200 });
        router.recordRequest("openrouter", { success: true, latency: 250 });
        router.recordRequest("openrouter", { success: true, latency: 220 });
        router.recordRequest("openrouter", { success: true, latency: 230 });
        router.recordRequest("openrouter", { success: true, latency: 210 });
        router.recordRequest("openrouter", { success: true, latency: 240 });

        const result = router.route({});
        expect(result.provider).toBe("openrouter");
        expect(result.reason).toContain("Performance-optimized");
      });

      it("falls back to default with insufficient metrics", () => {
        const result = router.route({});
        expect(result.reason).toContain("insufficient metrics");
      });
    });

    describe("quality-optimized routing", () => {
      it("prefers highest quality models", () => {
        router = new ModelRouter({
          defaultProvider: "ollama",
          routing: { mode: "quality-optimized" },
        });
        router.registerProvider("anthropic");
        router.registerProvider("ollama");

        const result = router.route({});
        expect(result.provider).toBe("anthropic");
        expect(result.model).toBe("claude-opus-4.5");
      });
    });

    describe("rule management", () => {
      it("adds rules", () => {
        const initialCount = router.getRules().length;
        router.addRule({
          id: "new-rule",
          condition: { complexity: "high" },
          action: { provider: "anthropic", model: "claude-opus-4.5" },
        });
        expect(router.getRules().length).toBe(initialCount + 1);
      });

      it("removes rules", () => {
        router.addRule({
          id: "to-remove",
          condition: {},
          action: { provider: "anthropic", model: "claude-sonnet-4.5" },
        });
        const removed = router.removeRule("to-remove");
        expect(removed).toBe(true);
        expect(router.getRules().find((r) => r.id === "to-remove")).toBeUndefined();
      });

      it("returns false when removing non-existent rule", () => {
        expect(router.removeRule("non-existent")).toBe(false);
      });
    });

    describe("metrics", () => {
      it("records successful requests", () => {
        router.recordRequest("anthropic", {
          success: true,
          latency: 500,
          cost: 0.01,
          inputTokens: 100,
          outputTokens: 200,
        });

        const metrics = router.getMetrics();
        expect(metrics.totalCost).toBe(0.01);
        expect(metrics.totalTokens.input).toBe(100);
        expect(metrics.totalTokens.output).toBe(200);
        expect(metrics.providerBreakdown["anthropic"].requests).toBe(1);
        expect(metrics.providerBreakdown["anthropic"].avgLatency).toBe(500);
      });

      it("calculates rolling average latency", () => {
        router.recordRequest("anthropic", { success: true, latency: 100 });
        router.recordRequest("anthropic", { success: true, latency: 300 });

        const metrics = router.getMetrics();
        expect(metrics.providerBreakdown["anthropic"].avgLatency).toBe(200);
      });

      it("tracks error rate", () => {
        router.recordRequest("anthropic", { success: true, latency: 100 });
        router.recordRequest("anthropic", { success: false, latency: 0 });

        const metrics = router.getMetrics();
        expect(metrics.providerBreakdown["anthropic"].errors).toBe(1);
        expect(metrics.providerBreakdown["anthropic"].successRate).toBe(0.5);
      });

      it("resets metrics", () => {
        router.recordRequest("anthropic", { success: true, latency: 100, cost: 0.01 });
        router.resetMetrics();

        const metrics = router.getMetrics();
        expect(metrics.totalRequests).toBe(0);
        expect(metrics.totalCost).toBe(0);
      });

      it("increments total requests on route", () => {
        router.route({});
        router.route({});
        const metrics = router.getMetrics();
        expect(metrics.totalRequests).toBe(2);
      });

      it("tracks agent breakdown", () => {
        router.route({ agentType: "coder" });
        router.route({ agentType: "coder" });
        router.route({ agentType: "reviewer" });

        const metrics = router.getMetrics();
        expect(metrics.agentBreakdown!["coder"].requests).toBe(2);
        expect(metrics.agentBreakdown!["reviewer"].requests).toBe(1);
      });
    });

    describe("configuration", () => {
      it("gets configuration", () => {
        const config = router.getConfig();
        expect(config.defaultProvider).toBe("anthropic");
      });

      it("sets routing mode", () => {
        router.setRoutingMode("cost-optimized");
        expect(router.getConfig().routing!.mode).toBe("cost-optimized");
      });

      it("sets default provider", () => {
        router.setDefaultProvider("openrouter");
        expect(router.getConfig().defaultProvider).toBe("openrouter");
      });

      it("sets fallback chain", () => {
        router.setFallbackChain(["openrouter", "ollama"]);
        expect(router.getConfig().fallbackChain).toEqual(["openrouter", "ollama"]);
      });
    });

    describe("events", () => {
      it("emits route_selected event", () => {
        // Use manual mode router for predictable behavior
        const manualRouter = new ModelRouter({
          defaultProvider: "anthropic",
          routing: { mode: "manual" },
        });
        manualRouter.registerProvider("anthropic");

        const handler = jest.fn();
        manualRouter.on("router:route_selected", handler);

        manualRouter.route({ agentType: "coder" });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            params: expect.objectContaining({ agentType: "coder" }),
            result: expect.objectContaining({ provider: "anthropic" }),
          })
        );
      });

      it("emits config_changed event", () => {
        const handler = jest.fn();
        router.on("router:config_changed", handler);

        router.setRoutingMode("cost-optimized");

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "mode_changed",
            mode: "cost-optimized",
          })
        );
      });

      it("emits metrics_updated event", () => {
        const handler = jest.fn();
        router.on("router:metrics_updated", handler);

        router.recordRequest("anthropic", { success: true, latency: 100 });

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: "anthropic",
            success: true,
            latency: 100,
          })
        );
      });
    });

    describe("provider management", () => {
      it("registers providers", () => {
        const newRouter = createRouter();
        expect(newRouter.isProviderAvailable("gemini")).toBe(false);
        newRouter.registerProvider("gemini");
        expect(newRouter.isProviderAvailable("gemini")).toBe(true);
      });

      it("unregisters providers", () => {
        router.unregisterProvider("anthropic");
        expect(router.isProviderAvailable("anthropic")).toBe(false);
      });
    });
  });

  describe("createRouter factory", () => {
    it("creates router with default config", () => {
      const router = createRouter();
      expect(router).toBeInstanceOf(ModelRouter);
    });

    it("creates router with custom config", () => {
      const router = createRouter({
        defaultProvider: "openrouter",
        routing: { mode: "cost-optimized" },
      });
      const config = router.getConfig();
      expect(config.defaultProvider).toBe("openrouter");
      expect(config.routing.mode).toBe("cost-optimized");
    });
  });
});
