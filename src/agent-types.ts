/**
 * Agent Types - Specialized agent type definitions for council and orchestration.
 *
 * This module defines the available specialized agent types that can participate
 * in council deliberations and be spawned by the orchestrator.
 */

import type { PersonaId } from "./personas/types.js";

// =============================================================================
// Specialized Agent Types
// =============================================================================

/**
 * All specialized agent types available in the system.
 * These map to the comprehensive agent type sets in src/tiara.ts
 */
export type SpecializedAgentType =
  // Zee - Personal Assistant Domain
  | "inbox_manager"
  | "scheduler"
  | "task_coordinator"
  | "email_assistant"
  | "message_handler"
  | "notification_manager"
  | "contact_manager"
  | "communication_coordinator"
  | "social_media_manager"
  | "calendar_manager"
  | "meeting_scheduler"
  | "reminder_assistant"
  | "time_tracker"
  | "event_coordinator"
  | "file_organizer"
  | "note_taker"
  | "document_manager"
  | "bookmark_organizer"
  | "password_manager"
  | "travel_planner"
  | "shopping_assistant"
  | "recipe_finder"
  | "restaurant_recommender"
  | "habit_tracker"
  | "health_tracker"
  | "fitness_planner"
  | "music_curator"
  | "movie_recommender"
  | "podcast_finder"
  | "news_aggregator"
  | "book_recommender"
  | "personal_assistant"
  | "life_admin"
  | "general_helper"
  // Johny - Learning & Research Domain
  | "research_assistant"
  | "knowledge_synthesizer"
  | "fact_checker"
  | "topic_explorer"
  | "document_analyzer"
  | "paper_summarizer"
  | "citation_finder"
  | "literature_reviewer"
  | "curriculum_designer"
  | "study_planner"
  | "quiz_maker"
  | "flashcard_creator"
  | "memory_trainer"
  | "skill_assessor"
  | "learning_path_designer"
  | "concept_mapper"
  | "code_tutor"
  | "math_helper"
  | "language_tutor"
  | "science_explainer"
  | "history_researcher"
  | "philosophy_guide"
  | "writing_coach"
  | "essay_writer"
  | "argument_analyzer"
  | "debate_helper"
  | "critical_thinker"
  | "educator"
  | "mentor"
  | "academic_assistant"
  // Stanley - Finance & Investing Domain
  | "market_analyst"
  | "portfolio_manager"
  | "fundamental_analyst"
  | "technical_analyst"
  | "quantitative_analyst"
  | "sentiment_analyst"
  | "sector_analyst"
  | "earnings_analyst"
  | "stock_screener"
  | "options_strategist"
  | "risk_assessor"
  | "asset_allocator"
  | "position_sizer"
  | "rebalance_advisor"
  | "dividend_tracker"
  | "performance_tracker"
  | "watchlist_manager"
  | "alert_manager"
  | "backtest_runner"
  | "trade_executor"
  | "order_manager"
  | "crypto_analyst"
  | "forex_trader"
  | "commodity_analyst"
  | "bond_analyst"
  | "etf_specialist"
  | "macro_economist"
  | "fed_watcher"
  | "economic_indicator_tracker"
  | "tax_optimizer"
  | "compliance_checker"
  | "financial_advisor"
  | "investment_researcher"
  | "wealth_manager";

// =============================================================================
// Agent Type Sets (for validation and routing)
// =============================================================================

/**
 * Zee - Personal Assistant Domain agent types
 */
export const ZEE_AGENT_TYPES: ReadonlySet<SpecializedAgentType> = new Set([
  "inbox_manager",
  "scheduler",
  "task_coordinator",
  "email_assistant",
  "message_handler",
  "notification_manager",
  "contact_manager",
  "communication_coordinator",
  "social_media_manager",
  "calendar_manager",
  "meeting_scheduler",
  "reminder_assistant",
  "time_tracker",
  "event_coordinator",
  "file_organizer",
  "note_taker",
  "document_manager",
  "bookmark_organizer",
  "password_manager",
  "travel_planner",
  "shopping_assistant",
  "recipe_finder",
  "restaurant_recommender",
  "habit_tracker",
  "health_tracker",
  "fitness_planner",
  "music_curator",
  "movie_recommender",
  "podcast_finder",
  "news_aggregator",
  "book_recommender",
  "personal_assistant",
  "life_admin",
  "general_helper",
]);

/**
 * Johny - Learning & Research Domain agent types
 */
export const JOHNY_AGENT_TYPES: ReadonlySet<SpecializedAgentType> = new Set([
  "research_assistant",
  "knowledge_synthesizer",
  "fact_checker",
  "topic_explorer",
  "document_analyzer",
  "paper_summarizer",
  "citation_finder",
  "literature_reviewer",
  "curriculum_designer",
  "study_planner",
  "quiz_maker",
  "flashcard_creator",
  "memory_trainer",
  "skill_assessor",
  "learning_path_designer",
  "concept_mapper",
  "code_tutor",
  "math_helper",
  "language_tutor",
  "science_explainer",
  "history_researcher",
  "philosophy_guide",
  "writing_coach",
  "essay_writer",
  "argument_analyzer",
  "debate_helper",
  "critical_thinker",
  "educator",
  "mentor",
  "academic_assistant",
]);

/**
 * Stanley - Finance & Investing Domain agent types
 */
export const STANLEY_AGENT_TYPES: ReadonlySet<SpecializedAgentType> = new Set([
  "market_analyst",
  "portfolio_manager",
  "fundamental_analyst",
  "technical_analyst",
  "quantitative_analyst",
  "sentiment_analyst",
  "sector_analyst",
  "earnings_analyst",
  "stock_screener",
  "options_strategist",
  "risk_assessor",
  "asset_allocator",
  "position_sizer",
  "rebalance_advisor",
  "dividend_tracker",
  "performance_tracker",
  "watchlist_manager",
  "alert_manager",
  "backtest_runner",
  "trade_executor",
  "order_manager",
  "crypto_analyst",
  "forex_trader",
  "commodity_analyst",
  "bond_analyst",
  "etf_specialist",
  "macro_economist",
  "fed_watcher",
  "economic_indicator_tracker",
  "tax_optimizer",
  "compliance_checker",
  "financial_advisor",
  "investment_researcher",
  "wealth_manager",
]);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the persona that handles a specific agent type.
 */
export function getAgentPersona(agentType: SpecializedAgentType): PersonaId {
  if (STANLEY_AGENT_TYPES.has(agentType)) return "stanley";
  if (JOHNY_AGENT_TYPES.has(agentType)) return "johny";
  return "zee"; // Default to Zee for unknown types
}

/**
 * Check if a string is a valid specialized agent type.
 */
export function isSpecializedAgentType(
  value: string
): value is SpecializedAgentType {
  return (
    ZEE_AGENT_TYPES.has(value as SpecializedAgentType) ||
    JOHNY_AGENT_TYPES.has(value as SpecializedAgentType) ||
    STANLEY_AGENT_TYPES.has(value as SpecializedAgentType)
  );
}

/**
 * Get all specialized agent types.
 */
export function getAllAgentTypes(): SpecializedAgentType[] {
  return [
    ...Array.from(ZEE_AGENT_TYPES),
    ...Array.from(JOHNY_AGENT_TYPES),
    ...Array.from(STANLEY_AGENT_TYPES),
  ];
}

/**
 * Get agent types by persona.
 */
export function getAgentTypesByPersona(
  persona: PersonaId
): SpecializedAgentType[] {
  switch (persona) {
    case "zee":
      return Array.from(ZEE_AGENT_TYPES);
    case "johny":
      return Array.from(JOHNY_AGENT_TYPES);
    case "stanley":
      return Array.from(STANLEY_AGENT_TYPES);
    default:
      return [];
  }
}
