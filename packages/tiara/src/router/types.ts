/**
 * Router Types
 *
 * Types for intelligent model routing and provider selection.
 * Complements the existing ProviderManager with rule-based routing.
 *
 * Ported from claude-flow v3 @agentic-flow/router
 *
 * @module tiara/router/types
 */

// =============================================================================
// Provider Types
// =============================================================================

/**
 * Supported provider types
 */
export type ProviderType =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "ollama"
  | "litellm"
  | "onnx"
  | "gemini"
  | "bedrock"
  | "custom";

/**
 * Model capability requirements
 */
export interface ModelCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsMCP: boolean;
  supportsVision: boolean;
  maxContextLength: number;
  maxOutputTokens: number;
}

// =============================================================================
// Routing Configuration
// =============================================================================

/**
 * Routing mode
 */
export type RoutingMode =
  | "manual"
  | "cost-optimized"
  | "performance-optimized"
  | "quality-optimized"
  | "rule-based";

/**
 * Complexity level for routing rules
 */
export type ComplexityLevel = "low" | "medium" | "high";

/**
 * Privacy level for routing rules
 */
export type PrivacyLevel = "low" | "medium" | "high";

/**
 * Routing rule condition
 */
export interface RoutingCondition {
  /** Match specific agent types */
  agentType?: string[];
  /** Require tool support */
  requiresTools?: boolean;
  /** Task complexity level */
  complexity?: ComplexityLevel;
  /** Privacy requirements */
  privacy?: PrivacyLevel;
  /** Require local execution only */
  localOnly?: boolean;
  /** Require advanced reasoning */
  requiresReasoning?: boolean;
  /** Require vision capabilities */
  requiresVision?: boolean;
  /** Minimum context length needed */
  minContextLength?: number;
  /** Custom condition function */
  custom?: (params: RoutingParams) => boolean;
}

/**
 * Routing rule action
 */
export interface RoutingAction {
  /** Target provider */
  provider: ProviderType;
  /** Target model */
  model: string;
  /** Override temperature */
  temperature?: number;
  /** Override max tokens */
  maxTokens?: number;
}

/**
 * Complete routing rule
 */
export interface RoutingRule {
  /** Unique rule ID */
  id?: string;
  /** Rule priority (higher = checked first) */
  priority?: number;
  /** Condition to match */
  condition: RoutingCondition;
  /** Action to take when matched */
  action: RoutingAction;
  /** Human-readable reason for this rule */
  reason?: string;
  /** Whether this rule is enabled */
  enabled?: boolean;
}

/**
 * Routing configuration
 */
export interface RoutingConfig {
  /** Routing mode */
  mode: RoutingMode;
  /** Routing rules (for rule-based mode) */
  rules?: RoutingRule[];
  /** Cost optimization settings */
  costOptimization?: {
    enabled: boolean;
    maxCostPerRequest?: number;
    budgetAlerts?: {
      daily?: number;
      monthly?: number;
    };
    preferCheaper?: boolean;
    costThreshold?: number;
  };
  /** Performance settings */
  performance?: {
    timeout?: number;
    concurrentRequests?: number;
    circuitBreaker?: {
      enabled: boolean;
      threshold: number;
      timeout: number;
      resetTimeout?: number;
    };
  };
}

// =============================================================================
// Routing Parameters
// =============================================================================

/**
 * Parameters for routing decisions
 */
export interface RoutingParams {
  /** Model requested */
  model?: string;
  /** Agent type making the request */
  agentType?: string;
  /** Whether tools are being used */
  hasTools?: boolean;
  /** Estimated complexity */
  complexity?: ComplexityLevel;
  /** Privacy requirements */
  privacy?: PrivacyLevel;
  /** Require local execution */
  localOnly?: boolean;
  /** Message count for context estimation */
  messageCount?: number;
  /** Estimated input tokens */
  estimatedInputTokens?: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of routing decision
 */
export interface RoutingResult {
  /** Selected provider */
  provider: ProviderType;
  /** Selected model */
  model: string;
  /** Rule that was matched (if any) */
  matchedRule?: RoutingRule;
  /** Reason for selection */
  reason: string;
  /** Alternative providers that could be used */
  alternatives?: Array<{
    provider: ProviderType;
    model: string;
    reason: string;
  }>;
}

// =============================================================================
// Router Metrics
// =============================================================================

/**
 * Provider metrics breakdown
 */
export interface ProviderMetricsBreakdown {
  requests: number;
  cost: number;
  avgLatency: number;
  errors: number;
  successRate: number;
}

/**
 * Aggregated router metrics
 */
export interface RouterMetrics {
  /** Total requests routed */
  totalRequests: number;
  /** Total cost incurred */
  totalCost: number;
  /** Total tokens used */
  totalTokens: {
    input: number;
    output: number;
  };
  /** Breakdown by provider */
  providerBreakdown: Record<string, ProviderMetricsBreakdown>;
  /** Breakdown by agent type */
  agentBreakdown?: Record<
    string,
    {
      requests: number;
      cost: number;
    }
  >;
  /** Breakdown by routing rule */
  ruleBreakdown?: Record<
    string,
    {
      matches: number;
      lastUsed: number;
    }
  >;
}

// =============================================================================
// Model Mapping Types
// =============================================================================

/**
 * Model ID mapping across providers
 */
export interface ModelMapping {
  /** Anthropic API format */
  anthropic: string;
  /** OpenRouter format */
  openrouter: string;
  /** AWS Bedrock format */
  bedrock?: string;
  /** Human-readable canonical name */
  canonical: string;
  /** Model capabilities */
  capabilities?: Partial<ModelCapabilities>;
}

/**
 * Model family (for grouping related models)
 */
export type ModelFamily = "claude" | "gpt" | "gemini" | "llama" | "mistral" | "phi" | "other";

// =============================================================================
// Router Events
// =============================================================================

/**
 * Router event types
 */
export enum RouterEventTypes {
  ROUTE_SELECTED = "router:route_selected",
  ROUTE_FALLBACK = "router:route_fallback",
  RULE_MATCHED = "router:rule_matched",
  PROVIDER_ERROR = "router:provider_error",
  METRICS_UPDATED = "router:metrics_updated",
  CONFIG_CHANGED = "router:config_changed",
}

/**
 * Route selected event payload
 */
export interface RouteSelectedPayload {
  params: RoutingParams;
  result: RoutingResult;
  timestamp: number;
}

/**
 * Provider error event payload
 */
export interface ProviderErrorPayload {
  provider: ProviderType;
  error: string;
  retryable: boolean;
  timestamp: number;
}
