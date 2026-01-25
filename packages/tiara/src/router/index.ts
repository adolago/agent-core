/**
 * Router Module
 *
 * Intelligent model routing with rule-based selection, cost optimization,
 * and cross-provider model ID mapping.
 *
 * Ported from claude-flow v3 @agentic-flow/router
 *
 * @module tiara/router
 */

// Types
export type {
  ProviderType,
  ModelCapabilities,
  RoutingMode,
  ComplexityLevel,
  PrivacyLevel,
  RoutingCondition,
  RoutingAction,
  RoutingRule,
  RoutingConfig,
  RoutingParams,
  RoutingResult,
  ProviderMetricsBreakdown,
  RouterMetrics,
  ModelMapping,
  ModelFamily,
  RouteSelectedPayload,
  ProviderErrorPayload,
} from "./types.js";

export { RouterEventTypes } from "./types.js";

// Model Mapping
export {
  CLAUDE_MODELS,
  GPT_MODELS,
  GEMINI_MODELS,
  ALL_MODELS,
  mapModelId,
  getModelName,
  getModelCapabilities,
  listModels,
  getModelFamily,
  modelSupports,
  findModelsWithCapabilities,
} from "./model-mapping.js";

// Router
export { ModelRouter, createRouter } from "./router.js";
export type { RouterConfig } from "./router.js";
