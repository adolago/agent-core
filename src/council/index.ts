/**
 * Council Module
 *
 * Multi-LLM/Agent deliberation system for Clawdis.
 * Re-exports from orchestration for convenience.
 */

// Auth utilities
export * from "./auth/index.js";

// Re-export main council functionality from orchestration
export {
  council,
  quickCouncil,
  CouncilCoordinator,
  getDefaultCouncilCoordinator,
  resetDefaultCouncilCoordinator,
  createCouncilCoordinatorTool,
  CouncilCoordinatorDefinition,
} from "../agents/orchestration/council/index.js";

export type {
  CouncilConfig,
  CouncilMember,
  CouncilMode,
  CouncilResult,
  CouncilSession,
  LLMMember,
  AgentMember,
} from "../agents/orchestration/council/index.js";
