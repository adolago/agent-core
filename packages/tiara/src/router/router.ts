/**
 * Model Router
 *
 * Intelligent model routing with rule-based selection, cost optimization,
 * and performance tracking. Complements ProviderManager with advanced
 * routing strategies.
 *
 * Ported from claude-flow v3 @agentic-flow/router
 *
 * @module tiara/router/router
 */

import { EventEmitter } from "events";
import type {
  ProviderType,
  RoutingConfig,
  RoutingRule,
  RoutingParams,
  RoutingResult,
  RoutingCondition,
  RouterMetrics,
  ProviderMetricsBreakdown,
  ComplexityLevel,
  RouterEventTypes,
} from "./types.js";
import { mapModelId, getModelCapabilities, modelSupports } from "./model-mapping.js";

// =============================================================================
// Router Configuration
// =============================================================================

/**
 * Router configuration options
 */
export interface RouterConfig {
  /** Default provider when no rule matches */
  defaultProvider: ProviderType;
  /** Default model when not specified */
  defaultModel?: string;
  /** Fallback chain for errors */
  fallbackChain?: ProviderType[];
  /** Routing configuration */
  routing?: RoutingConfig;
  /** Enable debug logging */
  debug?: boolean;
}

const DEFAULT_CONFIG: Required<RouterConfig> = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4.5",
  fallbackChain: ["anthropic", "openrouter"],
  routing: {
    mode: "manual",
    rules: [],
  },
  debug: false,
};

// =============================================================================
// Model Router
// =============================================================================

/**
 * Model Router
 *
 * Routes requests to the optimal provider/model based on rules,
 * cost, or performance metrics.
 *
 * @example
 * const router = new ModelRouter({
 *   defaultProvider: 'anthropic',
 *   routing: {
 *     mode: 'rule-based',
 *     rules: [
 *       {
 *         condition: { requiresTools: true },
 *         action: { provider: 'anthropic', model: 'claude-sonnet-4.5' },
 *         reason: 'Anthropic has best tool support'
 *       },
 *       {
 *         condition: { localOnly: true },
 *         action: { provider: 'ollama', model: 'llama3.2' },
 *         reason: 'Local execution required'
 *       }
 *     ]
 *   }
 * });
 *
 * const result = router.route({
 *   agentType: 'coder',
 *   hasTools: true,
 *   complexity: 'high'
 * });
 */
export class ModelRouter extends EventEmitter {
  private config: Required<RouterConfig>;
  private metrics: RouterMetrics;
  private availableProviders: Set<ProviderType> = new Set();

  constructor(config?: Partial<RouterConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<RouterConfig>;
    this.metrics = this.initializeMetrics();

    // Sort rules by priority
    if (this.config.routing.rules) {
      this.config.routing.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): RouterMetrics {
    return {
      totalRequests: 0,
      totalCost: 0,
      totalTokens: { input: 0, output: 0 },
      providerBreakdown: {},
      agentBreakdown: {},
      ruleBreakdown: {},
    };
  }

  /**
   * Register an available provider
   */
  registerProvider(provider: ProviderType): void {
    this.availableProviders.add(provider);
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(provider: ProviderType): void {
    this.availableProviders.delete(provider);
  }

  /**
   * Check if provider is available
   */
  isProviderAvailable(provider: ProviderType): boolean {
    return this.availableProviders.has(provider);
  }

  /**
   * Route a request to the optimal provider/model
   */
  route(params: RoutingParams): RoutingResult {
    const startTime = Date.now();

    let result: RoutingResult;

    switch (this.config.routing.mode) {
      case "rule-based":
        result = this.routeByRules(params);
        break;

      case "cost-optimized":
        result = this.routeByCost(params);
        break;

      case "performance-optimized":
        result = this.routeByPerformance(params);
        break;

      case "quality-optimized":
        result = this.routeByQuality(params);
        break;

      case "manual":
      default:
        result = this.routeManual(params);
        break;
    }

    // Update metrics
    this.metrics.totalRequests++;
    if (params.agentType) {
      if (!this.metrics.agentBreakdown![params.agentType]) {
        this.metrics.agentBreakdown![params.agentType] = { requests: 0, cost: 0 };
      }
      this.metrics.agentBreakdown![params.agentType].requests++;
    }

    // Emit event
    this.emit("router:route_selected", {
      params,
      result,
      timestamp: startTime,
    });

    if (this.config.debug) {
      console.log(`[Router] Selected ${result.provider}/${result.model}: ${result.reason}`);
    }

    return result;
  }

  /**
   * Route using manual/default selection
   */
  private routeManual(params: RoutingParams): RoutingResult {
    const provider = this.config.defaultProvider;
    const model = params.model || this.config.defaultModel;

    return {
      provider,
      model,
      reason: "Manual routing (default provider)",
    };
  }

  /**
   * Route using rule-based selection
   */
  private routeByRules(params: RoutingParams): RoutingResult {
    const rules = this.config.routing.rules || [];

    for (const rule of rules) {
      if (rule.enabled === false) continue;

      if (this.matchesRule(rule.condition, params)) {
        // Check if provider is available
        if (!this.isProviderAvailable(rule.action.provider)) {
          if (this.config.debug) {
            console.log(
              `[Router] Rule matched but provider ${rule.action.provider} unavailable`
            );
          }
          continue;
        }

        // Update rule metrics
        const ruleId = rule.id || `rule_${rules.indexOf(rule)}`;
        if (!this.metrics.ruleBreakdown![ruleId]) {
          this.metrics.ruleBreakdown![ruleId] = { matches: 0, lastUsed: 0 };
        }
        this.metrics.ruleBreakdown![ruleId].matches++;
        this.metrics.ruleBreakdown![ruleId].lastUsed = Date.now();

        return {
          provider: rule.action.provider,
          model: rule.action.model,
          matchedRule: rule,
          reason: rule.reason || "Matched routing rule",
        };
      }
    }

    // No rule matched, use default
    return this.routeManual(params);
  }

  /**
   * Check if params match a routing condition
   */
  private matchesRule(condition: RoutingCondition, params: RoutingParams): boolean {
    // Agent type check
    if (condition.agentType && params.agentType) {
      if (!condition.agentType.includes(params.agentType)) {
        return false;
      }
    }

    // Tool requirement check
    if (condition.requiresTools !== undefined) {
      if (condition.requiresTools && !params.hasTools) {
        return false;
      }
      if (!condition.requiresTools && params.hasTools) {
        return false;
      }
    }

    // Complexity check
    if (condition.complexity && params.complexity) {
      if (!this.complexityMatches(condition.complexity, params.complexity)) {
        return false;
      }
    }

    // Privacy check
    if (condition.privacy && params.privacy) {
      if (condition.privacy !== params.privacy) {
        return false;
      }
    }

    // Local only check
    if (condition.localOnly !== undefined) {
      if (condition.localOnly !== params.localOnly) {
        return false;
      }
    }

    // Vision requirement check
    if (condition.requiresVision && params.model) {
      if (!modelSupports(params.model, "supportsVision")) {
        return false;
      }
    }

    // Context length check
    if (condition.minContextLength && params.estimatedInputTokens) {
      const capabilities = params.model ? getModelCapabilities(params.model) : undefined;
      if (capabilities?.maxContextLength && capabilities.maxContextLength < condition.minContextLength) {
        return false;
      }
    }

    // Custom condition
    if (condition.custom) {
      if (!condition.custom(params)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if complexity levels match (condition allows same or higher)
   */
  private complexityMatches(required: ComplexityLevel, actual: ComplexityLevel): boolean {
    const levels: ComplexityLevel[] = ["low", "medium", "high"];
    return levels.indexOf(actual) >= levels.indexOf(required);
  }

  /**
   * Route by cost optimization
   */
  private routeByCost(params: RoutingParams): RoutingResult {
    // Provider cost ranking (lower = cheaper)
    const costRanking: ProviderType[] = [
      "ollama", // Local, free
      "onnx", // Local, free
      "openrouter", // Generally cheaper
      "gemini", // Competitive pricing
      "anthropic", // Premium pricing
      "openai", // Premium pricing
    ];

    for (const provider of costRanking) {
      if (this.isProviderAvailable(provider)) {
        const model = this.selectModelForProvider(provider, params);
        return {
          provider,
          model,
          reason: `Cost-optimized selection (${provider} is lowest cost available)`,
          alternatives: this.getAlternatives(provider, costRanking, params),
        };
      }
    }

    return this.routeManual(params);
  }

  /**
   * Route by performance optimization
   */
  private routeByPerformance(params: RoutingParams): RoutingResult {
    // Find provider with best latency metrics
    let bestProvider: ProviderType = this.config.defaultProvider;
    let bestLatency = Infinity;

    for (const [provider, breakdown] of Object.entries(this.metrics.providerBreakdown)) {
      if (
        this.isProviderAvailable(provider as ProviderType) &&
        breakdown.avgLatency < bestLatency &&
        breakdown.requests > 5 // Need minimum sample size
      ) {
        bestLatency = breakdown.avgLatency;
        bestProvider = provider as ProviderType;
      }
    }

    const model = this.selectModelForProvider(bestProvider, params);

    return {
      provider: bestProvider,
      model,
      reason:
        bestLatency < Infinity
          ? `Performance-optimized (${bestProvider} avg latency: ${bestLatency.toFixed(0)}ms)`
          : "Performance-optimized (default, insufficient metrics)",
    };
  }

  /**
   * Route by quality optimization
   */
  private routeByQuality(params: RoutingParams): RoutingResult {
    // Quality ranking (higher = better quality)
    const qualityRanking: Array<{ provider: ProviderType; model: string }> = [
      { provider: "anthropic", model: "claude-opus-4.5" },
      { provider: "anthropic", model: "claude-sonnet-4.5" },
      { provider: "openai", model: "gpt-4o" },
      { provider: "anthropic", model: "claude-sonnet-4" },
      { provider: "gemini", model: "gemini-2.0-flash" },
    ];

    for (const { provider, model } of qualityRanking) {
      if (this.isProviderAvailable(provider)) {
        return {
          provider,
          model,
          reason: `Quality-optimized (${model} is highest quality available)`,
        };
      }
    }

    return this.routeManual(params);
  }

  /**
   * Select appropriate model for a provider
   */
  private selectModelForProvider(provider: ProviderType, params: RoutingParams): string {
    // If specific model requested, translate to provider format
    if (params.model) {
      return mapModelId(params.model, provider as "anthropic" | "openrouter" | "bedrock");
    }

    // Default models per provider
    const defaults: Record<ProviderType, string> = {
      anthropic: "claude-sonnet-4.5",
      openai: "gpt-4o",
      openrouter: "anthropic/claude-sonnet-4.5",
      ollama: "llama3.2",
      litellm: "gpt-4o",
      onnx: "phi-4",
      gemini: "gemini-2.0-flash",
      bedrock: "anthropic.claude-sonnet-4-5-v2:0",
      custom: this.config.defaultModel,
    };

    return defaults[provider] || this.config.defaultModel;
  }

  /**
   * Get alternative providers
   */
  private getAlternatives(
    selectedProvider: ProviderType,
    ranking: ProviderType[],
    params: RoutingParams
  ): Array<{ provider: ProviderType; model: string; reason: string }> {
    return ranking
      .filter((p) => p !== selectedProvider && this.isProviderAvailable(p))
      .slice(0, 2)
      .map((provider) => ({
        provider,
        model: this.selectModelForProvider(provider, params),
        reason: "Alternative option",
      }));
  }

  // =============================================================================
  // Rule Management
  // =============================================================================

  /**
   * Add a routing rule
   */
  addRule(rule: RoutingRule): void {
    if (!this.config.routing.rules) {
      this.config.routing.rules = [];
    }

    this.config.routing.rules.push(rule);

    // Re-sort by priority
    this.config.routing.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    this.emit("router:config_changed", { type: "rule_added", rule });
  }

  /**
   * Remove a routing rule by ID
   */
  removeRule(ruleId: string): boolean {
    if (!this.config.routing.rules) return false;

    const index = this.config.routing.rules.findIndex((r) => r.id === ruleId);
    if (index !== -1) {
      const removed = this.config.routing.rules.splice(index, 1)[0];
      this.emit("router:config_changed", { type: "rule_removed", rule: removed });
      return true;
    }

    return false;
  }

  /**
   * Get all routing rules
   */
  getRules(): RoutingRule[] {
    return [...(this.config.routing.rules || [])];
  }

  /**
   * Enable or disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.config.routing.rules?.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
      this.emit("router:config_changed", { type: "rule_updated", rule });
      return true;
    }
    return false;
  }

  // =============================================================================
  // Metrics
  // =============================================================================

  /**
   * Record a completed request
   */
  recordRequest(
    provider: ProviderType,
    result: {
      success: boolean;
      latency: number;
      cost?: number;
      inputTokens?: number;
      outputTokens?: number;
    }
  ): void {
    // Initialize provider breakdown if needed
    if (!this.metrics.providerBreakdown[provider]) {
      this.metrics.providerBreakdown[provider] = {
        requests: 0,
        cost: 0,
        avgLatency: 0,
        errors: 0,
        successRate: 1,
      };
    }

    const breakdown = this.metrics.providerBreakdown[provider];

    // Update request count
    breakdown.requests++;

    // Update cost
    if (result.cost) {
      breakdown.cost += result.cost;
      this.metrics.totalCost += result.cost;
    }

    // Update latency (rolling average)
    breakdown.avgLatency =
      (breakdown.avgLatency * (breakdown.requests - 1) + result.latency) / breakdown.requests;

    // Update errors
    if (!result.success) {
      breakdown.errors++;
    }

    // Update success rate
    breakdown.successRate = 1 - breakdown.errors / breakdown.requests;

    // Update token counts
    if (result.inputTokens) {
      this.metrics.totalTokens.input += result.inputTokens;
    }
    if (result.outputTokens) {
      this.metrics.totalTokens.output += result.outputTokens;
    }

    this.emit("router:metrics_updated", { provider, ...result });
  }

  /**
   * Get current metrics
   */
  getMetrics(): RouterMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
  }

  // =============================================================================
  // Configuration
  // =============================================================================

  /**
   * Get current configuration
   */
  getConfig(): RouterConfig {
    return { ...this.config };
  }

  /**
   * Update routing mode
   */
  setRoutingMode(mode: RoutingConfig["mode"]): void {
    this.config.routing.mode = mode;
    this.emit("router:config_changed", { type: "mode_changed", mode });
  }

  /**
   * Set default provider
   */
  setDefaultProvider(provider: ProviderType): void {
    this.config.defaultProvider = provider;
    this.emit("router:config_changed", { type: "default_provider_changed", provider });
  }

  /**
   * Set fallback chain
   */
  setFallbackChain(chain: ProviderType[]): void {
    this.config.fallbackChain = chain;
    this.emit("router:config_changed", { type: "fallback_chain_changed", chain });
  }
}

/**
 * Create a model router with default configuration
 */
export function createRouter(config?: Partial<RouterConfig>): ModelRouter {
  return new ModelRouter(config);
}
