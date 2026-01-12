/**
 * Tiara - Agent Orchestration Interface
 *
 * This module bridges the Council deliberation system with the Personas orchestrator.
 * It exports the AgentOrchestrator interface expected by the council stages.
 */

import type { PersonaId } from "./personas/types";

/**
 * Result from spawning an agent
 */
export interface AgentSpawnResult {
  result?: unknown;
  error?: string;
  durationMs?: number;
}

/**
 * Options for spawning an agent
 */
export interface AgentSpawnOptions {
  agentType: string;
  action: string;
  params: Record<string, unknown>;
  context?: string;
}

/**
 * AgentOrchestrator interface expected by the Council deliberation system.
 * Provides agent spawning capabilities for multi-agent coordination.
 */
export interface AgentOrchestrator {
  /**
   * Spawn an agent to perform a specific action
   */
  spawnAgent(options: AgentSpawnOptions): Promise<AgentSpawnResult>;
}

// =============================================================================
// Comprehensive Agent Type Mappings (54+ agent types)
// =============================================================================

/**
 * Zee - Personal Assistant Domain
 * Handles: productivity, communication, organization, daily life tasks
 */
const ZEE_AGENT_TYPES = new Set([
  // Existing
  "inbox_manager",
  "scheduler",
  "task_coordinator",
  // Communication
  "email_assistant",
  "message_handler",
  "notification_manager",
  "contact_manager",
  "communication_coordinator",
  "social_media_manager",
  // Calendar & Time
  "calendar_manager",
  "meeting_scheduler",
  "reminder_assistant",
  "time_tracker",
  "event_coordinator",
  // Organization
  "file_organizer",
  "note_taker",
  "document_manager",
  "bookmark_organizer",
  "password_manager",
  // Daily Life
  "travel_planner",
  "shopping_assistant",
  "recipe_finder",
  "restaurant_recommender",
  "habit_tracker",
  "health_tracker",
  "fitness_planner",
  // Entertainment
  "music_curator",
  "movie_recommender",
  "podcast_finder",
  "news_aggregator",
  "book_recommender",
  // Generic Personal
  "personal_assistant",
  "life_admin",
  "general_helper",
]);

/**
 * Johny - Learning & Research Domain
 * Handles: education, research, knowledge synthesis, skill development
 */
const JOHNY_AGENT_TYPES = new Set([
  // Existing
  "research_assistant",
  // Research & Knowledge
  "knowledge_synthesizer",
  "fact_checker",
  "topic_explorer",
  "document_analyzer",
  "paper_summarizer",
  "citation_finder",
  "literature_reviewer",
  // Learning & Study
  "curriculum_designer",
  "study_planner",
  "quiz_maker",
  "flashcard_creator",
  "memory_trainer",
  "skill_assessor",
  "learning_path_designer",
  "concept_mapper",
  // Tutoring
  "code_tutor",
  "math_helper",
  "language_tutor",
  "science_explainer",
  "history_researcher",
  "philosophy_guide",
  "writing_coach",
  // Analysis
  "essay_writer",
  "argument_analyzer",
  "debate_helper",
  "critical_thinker",
  // Generic Learning
  "educator",
  "mentor",
  "academic_assistant",
]);

/**
 * Stanley - Finance & Investing Domain
 * Handles: markets, portfolio, trading, financial analysis
 */
const STANLEY_AGENT_TYPES = new Set([
  // Existing
  "market_analyst",
  "portfolio_manager",
  // Analysis Types
  "fundamental_analyst",
  "technical_analyst",
  "quantitative_analyst",
  "sentiment_analyst",
  "sector_analyst",
  "earnings_analyst",
  // Strategy
  "stock_screener",
  "options_strategist",
  "risk_assessor",
  "asset_allocator",
  "position_sizer",
  "rebalance_advisor",
  // Tracking
  "dividend_tracker",
  "performance_tracker",
  "watchlist_manager",
  "alert_manager",
  // Execution
  "backtest_runner",
  "trade_executor",
  "order_manager",
  // Specialized Markets
  "crypto_analyst",
  "forex_trader",
  "commodity_analyst",
  "bond_analyst",
  "etf_specialist",
  // Macro
  "macro_economist",
  "fed_watcher",
  "economic_indicator_tracker",
  // Tax & Compliance
  "tax_optimizer",
  "compliance_checker",
  // Generic Finance
  "financial_advisor",
  "investment_researcher",
  "wealth_manager",
]);

/**
 * Map council agent types to personas using comprehensive type sets
 */
function mapAgentTypeToPersona(agentType: string): PersonaId {
  const normalizedType = agentType.toLowerCase().replace(/[-\s]/g, "_");

  if (STANLEY_AGENT_TYPES.has(normalizedType)) {
    return "stanley";
  }

  if (JOHNY_AGENT_TYPES.has(normalizedType)) {
    return "johny";
  }

  if (ZEE_AGENT_TYPES.has(normalizedType)) {
    return "zee";
  }

  // Fallback heuristics based on keywords
  if (normalizedType.includes("market") || normalizedType.includes("invest") ||
      normalizedType.includes("trade") || normalizedType.includes("portfolio") ||
      normalizedType.includes("stock") || normalizedType.includes("finance")) {
    return "stanley";
  }

  if (normalizedType.includes("learn") || normalizedType.includes("study") ||
      normalizedType.includes("research") || normalizedType.includes("tutor") ||
      normalizedType.includes("education") || normalizedType.includes("knowledge")) {
    return "johny";
  }

  // Default to Zee for unknown types (general assistant)
  return "zee";
}

/**
 * Get all supported agent types
 */
export function getSupportedAgentTypes(): { zee: string[]; johny: string[]; stanley: string[] } {
  return {
    zee: Array.from(ZEE_AGENT_TYPES),
    johny: Array.from(JOHNY_AGENT_TYPES),
    stanley: Array.from(STANLEY_AGENT_TYPES),
  };
}

/**
 * Get persona for an agent type with confidence score
 */
export function getAgentPersonaWithConfidence(agentType: string): { persona: PersonaId; confidence: "high" | "medium" | "low" } {
  const normalizedType = agentType.toLowerCase().replace(/[-\s]/g, "_");

  if (STANLEY_AGENT_TYPES.has(normalizedType)) {
    return { persona: "stanley", confidence: "high" };
  }

  if (JOHNY_AGENT_TYPES.has(normalizedType)) {
    return { persona: "johny", confidence: "high" };
  }

  if (ZEE_AGENT_TYPES.has(normalizedType)) {
    return { persona: "zee", confidence: "high" };
  }

  // Check keyword heuristics
  const persona = mapAgentTypeToPersona(agentType);
  const usedHeuristic = persona !== "zee" || !ZEE_AGENT_TYPES.has(normalizedType);

  return {
    persona,
    confidence: usedHeuristic ? "medium" : "low",
  };
}

/**
 * Create an AgentOrchestrator adapter from the Personas Orchestrator
 */
export function createAgentOrchestrator(
  orchestrator: import("./personas/tiara").Orchestrator
): AgentOrchestrator {
  return {
    async spawnAgent(options: AgentSpawnOptions): Promise<AgentSpawnResult> {
      const startTime = Date.now();
      const persona = mapAgentTypeToPersona(options.agentType);

      try {
        // Build prompt from action and params
        const prompt = buildAgentPrompt(options);

        // Use spawnDroneWithWait to get the result
        const result = await orchestrator.spawnDroneWithWait({
          persona,
          task: `${options.agentType}: ${options.action}`,
          prompt,
        });

        return {
          result: result.result,
          error: result.error,
          durationMs: result.durationMs,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startTime,
        };
      }
    },
  };
}

/**
 * Build a prompt for the agent from spawn options
 */
function buildAgentPrompt(options: AgentSpawnOptions): string {
  const parts: string[] = [];

  parts.push(`## Agent Role: ${options.agentType}`);
  parts.push(`## Action: ${options.action}`);

  if (options.context) {
    parts.push(`\n## Context\n${options.context}`);
  }

  if (options.params.query) {
    parts.push(`\n## Query\n${options.params.query}`);
  }

  // Add any other params
  const otherParams = Object.entries(options.params).filter(
    ([key]) => key !== "query"
  );
  if (otherParams.length > 0) {
    parts.push(`\n## Parameters`);
    for (const [key, value] of otherParams) {
      parts.push(`- ${key}: ${JSON.stringify(value)}`);
    }
  }

  return parts.join("\n");
}

// Re-export Orchestrator for convenience
export { Orchestrator } from "./personas/tiara";
export type { PersonaId } from "./personas/types";
